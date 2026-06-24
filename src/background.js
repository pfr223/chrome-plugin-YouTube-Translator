importScripts("core.js");

const core = globalThis.YTContextTranslatorCore;
const SETTINGS_KEY = "ytContextTranslatorSettings";
const VIDEO_MEMORY_CACHE_KEY = "ytContextTranslatorVideoMemoryCache";
const translationCache = new Map();
const summaryCache = new Map();
const webPageTranslationCache = new Map();
const webPageMemoryCache = new Map();
const MAX_CACHE_ITEMS = 300;
const MAX_SUMMARY_CACHE_ITEMS = 40;
const MAX_WEB_PAGE_CACHE_ITEMS = 500;
const MAX_WEB_PAGE_MEMORY_CACHE_ITEMS = 80;
const API_TIMEOUT_MS = 18000;
const SUMMARY_API_TIMEOUT_MS = 45000;
const WEB_PAGE_API_TIMEOUT_MS = 45000;
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
    sourceDisplayMode: settings.sourceDisplayMode,
    syncStrategy: settings.syncStrategy,
    webTranslationEnabled: settings.webTranslationEnabled,
    webTranslationTargetLanguage: settings.webTranslationTargetLanguage,
    webTranslationDisplayMode: settings.webTranslationDisplayMode,
    webTranslationScope: settings.webTranslationScope,
    webTranslationSiteRules: settings.webTranslationSiteRules,
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

function rememberSummaryCache(key, value) {
  if (summaryCache.has(key)) {
    summaryCache.delete(key);
  }
  summaryCache.set(key, value);
  while (summaryCache.size > MAX_SUMMARY_CACHE_ITEMS) {
    summaryCache.delete(summaryCache.keys().next().value);
  }
}

function rememberWebPageCache(key, value) {
  if (webPageTranslationCache.has(key)) {
    webPageTranslationCache.delete(key);
  }
  webPageTranslationCache.set(key, value);
  while (webPageTranslationCache.size > MAX_WEB_PAGE_CACHE_ITEMS) {
    webPageTranslationCache.delete(webPageTranslationCache.keys().next().value);
  }
}

function rememberWebPageMemoryCache(key, value) {
  if (webPageMemoryCache.has(key)) {
    webPageMemoryCache.delete(key);
  }
  webPageMemoryCache.set(key, value);
  while (webPageMemoryCache.size > MAX_WEB_PAGE_MEMORY_CACHE_ITEMS) {
    webPageMemoryCache.delete(webPageMemoryCache.keys().next().value);
  }
}

function webPageMemoryCacheKey({ pageContext, model, glossaryVersion, blocks }) {
  const sourceHash = core.createSourceCleanHash(
    (Array.isArray(blocks) ? blocks : [])
      .slice(0, 80)
      .map((block) => block.text || "")
      .join("\n"),
  );
  return [
    core.createWebPageTranslationCacheKey({
      provider: "",
      model,
      pageUrl: pageContext?.url || "",
      sourceLanguage: pageContext?.language || "auto",
      targetLanguage: "",
      promptVersion: `${core.WEB_TRANSLATION_PROMPT_VERSION}:memory`,
      glossaryVersion,
      sourceTextHash: sourceHash,
      headingPath: [pageContext?.title || ""],
    }),
  ].join("::");
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
  const segmentTranslations = parsedSegments.segmentTranslations || {};
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

  return {
    translations,
    segmentTranslations: Object.entries(segmentTranslations).map(
      ([id, value]) => ({ id, ...value }),
    ),
    provider: settings.provider,
    model,
  };
}

async function fetchWebPagePromptText(settings, prompt, maxOutputTokens) {
  const { url, requestOptions } = buildAuthorizedRequest(
    settings,
    prompt,
    maxOutputTokens,
  );
  const response = await fetchWithTimeout(
    url,
    requestOptions,
    WEB_PAGE_API_TIMEOUT_MS,
  );
  if (!response.ok) {
    const message = await response.text();
    throw new Error(`API 请求失败：${response.status} ${message.slice(0, 240)}`);
  }
  return readResponseText(settings.provider, response);
}

function normalizeWebPagePayloadBlock(block) {
  return {
    id: core.normalizeCaptionText(block?.id),
    text: core.normalizeCaptionText(block?.text),
    tagName: core.normalizeCaptionText(block?.tagName || "block"),
    role: core.normalizeCaptionText(block?.role || ""),
    headingPath: (Array.isArray(block?.headingPath) ? block.headingPath : [])
      .map(core.normalizeCaptionText)
      .filter(Boolean),
    protectedTerms: core.normalizeWebPageProtectedTerms(
      block?.protectedTerms || block?.protected_terms,
    ),
  };
}

