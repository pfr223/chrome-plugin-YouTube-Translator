importScripts("core.js");

const core = globalThis.YTContextTranslatorCore;
const SETTINGS_KEY = "ytContextTranslatorSettings";
const translationCache = new Map();
const MAX_CACHE_ITEMS = 300;
const API_TIMEOUT_MS = 18000;

function storageGet(keys) {
  return new Promise((resolve) => chrome.storage.local.get(keys, resolve));
}

function storageSet(value) {
  return new Promise((resolve) => chrome.storage.local.set(value, resolve));
}

async function getSettings() {
  const stored = await storageGet({ [SETTINGS_KEY]: {} });
  return core.normalizeSettings(stored[SETTINGS_KEY]);
}

function publicSettings(settings) {
  return {
    enabled: settings.enabled,
    provider: settings.provider,
    geminiModel: settings.geminiModel,
    deepseekModel: settings.deepseekModel,
    openrouterModel: settings.openrouterModel,
    contextItems: settings.contextItems,
    customInstructions: settings.customInstructions,
    overlayOpacityPercent: settings.overlayOpacityPercent,
    overlayFontScalePercent: settings.overlayFontScalePercent,
    overlayXPercent: settings.overlayXPercent,
    overlayYPercent: settings.overlayYPercent,
    hasApiKey: Boolean(core.getApiKeyForProvider(settings)),
    geminiHasApiKey: Boolean(settings.geminiApiKey),
    deepseekHasApiKey: Boolean(settings.deepseekApiKey),
    openrouterHasApiKey: Boolean(settings.openrouterApiKey),
  };
}

function broadcastSettings(settings) {
  chrome.tabs.query(
    { url: ["https://www.youtube.com/*", "https://m.youtube.com/*"] },
    (tabs) => {
      for (const tab of tabs) {
        if (tab.id) {
          chrome.tabs.sendMessage(tab.id, {
            type: "YTCT_PUBLIC_SETTINGS_UPDATED",
            settings: publicSettings(settings),
          }, () => {
            void chrome.runtime.lastError;
          });
        }
      }
    },
  );
}

function rememberCache(key, value) {
  if (translationCache.has(key)) {
    translationCache.delete(key);
  }
  translationCache.set(key, value);
  while (translationCache.size > MAX_CACHE_ITEMS) {
    translationCache.delete(translationCache.keys().next().value);
  }
}

async function readResponseText(provider, response) {
  const data = await response.json();
  return core.extractProviderResponseText(provider, data);
}

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error("API 请求超时，请检查网络或换用更快的模型。");
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function fetchTranslation(payload) {
  const settings = await getSettings();
  if (!settings.enabled) {
    return { skipped: true, reason: "disabled" };
  }
  const apiKey = core.getApiKeyForProvider(settings);
  if (!apiKey) {
    throw new Error("请先在扩展设置中填写 API key。");
  }

  const context = Array.isArray(payload.context) ? payload.context : [];
  const model = core.getModelForProvider(settings);
  const cacheKey = core.createCaptionCacheKey({
    provider: settings.provider,
    model,
    videoId: payload.videoId || "",
    currentText: payload.currentText || "",
    context,
  });

  if (translationCache.has(cacheKey)) {
    return translationCache.get(cacheKey);
  }

  const prompt = core.buildTranslationPrompt({
    currentText: payload.currentText,
    context,
    metadata: payload.metadata || {},
    customInstructions: settings.customInstructions,
    maxContextItems: settings.contextItems,
  });
  const request = core.buildProviderRequest({
    provider: settings.provider,
    model,
    prompt,
  });
  const requestOptions = {
    ...request.options,
    headers: { ...(request.options.headers || {}) },
  };
  let url = request.url;

  if (settings.provider === "gemini") {
    url = `${url}?key=${encodeURIComponent(apiKey)}`;
  } else {
    requestOptions.headers.authorization = `Bearer ${apiKey}`;
  }

  const response = await fetchWithTimeout(url, requestOptions, API_TIMEOUT_MS);
  if (!response.ok) {
    const message = await response.text();
    throw new Error(`API 请求失败：${response.status} ${message.slice(0, 240)}`);
  }

  const responseText = await readResponseText(settings.provider, response);
  const translation = core.extractTranslationFromText(responseText);
  if (!translation) {
    throw new Error("API 没有返回可用翻译。");
  }

  const result = {
    translation,
    provider: settings.provider,
    model,
  };
  rememberCache(cacheKey, result);
  return result;
}

function buildAuthorizedRequest(settings, prompt, maxOutputTokens) {
  const apiKey = core.getApiKeyForProvider(settings);
  const model = core.getModelForProvider(settings);
  const request = core.buildProviderRequest({
    provider: settings.provider,
    model,
    prompt,
    maxOutputTokens,
  });
  const requestOptions = {
    ...request.options,
    headers: { ...(request.options.headers || {}) },
  };
  let url = request.url;

  if (settings.provider === "gemini") {
    url = `${url}?key=${encodeURIComponent(apiKey)}`;
  } else {
    requestOptions.headers.authorization = `Bearer ${apiKey}`;
  }

  return { model, url, requestOptions };
}

