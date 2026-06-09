importScripts("core.js");

const core = globalThis.YTContextTranslatorCore;
const SETTINGS_KEY = "ytContextTranslatorSettings";
const VIDEO_MEMORY_CACHE_KEY = "ytContextTranslatorVideoMemoryCache";
const translationCache = new Map();
const MAX_CACHE_ITEMS = 300;
const API_TIMEOUT_MS = 18000;
const MAX_VIDEO_MEMORY_CHUNKS = 8;

function storageGet(keys) {
  return new Promise((resolve) => chrome.storage.local.get(keys, resolve));
}

function storageSet(value) {
  return new Promise((resolve) => chrome.storage.local.set(value, resolve));
}

async function readVideoMemoryCache() {
  const stored = await storageGet({
    [VIDEO_MEMORY_CACHE_KEY]: { items: {}, channelMemories: {} },
  });
  const cache = stored[VIDEO_MEMORY_CACHE_KEY] || {};
  return {
    items: cache.items && typeof cache.items === "object" ? cache.items : {},
    channelMemories:
      cache.channelMemories && typeof cache.channelMemories === "object"
        ? cache.channelMemories
        : {},
  };
}

async function writeVideoMemoryCache(cache) {
  await storageSet({
    [VIDEO_MEMORY_CACHE_KEY]: {
      items: cache?.items || {},
      channelMemories: cache?.channelMemories || {},
    },
  });
}