async function fetchWebPageTranslationBatch(payload) {
  const settings = await getSettings();
  if (!settings.enabled || !settings.webTranslationEnabled) {
    return { skipped: true, reason: "disabled", translations: [] };
  }
  if (!core.getApiKeyForProvider(settings)) {
    throw new Error("请先在扩展设置中填写 API key。");
  }

  const model = core.getModelForProvider(settings);
  const userGlossary = core.parseUserGlossary(settings.userGlossary);
  const glossaryVersion = core.createGlossaryVersion(userGlossary);
  const pageContext =
    payload.pageContext && typeof payload.pageContext === "object"
      ? payload.pageContext
      : {};
  const pageMemory =
    payload.pageMemory && typeof payload.pageMemory === "object"
      ? payload.pageMemory
      : {};
  const sourceLanguage =
    payload.sourceLanguage || pageContext.language || "auto";
  const targetLanguage =
    payload.targetLanguage ||
    settings.webTranslationTargetLanguage ||
    "zh-CN";
  const blocks = (Array.isArray(payload.blocks) ? payload.blocks : [])
    .map(normalizeWebPagePayloadBlock)
    .filter((block) => block.id && block.text);
  const translations = [];
  const pending = [];

  for (const block of blocks) {
    const cacheKey = core.createWebPageTranslationCacheKey({
      provider: settings.provider,
      model,
      pageUrl: pageContext.url || payload.pageUrl || "",
      sourceLanguage,
      targetLanguage,
      promptVersion: core.WEB_TRANSLATION_PROMPT_VERSION,
      glossaryVersion,
      sourceText: block.text,
      headingPath: block.headingPath,
      protectedTerms: block.protectedTerms,
    });
    if (webPageTranslationCache.has(cacheKey)) {
      const cachedTranslation = webPageTranslationCache.get(cacheKey).translation;
      const cachedValidation = core.validateWebPageTranslationResult({
        blocks: [block],
        translations: { [block.id]: cachedTranslation },
      });
      if (cachedValidation.ok) {
        translations.push({ id: block.id, translation: cachedTranslation });
      } else {
        pending.push({ ...block, cacheKey });
      }
    } else {
      pending.push({ ...block, cacheKey });
    }
  }

  if (pending.length === 0) {
    return {
      translations,
      glossary: [],
      provider: settings.provider,
      model,
      cached: true,
    };
  }

  const prompt = core.buildWebPageTranslationPrompt({
    blocks: pending,
    nonOutputContextBefore: payload.nonOutputContextBefore || [],
    nonOutputContextAfter: payload.nonOutputContextAfter || [],
    pageContext,
    pageMemory,
    customInstructions: settings.customInstructions,
    userGlossary,
    targetLanguage,
  });
  const responseText = await fetchWebPagePromptText(
    settings,
    prompt,
    Math.min(8192, 512 + pending.length * 260),
  );
  const parsed = core.parseWebPageTranslationResponse(responseText);
  const pageGlossary = Array.isArray(pageMemory.glossary)
    ? pageMemory.glossary
    : [];
  const userGlossarySources = new Set(
    userGlossary.map((item) => item.source.toLowerCase()),
  );
  const reviewGlossary = userGlossary.concat(
    pageGlossary.filter(
      (item) =>
        !userGlossarySources.has(
          core.normalizeCaptionText(item.source).toLowerCase(),
        ),
    ),
  );
  const translationMap = core.applyGlossaryConsistency({
    cueTranslations: parsed.translations,
    cueSources: pending.reduce((result, block) => {
      result[block.id] = block.text;
      return result;
    }, {}),
    glossary: reviewGlossary,
  });
  const validation = core.validateWebPageTranslationResult({
    blocks: pending,
    translations: translationMap,
  });
  let finalTranslationMap = validation.validTranslations;
  let resultGlossary = parsed.glossary || [];

  if (validation.retryIds.length > 0) {
    const retryIds = new Set(validation.retryIds);
    const retryBlocks = pending.filter((block) => retryIds.has(block.id));
    try {
      const repairPrompt = core.buildWebPageRepairPrompt({
        blocks: retryBlocks,
        pageContext,
        pageMemory,
        customInstructions: settings.customInstructions,
        userGlossary,
        targetLanguage,
        reason: validation.reason,
      });
      const repairText = await fetchWebPagePromptText(
        settings,
        repairPrompt,
        Math.min(4096, 512 + retryBlocks.length * 260),
      );
      const repairParsed = core.parseWebPageTranslationResponse(repairText);
      const repairMap = core.applyGlossaryConsistency({
        cueTranslations: repairParsed.translations,
        cueSources: retryBlocks.reduce((result, block) => {
          result[block.id] = block.text;
          return result;
        }, {}),
        glossary: reviewGlossary,
      });
      const repairValidation = core.validateWebPageTranslationResult({
        blocks: retryBlocks,
        translations: repairMap,
      });
      finalTranslationMap = {
        ...finalTranslationMap,
        ...repairValidation.validTranslations,
      };
      resultGlossary = resultGlossary.concat(repairParsed.glossary || []);
    } catch (_error) {
      // Keep the valid first-pass translations and leave failed blocks pending.
    }
  }

  for (const block of pending) {
    const translation = core.normalizeCaptionText(finalTranslationMap[block.id]);
    if (!translation) {
      continue;
    }
    const result = {
      translation,
      provider: settings.provider,
      model,
    };
    rememberWebPageCache(block.cacheKey, result);
    translations.push({ id: block.id, translation });
  }

  return {
    translations,
    glossary: resultGlossary,
    provider: settings.provider,
    model,
    cached: false,
    repaired: validation.retryIds.length > 0,
  };
}