async function fetchBatchTranslation(payload) {
  const settings = await getSettings();
  if (!settings.enabled) {
    return { skipped: true, reason: "disabled", translations: [] };
  }
  if (!core.getApiKeyForProvider(settings)) {
    throw new Error("请先在扩展设置中填写 API key。");
  }

  const model = core.getModelForProvider(settings);
  const videoId = payload.videoId || "";
  const cues = (Array.isArray(payload.cues) ? payload.cues : [])
    .map((cue) => ({
      id: core.normalizeCaptionText(cue.id),
      start: Number(cue.start),
      end: Number(cue.end),
      source: core.normalizeCaptionText(cue.source),
    }))
    .filter((cue) => cue.id && cue.source);

  const translations = [];
  const pending = [];

  for (const cue of cues) {
    const cacheKey = core.createCaptionCacheKey({
      provider: settings.provider,
      model,
      videoId,
      currentText: cue.source,
      context: [],
    });
    if (translationCache.has(cacheKey)) {
      translations.push({
        id: cue.id,
        translation: translationCache.get(cacheKey).translation,
      });
    } else {
      pending.push({ ...cue, cacheKey });
    }
  }

  if (pending.length === 0) {
    return { translations, provider: settings.provider, model };
  }

  const outputSegments = core.buildTranslationSegmentsFromCues(pending);
  const prompt = core.buildSegmentTranslationPrompt({
    outputSegments,
    nonOutputContextBefore: payload.nonOutputContextBefore || [],
    nonOutputContextAfter: payload.nonOutputContextAfter || [],
    videoMemory: payload.videoMemory || {},
    metadata: payload.metadata || {},
    customInstructions: settings.customInstructions,
  });
  const { url, requestOptions } = buildAuthorizedRequest(
    settings,
    prompt,
    Math.min(8192, 512 + pending.length * 140 + outputSegments.length * 180),
  );
  const response = await fetchWithTimeout(url, requestOptions, API_TIMEOUT_MS);
  if (!response.ok) {
    const message = await response.text();
    throw new Error(`API 请求失败：${response.status} ${message.slice(0, 240)}`);
  }

  const responseText = await readResponseText(settings.provider, response);
  const parsedSegments = core.parseSegmentTranslationResponse(responseText);
  const translationMap =
    Object.keys(parsedSegments.cueTranslations).length > 0
      ? parsedSegments.cueTranslations
      : core.parseBatchTranslationResponse(responseText);

  for (const cue of pending) {
    const translation = core.normalizeCaptionText(translationMap[cue.id]);
    if (!translation) {
      continue;
    }
    const result = {
      translation,
      provider: settings.provider,
      model,
    };
    rememberCache(cue.cacheKey, result);
    translations.push({ id: cue.id, translation });
  }

  return { translations, provider: settings.provider, model };
}

async function saveSettings(nextSettings) {
  const previous = await getSettings();
  const incoming = { ...(nextSettings || {}) };
  const incomingApiKey =
    typeof incoming.apiKey === "string" ? incoming.apiKey.trim() : "";
  if (incomingApiKey) {
    const provider =
      incoming.provider === "deepseek" || incoming.provider === "openrouter"
        ? incoming.provider
        : previous.provider;
    if (provider === "deepseek") {
      incoming.deepseekApiKey = incomingApiKey;
    } else if (provider === "openrouter") {
      incoming.openrouterApiKey = incomingApiKey;
    } else {
      incoming.geminiApiKey = incomingApiKey;
    }
  }
  delete incoming.apiKey;
  const merged = core.normalizeSettings({ ...previous, ...incoming });
  await storageSet({ [SETTINGS_KEY]: merged });
  broadcastSettings(merged);
  return publicSettings(merged);
}

chrome.runtime.onInstalled.addListener(async () => {
  const current = await getSettings();
  await storageSet({ [SETTINGS_KEY]: current });
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || typeof message.type !== "string") {
    return false;
  }

  if (message.type === "YTCT_GET_SETTINGS") {
    getSettings()
      .then((settings) => sendResponse({ ok: true, settings: publicSettings(settings) }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message.type === "YTCT_SAVE_SETTINGS") {
    saveSettings(message.settings || {})
      .then((settings) => sendResponse({ ok: true, settings }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message.type === "YTCT_TRANSLATE") {
    fetchTranslation(message.payload || {})
      .then((result) => sendResponse({ ok: true, result }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message.type === "YTCT_TRANSLATE_BATCH") {
    fetchBatchTranslation(message.payload || {})
      .then((result) => sendResponse({ ok: true, result }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message.type === "YTCT_TEST_TRANSLATION") {
    fetchTranslation({
      videoId: "settings-test",
      currentText: "the q value is updated at a given point of time",
      context: [
        {
          source: "we are discussing reinforcement learning and bandits",
          translation: "我们在讨论强化学习和多臂老虎机问题",
        },
      ],
      metadata: {
        title: "Settings test",
        channel: "Local extension",
        url: "chrome-extension://settings",
      },
    })
      .then((result) => sendResponse({ ok: true, result }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  return false;
});