function videoMemoryCacheKey({ videoId, model, captionKind, cues }) {
  const sourceHash = core.createSourceCleanHash(
    (Array.isArray(cues) ? cues : [])
      .map((cue) => cue.source || "")
      .join("\n"),
  );
  return [
    videoId || "",
    model || "",
    captionKind || "unknown",
    core.TRANSLATION_PROMPT_VERSION,
    sourceHash,
  ].join("::");
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
    userGlossary: settings.userGlossary,
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
  const userGlossary = core.parseUserGlossary(settings.userGlossary);
  const glossaryVersion = core.createGlossaryVersion(userGlossary);
  const cacheKey = core.createCaptionCacheKey({
    provider: settings.provider,
    model,
    videoId: payload.videoId || "",
    currentText: payload.currentText || "",
    sourceLanguage: payload.sourceLanguage || "en",
    targetLanguage: payload.targetLanguage || "zh-CN",
    promptVersion: core.TRANSLATION_PROMPT_VERSION,
    glossaryVersion,
    sourceClean: payload.currentText || "",
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
    userGlossary,
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
  const userGlossary = core.parseUserGlossary(settings.userGlossary);
  const glossaryVersion = core.createGlossaryVersion(userGlossary);
  const captionKind = payload.captionKind || "unknown";
  const cues = (Array.isArray(payload.cues) ? payload.cues : [])
    .map((cue) => ({
      id: core.normalizeCaptionText(cue.id),
      start: Number(cue.start),
      end: Number(cue.end),
      source: core.normalizeCaptionText(cue.source),
    }))
    .filter((cue) => cue.id && cue.source);
  const sourceSegments = core.buildTranslationSegmentsFromCues(cues, {
    captionKind,
  });
  const cueSegmentMeta = sourceSegments.reduce((result, segment) => {
    segment.cues.forEach((cue) => {
      result[cue.id] = {
        segmentId: segment.id,
        sourceClean: cue.sourceClean,
      };
    });
    return result;
  }, {});

  const translations = [];
  const pending = [];

  for (const cue of cues) {
    const cacheKey = core.createCaptionCacheKey({
      provider: settings.provider,
      model,
      videoId,
      currentText: cue.source,
      sourceLanguage: payload.sourceLanguage || "en",
      targetLanguage: payload.targetLanguage || "zh-CN",
      promptVersion: core.TRANSLATION_PROMPT_VERSION,
      glossaryVersion,
      segmentId: cueSegmentMeta[cue.id]?.segmentId || "",
      sourceClean: cueSegmentMeta[cue.id]?.sourceClean || cue.source,
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

  const outputSegments = core.buildTranslationSegmentsFromCues(pending, {
    captionKind,
  });
  const prompt = core.buildSegmentTranslationPrompt({
    outputSegments,
    nonOutputContextBefore: payload.nonOutputContextBefore || [],
    nonOutputContextAfter: payload.nonOutputContextAfter || [],
    videoMemory: payload.videoMemory || {},
    metadata: payload.metadata || {},
    customInstructions: settings.customInstructions,
    userGlossary,
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
  const videoGlossary = Array.isArray(payload.videoMemory?.glossary)
    ? payload.videoMemory.glossary
    : [];
  const userGlossarySources = new Set(
    userGlossary.map((item) => item.source.toLowerCase()),
  );
  const reviewGlossary = userGlossary.concat(
    videoGlossary.filter(
      (item) => !userGlossarySources.has(core.normalizeCaptionText(item.source).toLowerCase()),
    ),
  );
  const consistentTranslationMap = core.applyGlossaryConsistency({
    cueTranslations: translationMap,
    cueSources: pending.reduce((result, cue) => {
      result[cue.id] = cue.source;
      return result;
    }, {}),
    glossary: reviewGlossary,
  });

  for (const cue of pending) {
    const translation = core.normalizeCaptionText(consistentTranslationMap[cue.id]);
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

async function fetchVideoMemory(payload) {
  const settings = await getSettings();
  if (!settings.enabled) {
    return {
      skipped: true,
      reason: "disabled",
      videoMemory: core.mergeVideoMemoryItems([]),
    };
  }
  if (!core.getApiKeyForProvider(settings)) {
    return {
      skipped: true,
      reason: "missing-api-key",
      videoMemory: core.mergeVideoMemoryItems([]),
    };
  }

  const model = core.getModelForProvider(settings);
  const cache = await readVideoMemoryCache();
  const cacheKey = videoMemoryCacheKey({
    videoId: payload.videoId || "",
    model,
    captionKind: payload.captionKind,
    cues: payload.cues || [],
  });
  if (cache.items[cacheKey]) {
    return {
      videoMemory: cache.items[cacheKey],
      provider: settings.provider,
      model,
      cached: true,
    };
  }

  const channelKey = core.normalizeCaptionText(payload.metadata?.channel)
    .toLowerCase();
  const channelMemory = channelKey
    ? cache.channelMemories[channelKey] || core.mergeVideoMemoryItems([])
    : core.mergeVideoMemoryItems([]);
  const chunks = core.buildVideoMemoryChunks(payload.cues || [], {
    captionKind: payload.captionKind,
    chunkSize: 20,
    overlap: 2,
    maxChunks: MAX_VIDEO_MEMORY_CHUNKS,
  });
  const items = [];

  for (const chunk of chunks) {
    const prompt = core.buildVideoMemoryPrompt({
      chunk,
      metadata: payload.metadata || {},
      captionKind: payload.captionKind,
    });
    const { url, requestOptions } = buildAuthorizedRequest(
      settings,
      prompt,
      1200,
    );
    try {
      const response = await fetchWithTimeout(url, requestOptions, API_TIMEOUT_MS);
      if (!response.ok) {
        continue;
      }
      const responseText = await readResponseText(settings.provider, response);
      items.push(core.parseVideoMemoryResponse(responseText));
    } catch (_error) {
      // Video memory is a quality enhancement; subtitle translation should continue.
    }
  }
  let videoMemory = core.mergeVideoMemoryItems(items);
  if (items.length > 0) {
    const reducePrompt = core.buildVideoMemoryReducePrompt({
      items,
      channelMemory,
      metadata: payload.metadata || {},
    });
    const { url, requestOptions } = buildAuthorizedRequest(
      settings,
      reducePrompt,
      1600,
    );
    try {
      const response = await fetchWithTimeout(url, requestOptions, API_TIMEOUT_MS);
      if (response.ok) {
        const responseText = await readResponseText(settings.provider, response);
        videoMemory = core.parseVideoMemoryResponse(responseText);
      }
    } catch (_error) {
      // Fall back to deterministic reduce if the final reduce request fails.
    }
  }

  cache.items[cacheKey] = videoMemory;
  if (channelKey) {
    cache.channelMemories[channelKey] = core.mergeVideoMemoryItems([
      channelMemory,
      videoMemory,
    ]);
  }
  await writeVideoMemoryCache(cache);

  return {
    videoMemory,
    provider: settings.provider,
    model,
  };
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

  if (message.type === "YTCT_ANALYZE_VIDEO_MEMORY") {
    fetchVideoMemory(message.payload || {})
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