async function fetchWebPageMemory(payload) {
  const settings = await getSettings();
  const emptyMemory = {
    summary: "",
    domain: "",
    styleGuide: "",
    glossary: [],
    entities: [],
  };
  if (!settings.enabled || !settings.webTranslationEnabled) {
    return { skipped: true, reason: "disabled", pageMemory: emptyMemory };
  }
  if (!core.getApiKeyForProvider(settings)) {
    return { skipped: true, reason: "missing-api-key", pageMemory: emptyMemory };
  }

  const model = core.getModelForProvider(settings);
  const userGlossary = core.parseUserGlossary(settings.userGlossary);
  const glossaryVersion = core.createGlossaryVersion(userGlossary);
  const pageContext =
    payload.pageContext && typeof payload.pageContext === "object"
      ? payload.pageContext
      : {};
  const blocks = (Array.isArray(payload.blocks) ? payload.blocks : [])
    .map(normalizeWebPagePayloadBlock)
    .filter((block) => block.id && block.text)
    .slice(0, 80);
  if (blocks.length === 0) {
    return { pageMemory: emptyMemory, provider: settings.provider, model };
  }

  const cacheKey = webPageMemoryCacheKey({
    pageContext,
    model,
    glossaryVersion,
    blocks,
  });
  if (webPageMemoryCache.has(cacheKey)) {
    return {
      pageMemory: webPageMemoryCache.get(cacheKey),
      provider: settings.provider,
      model,
      cached: true,
    };
  }

  const prompt = core.buildWebPageMemoryPrompt({
    blocks,
    pageContext,
    customInstructions: settings.customInstructions,
    userGlossary,
  });
  const responseText = await fetchWebPagePromptText(
    settings,
    prompt,
    Math.min(8192, 1200 + blocks.length * 120),
  );
  const pageMemory = core.parseWebMemoryResponse(responseText);
  rememberWebPageMemoryCache(cacheKey, pageMemory);
  return {
    pageMemory,
    provider: settings.provider,
    model,
    cached: false,
  };
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

async function fetchVideoSummary(payload) {
  const settings = await getSettings();
  if (!settings.enabled) {
    return { skipped: true, reason: "disabled" };
  }
  if (!core.getApiKeyForProvider(settings)) {
    throw new Error("请先在扩展设置中填写 API key。");
  }

  const cues = (Array.isArray(payload.cues) ? payload.cues : [])
    .map((cue) => ({
      id: core.normalizeCaptionText(cue.id),
      start: Number(cue.start),
      end: Number(cue.end),
      source: core.normalizeCaptionText(cue.source),
    }))
    .filter((cue) => cue.id && cue.source);

  if (cues.length === 0) {
    throw new Error("当前视频没有可用完整字幕，暂不能总结。");
  }

  const model = core.getModelForProvider(settings);
  const cacheKey = core.createVideoSummaryCacheKey({
    provider: settings.provider,
    model,
    videoId: payload.videoId || "",
    customInstructions: settings.customInstructions,
    cues,
  });

  if (!payload.force && summaryCache.has(cacheKey)) {
    return {
      ...summaryCache.get(cacheKey),
      cached: true,
    };
  }

  const prompt = core.buildVideoSummaryPrompt({
    cues,
    metadata: payload.metadata || {},
    customInstructions: settings.customInstructions,
  });
  const { url, requestOptions } = buildAuthorizedRequest(
    settings,
    prompt,
    3072,
  );

  const response = await fetchWithTimeout(
    url,
    requestOptions,
    SUMMARY_API_TIMEOUT_MS,
  );
  if (!response.ok) {
    const message = await response.text();
    throw new Error(`API 请求失败：${response.status} ${message.slice(0, 240)}`);
  }

  const responseText = await readResponseText(settings.provider, response);
  const summary = core.parseVideoSummaryResponse(responseText);
  if (
    !summary.summary &&
    summary.highlights.length === 0 &&
    summary.chapters.length === 0
  ) {
    throw new Error("API 没有返回可用摘要。");
  }

  const result = {
    summary,
    provider: settings.provider,
    model,
    cached: false,
  };
  rememberSummaryCache(cacheKey, result);
  return result;
}

function isInjectableWebPageUrl(value) {
  try {
    const url = new URL(value || "");
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return false;
    }
    if (/\.?youtube\.com$/i.test(url.hostname)) {
      return isYouTubeWatchUrl(url);
    }
    return url.hostname !== "youtu.be";
  } catch (_error) {
    return false;
  }
}

function isYouTubeWatchUrl(url) {
  return /\.?youtube\.com$/i.test(url.hostname) && url.pathname === "/watch";
}

function queryActiveTab() {
  return new Promise((resolve, reject) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const lastError = chrome.runtime.lastError;
      if (lastError) {
        reject(new Error(lastError.message));
        return;
      }
      resolve(tabs?.[0] || null);
    });
  });
}

function insertWebPageTranslatorCss(tabId) {
  return new Promise((resolve, reject) => {
    chrome.scripting.insertCSS(
      {
        target: { tabId },
        files: ["src/web_page_translator.css"],
      },
      () => {
        const lastError = chrome.runtime.lastError;
        if (lastError) {
          reject(new Error(lastError.message));
          return;
        }
        resolve();
      },
    );
  });
}

function executeWebPageTranslatorScripts(tabId) {
  return new Promise((resolve, reject) => {
    chrome.scripting.executeScript(
      {
        target: { tabId },
        files: ["src/core.js", "src/web_page_translator.js"],
      },
      () => {
        const lastError = chrome.runtime.lastError;
        if (lastError) {
          reject(new Error(lastError.message));
          return;
        }
        resolve();
      },
    );
  });
}

function sendTabMessage(tabId, message) {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, message, (response) => {
      const lastError = chrome.runtime.lastError;
      if (lastError) {
        reject(new Error(lastError.message));
        return;
      }
      resolve(response);
    });
  });
}

async function startWebPageTranslation() {
  const tab = await queryActiveTab();
  if (!tab?.id || !isInjectableWebPageUrl(tab.url)) {
    throw new Error("当前页面不支持网页翻译。请在普通 http/https 网页中使用。");
  }
  const settings = await getSettings();
  if (!settings.enabled || !settings.webTranslationEnabled) {
    return { skipped: true, reason: "disabled" };
  }
  if (!core.getApiKeyForProvider(settings)) {
    throw new Error("请先在扩展设置中填写 API key。");
  }

  await insertWebPageTranslatorCss(tab.id);
  await executeWebPageTranslatorScripts(tab.id);
  const response = await sendTabMessage(tab.id, {
    type: "YTCT_WEB_TRANSLATE_START",
    settings: publicSettings(settings),
  });
  if (!response?.ok) {
    throw new Error(response?.error || "网页翻译启动失败");
  }
  return {
    tabId: tab.id,
    url: tab.url,
    started: true,
  };
}

async function clearWebPageTranslation() {
  const tab = await queryActiveTab();
  if (!tab?.id || !isInjectableWebPageUrl(tab.url)) {
    return { skipped: true, reason: "unsupported-page" };
  }
  try {
    const response = await sendTabMessage(tab.id, {
      type: "YTCT_WEB_TRANSLATE_CLEAR",
    });
    return response?.ok ? { cleared: true } : { skipped: true, reason: "not-active" };
  } catch (_error) {
    return { skipped: true, reason: "not-active" };
  }
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

  if (message.type === "YTCT_TRANSLATE_WEB_PAGE_BATCH") {
    fetchWebPageTranslationBatch(message.payload || {})
      .then((result) => sendResponse({ ok: true, result }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message.type === "YTCT_ANALYZE_WEB_PAGE_MEMORY") {
    fetchWebPageMemory(message.payload || {})
      .then((result) => sendResponse({ ok: true, result }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message.type === "YTCT_START_WEB_PAGE_TRANSLATION") {
    startWebPageTranslation()
      .then((result) => sendResponse({ ok: true, result }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message.type === "YTCT_CLEAR_WEB_PAGE_TRANSLATION") {
    clearWebPageTranslation()
      .then((result) => sendResponse({ ok: true, result }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message.type === "YTCT_SUMMARIZE_VIDEO") {
    fetchVideoSummary(message.payload || {})
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
