(function initCore(root) {
  const DEFAULT_SETTINGS = Object.freeze({
    enabled: true,
    provider: "gemini",
    apiKey: "",
    geminiApiKey: "",
    deepseekApiKey: "",
    openrouterApiKey: "",
    geminiModel: "gemini-2.5-flash-lite",
    deepseekModel: "deepseek-v4-flash",
    openrouterModel: "google/gemini-2.5-flash-lite",
    contextItems: 8,
    customInstructions: "",
    userGlossary: "",
    sourceDisplayMode: "raw",
    syncStrategy: "segment",
    webTranslationEnabled: true,
    webTranslationTargetLanguage: "zh-CN",
    webTranslationDisplayMode: "bilingual",
    webTranslationScope: "page",
    webTranslationSiteRules: "",
    overlayOpacityPercent: 78,
    overlayFontScalePercent: 100,
    overlayXPercent: 50,
    overlayYPercent: 86,
  });
  const TRANSLATION_PROMPT_VERSION = "segment-v2";
  const WEB_TRANSLATION_PROMPT_VERSION = "web-v1";
  const COURSE_TRANSLATION_GUIDANCE = Object.freeze([
    "Assume this is an ML/AI/RL course lecture unless metadata clearly says otherwise.",
    "Translate for a Chinese learner taking technical notes: concise, natural, and synchronized.",
    "Keep abbreviations and algorithm names when useful: ML, AI, RL, MDP, PAC, UCB, TD, MC, SARSA, DQN.",
    "Use stable terminology for reinforcement learning: agent, environment, state, action, reward, policy, value function, Q value, bandit, regret, Bellman equation, exploration/exploitation, epsilon-greedy, softmax.",
    "Preserve formulas, variables, Greek letters, code, citations, and slide labels.",
    "Repair obvious ASR artifacts only when context makes the correction clear; do not invent missing content.",
  ]);
  const VIDEO_SUMMARY_PROMPT_VERSION = "2026-06-16-chapter-anchors";
  const KNOWN_BAD_GEMINI_MODELS = new Set([
    "gemini-3.1-flash",
    "gemini-3.1-flash-lite",
  ]);

  function normalizeCaptionText(value) {
    return String(value || "")
      .replace(/\u00a0/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function isProbablyCodeText(value) {
    const source = normalizeCaptionText(value);
    if (!source) {
      return false;
    }
    const codeMarks = (source.match(/[{}[\]<>`]|=>|::|;\s|&&|\|\|/g) || []).length;
    if (codeMarks >= 3) {
      return true;
    }
    return (
      /\b(?:const|let|var)\s+[A-Za-z_$][\w$]*\s*=/.test(source) ||
      /\bfunction\s+[A-Za-z_$][\w$]*\s*\(/.test(source) ||
      /\bclass\s+[A-Za-z_$][\w$]*(?:\s+extends\s+[A-Za-z_$][\w$]*)?\s*\{/.test(source) ||
      /\b(?:import|export)\s+(?:\{|\*|default|const|function|class|[A-Za-z_$][\w$]*\s+from\b)/.test(source) ||
      /\breturn\s+.*[;{}]/.test(source)
    );
  }

  function isSeparatorOnlyLine(value) {
    const source = normalizeCaptionText(value);
    return Boolean(source) && /^[\s▀▄█▔▁─━—\-_=•·]+$/.test(source);
  }

  function splitWebPageTextSegments(value) {
    return String(value || "")
      .replace(/\r\n?/g, "\n")
      .split(/\n+/)
      .map(normalizeCaptionText)
      .filter((line) => line && !isSeparatorOnlyLine(line));
  }

  function cleanTranslationText(value) {
    return normalizeCaptionText(value).replace(/^[\s、，,。；;：:]+/, "");
  }

  function clampInteger(value, min, max, fallback) {
    const number = Number.parseInt(value, 10);
    if (!Number.isFinite(number)) {
      return fallback;
    }
    return Math.min(max, Math.max(min, number));
  }

  function providerApiKey(value, fieldName, providerName, activeProvider, fallback) {
    if (Object.prototype.hasOwnProperty.call(value, fieldName)) {
      return typeof value[fieldName] === "string" ? value[fieldName].trim() : "";
    }
    return activeProvider === providerName ? fallback : "";
  }

  function normalizeSettings(input) {
    const value = input && typeof input === "object" ? input : {};
    const provider =
      value.provider === "deepseek" || value.provider === "openrouter"
        ? value.provider
        : "gemini";
    const genericApiKey = typeof value.apiKey === "string" ? value.apiKey.trim() : "";
    const geminiApiKey = providerApiKey(
      value,
      "geminiApiKey",
      "gemini",
      provider,
      genericApiKey,
    );
    const deepseekApiKey = providerApiKey(
      value,
      "deepseekApiKey",
      "deepseek",
      provider,
      genericApiKey,
    );
    const openrouterApiKey = providerApiKey(
      value,
      "openrouterApiKey",
      "openrouter",
      provider,
      genericApiKey,
    );
    const geminiModel = normalizeCaptionText(value.geminiModel);
    const deepseekModel = normalizeCaptionText(value.deepseekModel);
    const openrouterModel = normalizeCaptionText(value.openrouterModel);

    const normalized = {
      enabled: value.enabled !== false,
      provider,
      apiKey: "",
      geminiApiKey,
      deepseekApiKey,
      openrouterApiKey,
      geminiModel:
        geminiModel && !KNOWN_BAD_GEMINI_MODELS.has(geminiModel)
          ? geminiModel
          : DEFAULT_SETTINGS.geminiModel,
      deepseekModel: deepseekModel || DEFAULT_SETTINGS.deepseekModel,
      openrouterModel: openrouterModel || DEFAULT_SETTINGS.openrouterModel,
      contextItems: clampInteger(
        value.contextItems,
        0,
        20,
        DEFAULT_SETTINGS.contextItems,
      ),
      customInstructions:
        typeof value.customInstructions === "string"
          ? value.customInstructions.trim()
          : "",
      userGlossary:
        typeof value.userGlossary === "string" ? value.userGlossary.trim() : "",
      sourceDisplayMode: value.sourceDisplayMode === "clean" ? "clean" : "raw",
      syncStrategy:
        value.syncStrategy === "cue" ||
        value.syncStrategy === "segment" ||
        value.syncStrategy === "hybrid"
          ? value.syncStrategy
          : DEFAULT_SETTINGS.syncStrategy,
      webTranslationEnabled: value.webTranslationEnabled !== false,
      webTranslationTargetLanguage:
        normalizeCaptionText(value.webTranslationTargetLanguage) ||
        DEFAULT_SETTINGS.webTranslationTargetLanguage,
      webTranslationDisplayMode:
        value.webTranslationDisplayMode === "translation"
          ? "translation"
          : "bilingual",
      webTranslationScope:
        value.webTranslationScope === "viewport" ? "viewport" : "page",
      webTranslationSiteRules:
        typeof value.webTranslationSiteRules === "string"
          ? value.webTranslationSiteRules
          : DEFAULT_SETTINGS.webTranslationSiteRules,
      overlayOpacityPercent: clampInteger(
        value.overlayOpacityPercent,
        0,
        95,
        DEFAULT_SETTINGS.overlayOpacityPercent,
      ),
      overlayFontScalePercent: clampInteger(
        value.overlayFontScalePercent,
        75,
        150,
        DEFAULT_SETTINGS.overlayFontScalePercent,
      ),
      overlayXPercent: clampInteger(
        value.overlayXPercent,
        0,
        100,
        DEFAULT_SETTINGS.overlayXPercent,
      ),
      overlayYPercent: clampInteger(
        value.overlayYPercent,
        0,
        100,
        DEFAULT_SETTINGS.overlayYPercent,
      ),
    };
    normalized.apiKey = getApiKeyForProvider(normalized);
    return normalized;
  }

  function getApiKeyForProvider(settings) {
    const value = settings && typeof settings === "object" ? settings : {};
    if (value.provider === "deepseek") {
      return typeof value.deepseekApiKey === "string" ? value.deepseekApiKey.trim() : "";
    }
    if (value.provider === "openrouter") {
      return typeof value.openrouterApiKey === "string" ? value.openrouterApiKey.trim() : "";
    }
    return typeof value.geminiApiKey === "string" ? value.geminiApiKey.trim() : "";
  }

  function getModelForProvider(settings) {
    const normalized = normalizeSettings(settings);
    if (normalized.provider === "deepseek") {
      return normalized.deepseekModel;
    }
    if (normalized.provider === "openrouter") {
      return normalized.openrouterModel;
    }
    return normalized.geminiModel;
  }

  function safeLine(value) {
    return normalizeCaptionText(value).replace(/\|/g, "/");
  }

  function stableHash(value) {
    const text = String(value || "");
    let hash = 2166136261;
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16).padStart(8, "0");
  }

  function parseUserGlossary(value) {
    return String(value || "")
      .split(/\r?\n/)
      .map((line) => normalizeCaptionText(line))
      .filter((line) => line && !line.startsWith("#"))
      .map((line) => {
        const match = line.match(/^(.+?)(?:=>|->|=|:)(.+)$/);
        if (!match) {
          return null;
        }
        const source = normalizeCaptionText(match[1]);
        const target = normalizeCaptionText(match[2]);
        if (!source || !target) {
          return null;
        }
        return { source, target, locked: true };
      })
      .filter(Boolean);
  }

  function normalizeGlossaryForPrompt(value) {
    return (Array.isArray(value) ? value : parseUserGlossary(value))
      .map((item) => ({
        source: normalizeCaptionText(item?.source || item?.term || ""),
        target: normalizeCaptionText(
          item?.target || item?.translation || item?.value || "",
        ),
        locked: item?.locked !== false,
      }))
      .filter((item) => item.source && item.target);
  }

  function createGlossaryVersion(value) {
    const entries = normalizeGlossaryForPrompt(value)
      .map((item) => `${item.source.toLowerCase()}=${item.target}:${item.locked}`)
      .sort();
    return stableHash(entries.join("\n"));
  }

  function removeRepeatedAdjacentWords(text) {
    const words = normalizeCaptionText(text).split(" ").filter(Boolean);
    const deduped = [];
    for (const word of words) {
      const previous = deduped[deduped.length - 1];
      if (previous && previous.toLowerCase() === word.toLowerCase()) {
        continue;
      }
      deduped.push(word);
    }
    return deduped.join(" ");
  }

  function hasNonSpeechCaptionTerm(text) {
    return /\b(?:music|applause|laughter|laughs|laughing|cheering|silence|inaudible|unintelligible)\b/i.test(
      text,
    ) || /音乐|掌声|笑声|听不清/.test(text);
  }

  function isNonSpeechCaptionText(value) {
    const text = normalizeCaptionText(value);
    if (!text) {
      return false;
    }
    if (/^[\s♪♫♬♩-]+$/.test(text)) {
      return true;
    }

    const annotationOnly = /^(?:[\[(（【][^\])）】]+[\])）】]\s*)+$/.test(text);
    if (!annotationOnly) {
      return false;
    }

    const annotationText = normalizeCaptionText(
      text.replace(/[\[(（【\])）】]/g, " "),
    );
    return hasNonSpeechCaptionTerm(annotationText);
  }

  function hasVisibleVerticalOverlap(rect, windowRect) {
    if (!rect || !windowRect) {
      return true;
    }
    const top = Number(rect.top);
    const bottom = Number(rect.bottom);
    const windowTop = Number(windowRect.top);
    const windowBottom = Number(windowRect.bottom);
    if (![top, bottom, windowTop, windowBottom].every(Number.isFinite)) {
      return true;
    }
    return Math.min(bottom, windowBottom) - Math.max(top, windowTop) > 1;
  }

  function extractVisibleCaptionText(segments) {
    const visibleSegments = (Array.isArray(segments) ? segments : [])
      .filter((segment) => segment && normalizeCaptionText(segment.text))
      .filter((segment) => hasVisibleVerticalOverlap(segment.rect, segment.windowRect))
      .sort((left, right) => {
        const topDelta = Number(left.rect?.top || 0) - Number(right.rect?.top || 0);
        if (Math.abs(topDelta) > 2) {
          return topDelta;
        }
        return Number(left.rect?.left || 0) - Number(right.rect?.left || 0);
      })
      .map((segment) => normalizeCaptionText(segment.text));

    return removeRepeatedAdjacentWords(visibleSegments.join(" "));
  }

  function buildBilingualCaption({ source, translation }) {
    const normalizedSource = normalizeCaptionText(source);
    const normalizedTranslation = cleanTranslationText(translation);
    const lines = [];

    if (normalizedSource) {
      lines.push({ lang: "source", text: normalizedSource });
    }
    if (normalizedTranslation) {
      lines.push({ lang: "translation", text: normalizedTranslation });
    }

    return {
      source: normalizedSource,
      translation: normalizedTranslation,
      lines,
    };
  }

  function extractJsonObjectAfter(text, marker) {
    const markerIndex = String(text || "").indexOf(marker);
    if (markerIndex < 0) {
      return "";
    }
    const source = String(text);
    const start = source.indexOf("{", markerIndex + marker.length);
    if (start < 0) {
      return "";
    }

    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let index = start; index < source.length; index += 1) {
      const char = source[index];
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === "\\") {
        escaped = true;
        continue;
      }
      if (char === '"') {
        inString = !inString;
        continue;
      }
      if (inString) {
        continue;
      }
      if (char === "{") {
        depth += 1;
      } else if (char === "}") {
        depth -= 1;
        if (depth === 0) {
          return source.slice(start, index + 1);
        }
      }
    }

    return "";
  }

  function captionTrackName(track) {
    if (track?.name?.simpleText) {
      return normalizeCaptionText(track.name.simpleText);
    }
    if (Array.isArray(track?.name?.runs)) {
      return normalizeCaptionText(track.name.runs.map((run) => run.text || "").join(""));
    }
    return normalizeCaptionText(track?.languageCode || "");
  }

  function extractCaptionTracksFromPlayerResponse(response) {
    const tracks =
      response?.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
    return tracks
      .filter((track) => track && track.baseUrl)
      .map((track) => ({
        baseUrl: track.baseUrl,
        name: captionTrackName(track),
        languageCode: normalizeCaptionText(track.languageCode),
        kind: normalizeCaptionText(track.kind),
        vssId: normalizeCaptionText(track.vssId),
      }));
  }

  function extractCaptionTracksFromScripts(scripts) {
    const markers = [
      "ytInitialPlayerResponse =",
      "ytInitialPlayerResponse=",
      "window.ytInitialPlayerResponse =",
      "window[\"ytInitialPlayerResponse\"] =",
    ];

    for (const script of Array.isArray(scripts) ? scripts : []) {
      for (const marker of markers) {
        const json = extractJsonObjectAfter(script, marker);
        if (!json) {
          continue;
        }
        try {
          const tracks = extractCaptionTracksFromPlayerResponse(JSON.parse(json));
          if (tracks.length > 0) {
            return tracks;
          }
        } catch (_error) {
          // Keep scanning other scripts; YouTube changes script wrappers often.
        }
      }
    }

    return [];
  }

  function chooseCaptionTrack(tracks, options = {}) {
    const usableTracks = (Array.isArray(tracks) ? tracks : []).filter(
      (track) => track && track.baseUrl,
    );
    const englishTrack =
      usableTracks.find(
        (track) =>
          normalizeCaptionText(track.languageCode).toLowerCase() === "en" &&
          normalizeCaptionText(track.kind).toLowerCase() !== "asr",
      ) ||
      usableTracks.find(
        (track) =>
          normalizeCaptionText(track.languageCode).toLowerCase() === "en",
      ) ||
      usableTracks.find((track) =>
        /^en[-_]/i.test(normalizeCaptionText(track.languageCode)),
      );

    if (englishTrack) {
      return englishTrack;
    }
    return options.allowNonEnglish ? usableTracks[0] || null : null;
  }

  function findNestedValue(rootValue, predicate) {
    const stack = [rootValue];
    const seen = new Set();

    while (stack.length > 0) {
      const value = stack.pop();
      if (!value || typeof value !== "object" || seen.has(value)) {
        continue;
      }
      seen.add(value);

      const result = predicate(value);
      if (result) {
        return result;
      }

      Object.values(value).forEach((child) => {
        if (child && typeof child === "object") {
          stack.push(child);
        }
      });
    }

    return "";
  }

  function extractYouTubePageConfigFromScripts(scripts) {
    for (const script of Array.isArray(scripts) ? scripts : []) {
      if (!String(script || "").includes("ytcfg.set")) {
        continue;
      }
      const json = extractJsonObjectAfter(script, "ytcfg.set");
      if (!json) {
        continue;
      }
      try {
        const config = JSON.parse(json);
        const context = config.INNERTUBE_CONTEXT || {};
        return {
          apiKey: normalizeCaptionText(config.INNERTUBE_API_KEY),
          context,
          clientName: normalizeCaptionText(
            config.INNERTUBE_CONTEXT_CLIENT_NAME ||
              config.INNERTUBE_CLIENT_NAME ||
              context?.client?.clientName,
          ),
          clientVersion: normalizeCaptionText(
            config.INNERTUBE_CLIENT_VERSION || context?.client?.clientVersion,
          ),
          visitorData: normalizeCaptionText(context?.client?.visitorData),
        };
      } catch (_error) {
        // Continue scanning other config scripts.
      }
    }

    return {
      apiKey: "",
      context: null,
      clientName: "",
      clientVersion: "",
      visitorData: "",
    };
  }

  function extractTranscriptParamsFromInitialData(initialData) {
    return normalizeCaptionText(
      findNestedValue(
        initialData,
        (value) => value?.getTranscriptEndpoint?.params || "",
      ),
    );
  }

  function extractTranscriptParamsFromScripts(scripts) {
    const markers = [
      "ytInitialData =",
      "ytInitialData=",
      "window.ytInitialData =",
      "window[\"ytInitialData\"] =",
    ];

    for (const script of Array.isArray(scripts) ? scripts : []) {
      if (!String(script || "").includes("getTranscriptEndpoint")) {
        continue;
      }
      for (const marker of markers) {
        const json = extractJsonObjectAfter(script, marker);
        if (!json) {
          continue;
        }
        try {
          const params = extractTranscriptParamsFromInitialData(JSON.parse(json));
          if (params) {
            return params;
          }
        } catch (_error) {
          // Keep scanning other wrappers.
        }
      }
    }

    return "";
  }

  function captionUrlWithFormat(baseUrl, format) {
    try {
      const url = new URL(baseUrl);
      url.searchParams.set("fmt", format || "json3");
      return url.toString();
    } catch (_error) {
      return "";
    }
  }

  function parseJson3Captions(input) {
    const data = typeof input === "string" ? JSON.parse(input) : input;
    return (data?.events || [])
      .map((event) => {
        const source = removeRepeatedAdjacentWords(
          (event.segs || []).map((segment) => segment.utf8 || "").join(""),
        );
        const start = Number(event.tStartMs) / 1000;
        const duration = Number(event.dDurationMs || 0) / 1000;
        if (!source || !Number.isFinite(start)) {
          return null;
        }
        const safeDuration = Number.isFinite(duration) && duration > 0 ? duration : 1.5;
        return {
          id: "",
          start,
          end: start + safeDuration,
          duration: safeDuration,
          source,
          translation: "",
          status: "pending",
        };
      })
      .filter(Boolean)
      .map((cue, index) => ({ ...cue, id: `cue-${index}` }));
  }

  function roundSeconds(value) {
    return Math.round(Number(value) * 1000) / 1000;
  }

  function decodeHtmlEntities(value) {
    let text = String(value || "");
    const named = {
      amp: "&",
      apos: "'",
      gt: ">",
      lt: "<",
      nbsp: " ",
      quot: '"',
    };

    for (let pass = 0; pass < 2; pass += 1) {
      text = text
        .replace(/&#(\d+);/g, (_match, code) =>
          String.fromCodePoint(Number.parseInt(code, 10)),
        )
        .replace(/&#x([0-9a-f]+);/gi, (_match, code) =>
          String.fromCodePoint(Number.parseInt(code, 16)),
        )
        .replace(/&([a-z]+);/gi, (match, name) => named[name.toLowerCase()] || match);
    }

    return text;
  }

  function stripCaptionMarkup(value) {
    return removeRepeatedAdjacentWords(
      decodeHtmlEntities(String(value || "").replace(/<[^>]+>/g, " ")),
    );
  }

  function parseTimestampSeconds(value) {
    const parts = String(value || "").trim().split(":");
    if (parts.length < 2 || parts.length > 3) {
      return Number.NaN;
    }

    const seconds = Number.parseFloat(parts.pop());
    const minutes = Number.parseInt(parts.pop(), 10);
    const hours = parts.length ? Number.parseInt(parts.pop(), 10) : 0;
    if (![seconds, minutes, hours].every(Number.isFinite)) {
      return Number.NaN;
    }
    return hours * 3600 + minutes * 60 + seconds;
  }

  function makeTimeline(cues) {
    return (Array.isArray(cues) ? cues : [])
      .map((cue) => {
        const start = roundSeconds(cue.start);
        const end = roundSeconds(cue.end);
        const duration = roundSeconds(end - start);
        const source = normalizeCaptionText(cue.source);
        if (!source || !Number.isFinite(start) || !Number.isFinite(end) || duration <= 0) {
          return null;
        }
        return {
          id: "",
          start,
          end,
          duration,
          source,
          translation: "",
          status: "pending",
        };
      })
      .filter(Boolean)
      .map((cue, index) => ({ ...cue, id: `cue-${index}` }));
  }

  function inferTranscriptCueEnd(rawCues, index, videoDurationSeconds) {
    const cue = rawCues[index] || {};
    const start = Number(cue.start);
    const nextStart = Number(rawCues[index + 1]?.start);
    if (Number.isFinite(nextStart) && nextStart > start) {
      return nextStart - 0.001;
    }

    const defaultEnd = start + 5;
    const videoDuration = Number(videoDurationSeconds);
    return Number.isFinite(videoDuration) && videoDuration > start
      ? Math.min(videoDuration, defaultEnd)
      : defaultEnd;
  }

  function parseVttCaptions(text) {
    return makeTimeline(
      String(text || "")
        .replace(/\r/g, "")
        .split(/\n{2,}/)
        .map((block) => {
          const lines = block
            .split("\n")
            .map((line) => line.trim())
            .filter(Boolean);
          const timeIndex = lines.findIndex((line) => line.includes("-->"));
          if (timeIndex < 0) {
            return null;
          }

          const [startRaw, endRaw] = lines[timeIndex].split("-->");
          const start = parseTimestampSeconds(startRaw);
          const end = parseTimestampSeconds(String(endRaw || "").trim().split(/\s+/)[0]);
          const source = stripCaptionMarkup(lines.slice(timeIndex + 1).join(" "));
          return { start, end, source };
        })
        .filter(Boolean),
    );
  }

  function parseAttributes(text) {
    const result = {};
    String(text || "").replace(/([:\w-]+)="([^"]*)"/g, (_match, key, value) => {
      result[key] = decodeHtmlEntities(value);
      return "";
    });
    return result;
  }

  function parseXmlCaptions(text) {
    const source = String(text || "");
    const cues = [];

    source.replace(/<text\b([^>]*)>([\s\S]*?)<\/text>/gi, (_match, attrsText, body) => {
      const attrs = parseAttributes(attrsText);
      const start = Number.parseFloat(attrs.start);
      const duration = Number.parseFloat(attrs.dur || attrs.duration || "0") || 1.5;
      cues.push({
        start,
        end: start + duration,
        source: stripCaptionMarkup(body),
      });
      return "";
    });

    source.replace(/<p\b([^>]*)>([\s\S]*?)<\/p>/gi, (_match, attrsText, body) => {
      const attrs = parseAttributes(attrsText);
      const start = Number.parseFloat(attrs.t) / 1000;
      const duration = Number.parseFloat(attrs.d || attrs.dur || "0") / 1000 || 1.5;
      cues.push({
        start,
        end: start + duration,
        source: stripCaptionMarkup(body),
      });
      return "";
    });

    return makeTimeline(cues);
  }

  function parseCaptionTrackText(text, format) {
    const body = String(text || "").trim();
    if (!body) {
      return [];
    }

    const normalizedFormat = normalizeCaptionText(format).toLowerCase();
    if (normalizedFormat === "json3") {
      try {
        return parseJson3Captions(body);
      } catch (_error) {
        return [];
      }
    }
    if (normalizedFormat === "vtt" || body.startsWith("WEBVTT")) {
      return parseVttCaptions(body);
    }
    if (
      normalizedFormat.startsWith("srv") ||
      normalizedFormat === "xml" ||
      /<\/(?:text|p)>/i.test(body)
    ) {
      return parseXmlCaptions(body);
    }

    try {
      return parseJson3Captions(body);
    } catch (_error) {
      return parseVttCaptions(body).concat(parseXmlCaptions(body));
    }
  }

  function textFromRuns(value) {
    if (!value || typeof value !== "object") {
      return "";
    }
    if (typeof value.simpleText === "string") {
      return normalizeCaptionText(value.simpleText);
    }
    if (Array.isArray(value.runs)) {
      return normalizeCaptionText(value.runs.map((run) => run.text || "").join(""));
    }
    return "";
  }

  function parseTranscriptResponseCaptions(data) {
    const rawCues = [];
    const stack = [data];
    const seen = new Set();

    while (stack.length > 0) {
      const value = stack.pop();
      if (!value || typeof value !== "object" || seen.has(value)) {
        continue;
      }
      seen.add(value);

      const renderer = value.transcriptCueRenderer;
      if (renderer) {
        rawCues.push({
          start: Number(renderer.startOffsetMs) / 1000,
          duration: Number(renderer.durationMs) / 1000,
          source:
            textFromRuns(renderer.cue) ||
            textFromRuns(renderer.snippet) ||
            normalizeCaptionText(renderer.text),
        });
      }

      Object.values(value).forEach((child) => {
        if (child && typeof child === "object") {
          stack.push(child);
        }
      });
    }

    rawCues.sort((left, right) => Number(left.start) - Number(right.start));
    return makeTimeline(
      rawCues.map((cue, index) => {
        const duration =
          Number.isFinite(cue.duration) && cue.duration > 0
            ? cue.duration
            : Math.max(0.5, Number(rawCues[index + 1]?.start) - Number(cue.start));
        return {
          start: cue.start,
          end: cue.start + duration,
          source: cue.source,
        };
      }),
    );
  }

  function parseTranscriptPanelCaptions(data, videoDurationSeconds) {
    const rootValue = typeof data === "string" ? JSON.parse(data) : data;
    const rawCues = [];
    const stack = [rootValue];
    const seen = new Set();

    while (stack.length > 0) {
      const value = stack.pop();
      if (!value || typeof value !== "object" || seen.has(value)) {
        continue;
      }
      seen.add(value);

      const marker = value.macroMarkersPanelItemViewModel;
      if (marker) {
        const item = marker.item?.timelineItemViewModel || {};
        const contentItems = Array.isArray(item.contentItems) ? item.contentItems : [];
        const source = normalizeCaptionText(
          contentItems
            .map((contentItem) => {
              const segment = contentItem?.transcriptSegmentViewModel;
              return textFromRuns(segment) || normalizeCaptionText(segment?.simpleText);
            })
            .filter(Boolean)
            .join(" "),
        );
        const start = Number(
          findNestedValue(
            marker.onTap,
            (candidate) =>
              candidate?.watchEndpoint &&
              "startTimeSeconds" in candidate.watchEndpoint
                ? String(candidate.watchEndpoint.startTimeSeconds)
                : "",
          ),
        );
        if (source && Number.isFinite(start)) {
          rawCues.push({ start, source });
        }
      }

      Object.values(value).forEach((child) => {
        if (child && typeof child === "object") {
          stack.push(child);
        }
      });
    }

    rawCues.sort((left, right) => Number(left.start) - Number(right.start));
    return makeTimeline(
      rawCues.map((cue, index) => {
        return {
          start: cue.start,
          end: inferTranscriptCueEnd(rawCues, index, videoDurationSeconds),
          source: cue.source,
        };
      }),
    );
  }

  function parseTranscriptDomRows(rows, videoDurationSeconds) {
    const rawCues = [];
    const seen = new Set();

    function looksLikeMergedTranscriptDomRow(rowText, source) {
      const normalizedRowText = normalizeCaptionText(rowText);
      const normalizedSource = normalizeCaptionText(source);
      if (normalizedSource.length < 220) {
        return false;
      }

      const timestampCount =
        (normalizedRowText.match(/\b\d{1,2}:\d{2,4}\b/g) || []).length +
        (normalizedSource.match(/\b\d{1,2}:\d{2,4}\b/g) || []).length;
      const durationLabelCount =
        (normalizedRowText.match(/(?:minutes?|seconds?)/gi) || []).length +
        (normalizedSource.match(/(?:minutes?|seconds?)/gi) || []).length;
      return timestampCount >= 2 || durationLabelCount >= 3;
    }

    (Array.isArray(rows) ? rows : []).forEach((row) => {
      const rowText =
        typeof row === "string"
          ? normalizeCaptionText(row)
          : normalizeCaptionText(row?.rowText || row?.textContent || "");
      const timestampText = normalizeCaptionText(
        typeof row === "object" && row
          ? row.timestamp || row.time || row.startText || ""
          : "",
      );
      const timestampMatch =
        timestampText.match(/\d{1,2}:\d{2}(?::\d{2})?(?:\.\d+)?/) ||
        rowText.match(/\d{1,2}:\d{2}(?::\d{2})?(?:\.\d+)?/);
      const start =
        typeof row === "object" && Number.isFinite(Number(row.start))
          ? Number(row.start)
          : parseTimestampSeconds(timestampMatch?.[0] || "");
      const explicitSource =
        typeof row === "object" && row
          ? row.text || row.source || row.caption || ""
          : "";
      const source = normalizeCaptionText(
        explicitSource ||
          rowText.replace(timestampMatch?.[0] || "", "").trim(),
      );
      const key = `${roundSeconds(start)}::${source.toLowerCase()}`;

      if (
        !source ||
        !Number.isFinite(start) ||
        looksLikeMergedTranscriptDomRow(rowText, source) ||
        seen.has(key)
      ) {
        return;
      }
      seen.add(key);
      rawCues.push({ start, source });
    });

    rawCues.sort((left, right) => Number(left.start) - Number(right.start));
    return makeTimeline(
      rawCues.map((cue, index) => {
        return {
          start: cue.start,
          end: inferTranscriptCueEnd(rawCues, index, videoDurationSeconds),
          source: cue.source,
        };
      }),
    );
  }

  function findCueAtTime(cues, time, toleranceSeconds = 0.12) {
    const seconds = Number(time);
    if (!Number.isFinite(seconds)) {
      return null;
    }
    return (
      (Array.isArray(cues) ? cues : []).find(
        (cue) =>
          seconds >= Number(cue.start) - toleranceSeconds &&
          seconds < Number(cue.end) + toleranceSeconds,
      ) || null
    );
  }

  function shouldRetryTranscriptDomTimeline(options) {
    const {
      timelineMode = "",
      domRowCount = 0,
      retryInFlight = false,
      lastRetryAt = 0,
      now = Date.now(),
      throttleMs = 0,
    } = options || {};

    return (
      timelineMode === "fallback" &&
      Number(domRowCount) > 0 &&
      !retryInFlight &&
      Number(now) - Number(lastRetryAt || 0) >= Number(throttleMs || 0)
    );
  }

  function hasSentenceEnding(text) {
    return /[.!?。！？]$/.test(normalizeCaptionText(text));
  }

  function hasIncompleteSegmentEnding(text) {
    return /\b(?:the|a|an|to|of|for|with|and|or|but|because|that|which|is|are|was|were)\.?$/i
      .test(normalizeCaptionText(text));
  }

  function countWords(text) {
    return normalizeCaptionText(text).split(/\s+/).filter(Boolean).length;
  }

  function cleanCaptionSourceText(value, options = {}) {
    let text = normalizeCaptionText(value);
    if (options.captionKind !== "asr") {
      return text;
    }

    text = text
      .replace(/\b(?:um|uh|you know)\b[,\s]*/gi, " ")
      .replace(/\s+/g, " ")
      .trim();

    [
      [/\bmark\s+off\s+decision\s+process\b/gi, "Markov decision process"],
      [/\btemporal\s+different\s+signal\b/gi, "Temporal-difference signal"],
      [/\bcue\s+value\b/gi, "Q value"],
      [/\bq\s+learning\b/gi, "Q-learning"],
      [/\bepsilon\s+greedy\b/gi, "epsilon-greedy"],
      [/\bq\s+value\b/gi, "Q value"],
      [/\bmdp\b/gi, "MDP"],
      [/\bpac\b/gi, "PAC"],
      [/\bucb\b/gi, "UCB"],
      [/\bsarsa\b/gi, "SARSA"],
      [/\bdqn\b/gi, "DQN"],
    ].forEach(([pattern, replacement]) => {
      text = text.replace(pattern, replacement);
    });

    text = normalizeCaptionText(text);
    if (options.restoreFinalPunctuation !== false && text && !hasSentenceEnding(text)) {
      text = `${text}.`;
    }
    return text;
  }

  function normalizeTranslationCue(cue, options = {}) {
    const id = normalizeCaptionText(cue?.id);
    const start = roundSeconds(cue?.start);
    const end = roundSeconds(cue?.end);
    const sourceRaw = normalizeCaptionText(
      cue?.sourceRaw || cue?.source || cue?.text || "",
    );
    if (!id || !sourceRaw || !Number.isFinite(start) || !Number.isFinite(end)) {
      return null;
    }
    return {
      id,
      start,
      end,
      sourceRaw,
      sourceClean:
        typeof cue?.sourceClean === "string"
          ? normalizeCaptionText(cue.sourceClean)
          : cleanCaptionSourceText(sourceRaw, {
              captionKind: cue?.captionKind || options.captionKind,
              restoreFinalPunctuation: false,
            }),
    };
  }

  function buildSegmentFromCues(cues, index) {
    const normalizedCues = cues.map((cue) => ({
      id: cue.id,
      start: cue.start,
      end: cue.end,
      sourceRaw: cue.sourceRaw,
      sourceClean: cue.sourceClean,
    }));
    return {
      id: `segment-${index}`,
      start: normalizedCues[0].start,
      end: normalizedCues[normalizedCues.length - 1].end,
      sourceRaw: normalizeCaptionText(
        normalizedCues.map((cue) => cue.sourceRaw).join(" "),
      ),
      sourceClean: normalizeCaptionText(
        normalizedCues.map((cue) => cue.sourceClean).join(" "),
      ),
      cueIds: normalizedCues.map((cue) => cue.id),
      cues: normalizedCues,
    };
  }

  function buildTranslationSegmentsFromCues(cues, options = {}) {
    const isAsrCaption = normalizeCaptionText(options.captionKind) === "asr";
    const maxCuesPerSegment = clampInteger(
      options.maxCuesPerSegment,
      1,
      isAsrCaption ? 30 : 10,
      isAsrCaption ? 18 : 5,
    );
    const maxWordsPerSegment = clampInteger(options.maxWordsPerSegment, 4, 80, 45);
    const maxSegmentChars = clampInteger(options.maxSegmentChars, 80, 600, 220);
    const maxDurationSeconds = Number.isFinite(Number(options.maxDurationSeconds))
      ? Number(options.maxDurationSeconds)
      : 12;
    const maxGapSeconds = Number.isFinite(Number(options.maxGapSeconds))
      ? Number(options.maxGapSeconds)
      : 1.2;
    const normalizedCues = (Array.isArray(cues) ? cues : [])
      .map((cue) => normalizeTranslationCue(cue, options))
      .filter(Boolean);
    const segments = [];
    let current = [];

    function flush() {
      if (current.length === 0) {
        return;
      }
      segments.push(buildSegmentFromCues(current, segments.length));
      current = [];
    }

    for (const cue of normalizedCues) {
      const previous = current[current.length - 1];
      if (previous) {
        const nextText = current
          .map((item) => item.sourceClean)
          .concat(cue.sourceClean)
          .join(" ");
        const nextDuration = cue.end - current[0].start;
        if (
          countWords(nextText) > maxWordsPerSegment ||
          nextDuration > maxDurationSeconds
        ) {
          flush();
        }
      }
      if (
        current.length > 0 &&
        Number.isFinite(maxGapSeconds) &&
        cue.start - current[current.length - 1].end > maxGapSeconds &&
        countWords(current.map((item) => item.sourceClean).join(" ")) > 4
      ) {
        flush();
      }

      current.push(cue);
      const currentText = current.map((item) => item.sourceClean).join(" ");
      if (
        (hasSentenceEnding(cue.sourceClean) &&
          !hasIncompleteSegmentEnding(currentText)) ||
        current.length >= maxCuesPerSegment ||
        countWords(currentText) >= maxWordsPerSegment ||
        normalizeCaptionText(currentText).length >= maxSegmentChars
      ) {
        flush();
      }
    }

    flush();
    return segments;
  }

  function compactCueForPrompt(cue) {
    const normalized = normalizeTranslationCue(cue);
    if (!normalized) {
      return null;
    }
    return normalized;
  }

  function buildSegmentTranslationPrompt(options) {
    const {
      outputSegments = [],
      nonOutputContextBefore = [],
      nonOutputContextAfter = [],
      videoMemory = {},
      metadata = {},
      customInstructions = "",
      userGlossary = [],
    } = options || {};
    const segments = (Array.isArray(outputSegments) ? outputSegments : [])
      .filter((segment) => segment && normalizeCaptionText(segment.id));
    const before = (Array.isArray(nonOutputContextBefore)
      ? nonOutputContextBefore
      : [])
      .map(compactCueForPrompt)
      .filter(Boolean);
    const after = (Array.isArray(nonOutputContextAfter)
      ? nonOutputContextAfter
      : [])
      .map(compactCueForPrompt)
      .filter(Boolean);
    const compactMemory =
      videoMemory && typeof videoMemory === "object" ? videoMemory : {};
    const lockedUserGlossary = normalizeGlossaryForPrompt(userGlossary);
    const promptInput = {
      videoMemory: compactMemory,
      user_glossary: lockedUserGlossary,
      non_output_context_before: before,
      output_segments: segments.map((segment) => ({
        id: normalizeCaptionText(segment.id),
        start: roundSeconds(segment.start),
        end: roundSeconds(segment.end),
        sourceRaw: normalizeCaptionText(segment.sourceRaw),
        sourceClean: normalizeCaptionText(segment.sourceClean || segment.sourceRaw),
        cues: (Array.isArray(segment.cues) ? segment.cues : [])
          .map(compactCueForPrompt)
          .filter(Boolean),
      })),
      non_output_context_after: after,
    };
    const lines = [
      "Task: translate YouTube subtitles into Simplified Chinese by understanding each whole segment, then returning cue-level output.",
      "Translate each output segment as one complete semantic unit.",
      "Do not change cue ids or timestamps. Only output translations for output_segments.",
      "Use clean_source for understanding; keep sourceRaw/sourceClean distinctions intact.",
      "Keep cue_translations concise enough for the original cue timing.",
      "Glossary priority: User glossary > video memory glossary > model default translation.",
      "",
      "Default course translation guidance:",
      ...COURSE_TRANSLATION_GUIDANCE.map((line) => `- ${line}`),
      "",
      'Return only JSON in this exact shape: {"segments":[{"id":"segment-0","clean_source":"...","full_translation":"...","cue_translations":[{"id":"cue-0","translation":"..."}]}]}',
      "",
      "Video metadata:",
      `- Title: ${safeLine(metadata.title) || "Unknown"}`,
      `- Channel: ${safeLine(metadata.channel) || "Unknown"}`,
      "",
      "Input JSON:",
      JSON.stringify(promptInput, null, 2),
    ];

    if (normalizeCaptionText(customInstructions)) {
      lines.push("", "User translation preferences:", normalizeCaptionText(customInstructions));
    }

    return lines.join("\n");
  }

  function parseSegmentTranslationResponse(text) {
    const stripped = stripFences(text);
    const candidates = [stripped];
    const objectMatch = stripped.match(/\{[\s\S]*"segments"\s*:[\s\S]*\}/);
    if (objectMatch) {
      candidates.push(objectMatch[0]);
    }

    for (const candidate of candidates) {
      try {
        const parsed = JSON.parse(candidate);
        const segments = Array.isArray(parsed?.segments) ? parsed.segments : [];
        const cueTranslations = {};
        const segmentTranslations = {};

        segments.forEach((segment) => {
          const segmentId = normalizeCaptionText(segment?.id);
          if (segmentId) {
            segmentTranslations[segmentId] = {
              cleanSource: normalizeCaptionText(
                segment.clean_source || segment.cleanSource || "",
              ),
              fullTranslation: cleanTranslationText(
                segment.full_translation || segment.fullTranslation || "",
              ),
            };
          }
          const cueItems = Array.isArray(segment?.cue_translations)
            ? segment.cue_translations
            : Array.isArray(segment?.cueTranslations)
              ? segment.cueTranslations
              : [];
          cueItems.forEach((item) => {
            const id = normalizeCaptionText(item?.id);
            const translation = cleanTranslationText(item?.translation);
            if (id && translation) {
              cueTranslations[id] = translation;
            }
          });
        });

        return { cueTranslations, segmentTranslations };
      } catch (_error) {
        // Try the next candidate.
      }
    }

    return { cueTranslations: {}, segmentTranslations: {} };
  }

  function compactWebPageBlock(block) {
    const id = normalizeCaptionText(block?.id);
    const text = normalizeCaptionText(block?.text || block?.source || "");
    if (!id || !text) {
      return null;
    }
    return {
      id,
      tagName: normalizeCaptionText(block?.tagName || "block").toLowerCase(),
      role: normalizeCaptionText(block?.role || ""),
      headingPath: (Array.isArray(block?.headingPath) ? block.headingPath : [])
        .map(normalizeCaptionText)
        .filter(Boolean)
        .slice(-4),
      protected_terms: normalizeWebPageProtectedTerms(
        block?.protectedTerms || block?.protected_terms,
      ),
      text,
    };
  }

  function normalizeWebPageProtectedTerms(value) {
    const terms = Array.isArray(value) ? value : [];
    const seen = new Set();
    const normalized = [];
    terms.forEach((item) => {
      const text = normalizeCaptionText(
        typeof item === "string" ? item : item?.text || item?.source || "",
      );
      const kind = normalizeCaptionText(
        typeof item === "object" && item ? item.kind || item.type || "" : "",
      ).toLowerCase();
      if (!text) {
        return;
      }
      const key = `${kind}:${text.toLowerCase()}`;
      if (seen.has(key)) {
        return;
      }
      seen.add(key);
      normalized.push({ text, kind: kind || "text" });
    });
    return normalized.slice(0, 24);
  }

  function buildWebPageTranslationPrompt(options = {}) {
    const {
      blocks = [],
      nonOutputContextBefore = [],
      nonOutputContextAfter = [],
      pageContext = {},
      pageMemory = {},
      customInstructions = "",
      userGlossary = [],
      targetLanguage = DEFAULT_SETTINGS.webTranslationTargetLanguage,
    } = options || {};
    const outputBlocks = (Array.isArray(blocks) ? blocks : [])
      .map(compactWebPageBlock)
      .filter(Boolean);
    const before = (Array.isArray(nonOutputContextBefore)
      ? nonOutputContextBefore
      : [])
      .map(compactWebPageBlock)
      .filter(Boolean);
    const after = (Array.isArray(nonOutputContextAfter)
      ? nonOutputContextAfter
      : [])
      .map(compactWebPageBlock)
      .filter(Boolean);
    const promptInput = {
      page: {
        title: normalizeCaptionText(pageContext.title),
        url: normalizeCaptionText(pageContext.url),
        language: normalizeCaptionText(pageContext.language),
      },
      target_language:
        normalizeCaptionText(targetLanguage) ||
        DEFAULT_SETTINGS.webTranslationTargetLanguage,
      pageMemory: pageMemory && typeof pageMemory === "object" ? pageMemory : {},
      user_glossary: normalizeGlossaryForPrompt(userGlossary),
      non_output_context_before: before,
      output_blocks: outputBlocks,
      non_output_context_after: after,
    };
    const lines = [
      "Task: translate ordinary web page text into the requested target language.",
      "Use the page title, headings, surrounding blocks, glossary, and previous page memory to keep terminology consistent.",
      "Preserve the original DOM structure: do not ask to rewrite HTML, merge blocks, remove source text, or change block ids.",
      "Translate each output block naturally at paragraph or heading level, not word by word.",
      "Translate each output block as part of its surrounding section, using headingPath and adjacent blocks to resolve pronouns and terminology.",
      "Do not translate, rewrite, or drop protected_terms such as inline code, URLs, formulas, variables, and identifiers; copy them exactly into the translation when they belong to that block.",
      "Skip boilerplate meaning only when it appears in non-output context; still translate every output_blocks item.",
      "Glossary priority: User glossary > page memory glossary > model default translation.",
      "",
      'Return only JSON in this exact shape: {"translations":[{"id":"web-block-0","translation":"..."}],"glossary":[{"source":"...","translation":"..."}]}',
      "",
      "Input JSON:",
      JSON.stringify(promptInput, null, 2),
    ];

    if (normalizeCaptionText(customInstructions)) {
      lines.push("", "User translation preferences:", normalizeCaptionText(customInstructions));
    }

    return lines.join("\n");
  }

  function parseWebPageTranslationResponse(text) {
    const stripped = stripFences(text);
    const candidates = [stripped];
    const objectMatch = stripped.match(/\{[\s\S]*"translations"\s*:[\s\S]*\}/);
    if (objectMatch) {
      candidates.push(objectMatch[0]);
    }

    for (const candidate of candidates) {
      try {
        const parsed = JSON.parse(candidate);
        const items = Array.isArray(parsed?.translations)
          ? parsed.translations
          : [];
        const translations = items.reduce((result, item) => {
          const id = normalizeCaptionText(item?.id);
          const translation = cleanTranslationText(item?.translation);
          if (id && translation) {
            result[id] = translation;
          }
          return result;
        }, {});
        return {
          translations,
          glossary: normalizeGlossaryItems(parsed?.glossary),
        };
      } catch (_error) {
        // Try the next candidate.
      }
    }

    return { translations: {}, glossary: [] };
  }

  function buildWebPageMemoryPrompt(options = {}) {
    const {
      blocks = [],
      pageContext = {},
      customInstructions = "",
      userGlossary = [],
    } = options || {};
    const input = {
      page: {
        title: normalizeCaptionText(pageContext.title),
        url: normalizeCaptionText(pageContext.url),
        language: normalizeCaptionText(pageContext.language),
      },
      user_glossary: normalizeGlossaryForPrompt(userGlossary),
      sample_blocks: (Array.isArray(blocks) ? blocks : [])
        .map(compactWebPageBlock)
        .filter(Boolean)
        .slice(0, 80),
    };
    const lines = [
      "WebMemory map step: analyze this web page before translation.",
      "Extract only stable facts that help translate this web page consistently.",
      "Focus on domain, technical terminology, entities, abbreviations, and style guidance.",
      'Return only JSON in this exact shape: {"summary":"...","domain":"...","styleGuide":"...","glossary":[{"source":"...","translation":"..."}],"entities":["..."]}',
      "",
      "Input JSON:",
      JSON.stringify(input, null, 2),
    ];
    if (normalizeCaptionText(customInstructions)) {
      lines.push("", "User translation preferences:", normalizeCaptionText(customInstructions));
    }
    return lines.join("\n");
  }

  function parseWebMemoryResponse(text) {
    const memory = parseVideoMemoryResponse(text);
    return {
      summary: memory.summary,
      domain: memory.domain,
      styleGuide: memory.styleGuide,
      glossary: memory.glossary,
      entities: memory.entities,
    };
  }

  function validateWebPageTranslationResult(options = {}) {
    const blocks = (Array.isArray(options.blocks) ? options.blocks : [])
      .map(compactWebPageBlock)
      .filter(Boolean);
    const translations = options.translations || {};
    const validTranslations = {};
    const retryIds = [];
    const reasons = [];

    blocks.forEach((block) => {
      const translation = cleanTranslationText(translations[block.id]);
      if (!translation) {
        retryIds.push(block.id);
        reasons.push(`missing:${block.id}`);
        return;
      }
      const source = normalizeCaptionText(block.text).toLowerCase();
      const target = normalizeCaptionText(translation).toLowerCase();
      if (source && target === source) {
        retryIds.push(block.id);
        reasons.push(`copied-source:${block.id}`);
        return;
      }
      const missingProtectedTerm = block.protected_terms.find(
        (term) => term.text && !translation.includes(term.text),
      );
      if (missingProtectedTerm) {
        retryIds.push(block.id);
        reasons.push(`missing-protected:${block.id}:${missingProtectedTerm.text}`);
        return;
      }
      validTranslations[block.id] = translation;
    });

    return {
      ok: retryIds.length === 0,
      retryIds,
      validTranslations,
      reason: reasons.join(" "),
    };
  }

  function buildWebPageRepairPrompt(options = {}) {
    const {
      blocks = [],
      pageContext = {},
      pageMemory = {},
      userGlossary = [],
      targetLanguage = DEFAULT_SETTINGS.webTranslationTargetLanguage,
      reason = "invalid",
    } = options || {};
    const promptInput = {
      page: {
        title: normalizeCaptionText(pageContext.title),
        url: normalizeCaptionText(pageContext.url),
        language: normalizeCaptionText(pageContext.language),
      },
      target_language:
        normalizeCaptionText(targetLanguage) ||
        DEFAULT_SETTINGS.webTranslationTargetLanguage,
      repair_reason: normalizeCaptionText(reason),
      pageMemory: pageMemory && typeof pageMemory === "object" ? pageMemory : {},
      user_glossary: normalizeGlossaryForPrompt(userGlossary),
      output_blocks: (Array.isArray(blocks) ? blocks : [])
        .map(compactWebPageBlock)
        .filter(Boolean),
    };
    return [
      "Repair missing or invalid web page translations.",
      "Only translate the listed output_blocks. Do not copy the source text as the translation.",
      "Keep terminology consistent with pageMemory and user_glossary.",
      "Do not translate, rewrite, or drop protected_terms; copy inline code, URLs, formulas, variables, and identifiers exactly when they belong to the block.",
      'Return only JSON in this exact shape: {"translations":[{"id":"web-block-0","translation":"..."}],"glossary":[{"source":"...","translation":"..."}]}',
      "",
      "Input JSON:",
      JSON.stringify(promptInput, null, 2),
    ].join("\n");
  }

  function stringList(value) {
    if (typeof value === "string") {
      return value
        .split("\n")
        .flatMap((item) => item.split(","))
        .map(normalizeCaptionText)
        .filter(Boolean);
    }
    return (Array.isArray(value) ? value : [])
      .map(normalizeCaptionText)
      .filter(Boolean);
  }

  function parseWebTranslationSiteRules(value) {
    if (!normalizeCaptionText(value)) {
      return [];
    }
    try {
      const parsed = JSON.parse(String(value));
      const rawRules = Array.isArray(parsed) ? parsed : parsed?.rules;
      return (Array.isArray(rawRules) ? rawRules : [])
        .map((rule) => ({
          name: normalizeCaptionText(rule?.name || rule?.id || ""),
          matches: stringList(rule?.matches || rule?.match || rule?.host),
          rootSelector: normalizeCaptionText(rule?.rootSelector),
          blockSelector: normalizeCaptionText(rule?.blockSelector),
          includeSelectors: stringList(rule?.includeSelectors || rule?.includeSelector),
          excludeSelectors: stringList(rule?.excludeSelectors || rule?.excludeSelector),
          minTextLength: clampInteger(rule?.minTextLength, 0, 2000, 0),
          minWords: clampInteger(rule?.minWords, 0, 200, 0),
        }))
        .filter(
          (rule) =>
            rule.matches.length > 0 ||
            rule.rootSelector ||
            rule.blockSelector ||
            rule.includeSelectors.length > 0 ||
            rule.excludeSelectors.length > 0,
        );
    } catch (_error) {
      return [];
    }
  }

  function sitePatternMatches(url, pattern) {
    const normalizedPattern = normalizeCaptionText(pattern).toLowerCase();
    if (!normalizedPattern) {
      return false;
    }
    try {
      const parsed = new URL(url);
      const host = parsed.hostname.toLowerCase();
      if (normalizedPattern.startsWith("*.")) {
        const suffix = normalizedPattern.slice(2);
        return host === suffix || host.endsWith(`.${suffix}`);
      }
      if (/^https?:\/\//i.test(normalizedPattern)) {
        return normalizePageUrlForCache(url).toLowerCase().startsWith(
          normalizePageUrlForCache(normalizedPattern).toLowerCase(),
        );
      }
      return host === normalizedPattern || host.endsWith(`.${normalizedPattern}`);
    } catch (_error) {
      return false;
    }
  }

  function matchWebTranslationSiteRule(url, rules) {
    return (
      (Array.isArray(rules) ? rules : []).find((rule) =>
        (Array.isArray(rule.matches) ? rule.matches : []).some((pattern) =>
          sitePatternMatches(url, pattern),
        ),
      ) || null
    );
  }

  function buildVideoMemoryChunks(cues, options = {}) {
    const chunkSize = clampInteger(options.chunkSize, 1, 50, 20);
    const overlap = clampInteger(options.overlap, 0, chunkSize - 1, 2);
    const maxChunks = clampInteger(options.maxChunks, 1, 50, 50);
    const step = Math.max(1, chunkSize - overlap);
    const normalizedCues = (Array.isArray(cues) ? cues : [])
      .map((cue) => normalizeTranslationCue(cue, options))
      .filter(Boolean);
    const chunks = [];

    for (
      let start = 0;
      start < normalizedCues.length && chunks.length < maxChunks;
      start += step
    ) {
      const end = Math.min(normalizedCues.length, start + chunkSize);
      chunks.push({
        id: `memory-chunk-${chunks.length}`,
        cues: normalizedCues.slice(start, end),
      });
      if (end >= normalizedCues.length) {
        break;
      }
    }

    return chunks;
  }

  function buildVideoMemoryPrompt(options) {
    const {
      chunk = {},
      metadata = {},
      captionKind = "unknown",
    } = options || {};
    const input = {
      chunkId: normalizeCaptionText(chunk.id),
      captionKind: normalizeCaptionText(captionKind) || "unknown",
      cues: (Array.isArray(chunk.cues) ? chunk.cues : [])
        .map((cue) => normalizeTranslationCue(cue, { captionKind }))
        .filter(Boolean),
    };
    return [
      "VideoMemory map step: analyze this subtitle chunk for later translation consistency.",
      "Extract only stable facts that help translate future subtitle segments.",
      'Return only JSON in this exact shape: {"summary":"...","domain":"...","styleGuide":"...","glossary":[{"source":"...","translation":"..."}],"entities":["..."],"asrCorrections":[{"wrong":"...","correct":"..."}]}',
      "",
      "Video metadata:",
      `- Title: ${safeLine(metadata.title) || "Unknown"}`,
      `- Channel: ${safeLine(metadata.channel) || "Unknown"}`,
      "",
      "Chunk JSON:",
      JSON.stringify(input, null, 2),
    ].join("\n");
  }

  function buildVideoMemoryReducePrompt(options) {
    const {
      items = [],
      channelMemory = {},
      metadata = {},
    } = options || {};
    const input = {
      metadata: {
        title: normalizeCaptionText(metadata.title),
        channel: normalizeCaptionText(metadata.channel),
        description: normalizeCaptionText(metadata.description),
        playlist: normalizeCaptionText(metadata.playlist),
        chapters: (Array.isArray(metadata.chapters) ? metadata.chapters : [])
          .map(normalizeCaptionText)
          .filter(Boolean),
      },
      channelMemory:
        channelMemory && typeof channelMemory === "object" ? channelMemory : {},
      mapItems: (Array.isArray(items) ? items : []).map((item) =>
        mergeVideoMemoryItems([item]),
      ),
    };
    return [
      "VideoMemory reduce step: merge chunk memories into one compact memory card for subtitle translation.",
      "Prefer user/course/channel-stable terminology. Keep only facts useful for future segment translation.",
      'Return only JSON in this exact shape: {"summary":"...","domain":"...","styleGuide":"...","glossary":[{"source":"...","translation":"..."}],"entities":["..."],"asrCorrections":[{"wrong":"...","correct":"..."}]}',
      "",
      "Reduce input JSON:",
      JSON.stringify(input, null, 2),
    ].join("\n");
  }

  function normalizeGlossaryItems(value) {
    return (Array.isArray(value) ? value : [])
      .map((item) => ({
        source: normalizeCaptionText(item?.source || item?.term || ""),
        translation: normalizeCaptionText(item?.translation || item?.target || ""),
      }))
      .filter((item) => item.source && item.translation);
  }

  function normalizeAsrCorrections(value) {
    return (Array.isArray(value) ? value : [])
      .map((item) => ({
        wrong: normalizeCaptionText(item?.wrong || item?.source || ""),
        correct: normalizeCaptionText(item?.correct || item?.target || ""),
      }))
      .filter((item) => item.wrong && item.correct);
  }

  function parseVideoMemoryResponse(text) {
    const stripped = stripFences(text);
    const candidates = [stripped];
    const objectMatch = stripped.match(/\{[\s\S]*"summary"\s*:[\s\S]*\}/);
    if (objectMatch) {
      candidates.push(objectMatch[0]);
    }

    for (const candidate of candidates) {
      try {
        const parsed = JSON.parse(candidate);
        return {
          summary: normalizeCaptionText(parsed?.summary),
          domain: normalizeCaptionText(parsed?.domain),
          styleGuide: normalizeCaptionText(parsed?.styleGuide || parsed?.style_guide),
          glossary: normalizeGlossaryItems(parsed?.glossary),
          entities: (Array.isArray(parsed?.entities) ? parsed.entities : [])
            .map(normalizeCaptionText)
            .filter(Boolean),
          asrCorrections: normalizeAsrCorrections(
            parsed?.asrCorrections || parsed?.asr_corrections,
          ),
        };
      } catch (_error) {
        // Try the next candidate.
      }
    }

    return mergeVideoMemoryItems([]);
  }

  function uniqueBy(items, keyFn, limit) {
    const result = [];
    const seen = new Set();
    for (const item of items) {
      const key = keyFn(item);
      if (!key || seen.has(key)) {
        continue;
      }
      seen.add(key);
      result.push(item);
      if (result.length >= limit) {
        break;
      }
    }
    return result;
  }

  function mergeVideoMemoryItems(items, options = {}) {
    const summaryLimit = clampInteger(options.summaryLimit, 80, 1200, 420);
    const itemLimit = clampInteger(options.itemLimit, 1, 80, 24);
    const values = Array.isArray(items) ? items : [];
    return {
      summary: normalizeCaptionText(
        values
          .map((item) => item?.summary)
          .filter(Boolean)
          .join(" "),
      ).slice(0, summaryLimit),
      domain: normalizeCaptionText(values.find((item) => item?.domain)?.domain),
      styleGuide: normalizeCaptionText(
        values.find((item) => item?.styleGuide)?.styleGuide,
      ),
      glossary: uniqueBy(
        values.flatMap((item) => normalizeGlossaryItems(item?.glossary)),
        (item) => item.source.toLowerCase(),
        itemLimit,
      ),
      entities: uniqueBy(
        values
          .flatMap((item) => (Array.isArray(item?.entities) ? item.entities : []))
          .map(normalizeCaptionText)
          .filter(Boolean),
        (item) => item.toLowerCase(),
        itemLimit,
      ),
      asrCorrections: uniqueBy(
        values.flatMap((item) => normalizeAsrCorrections(item?.asrCorrections)),
        (item) => item.wrong.toLowerCase(),
        itemLimit,
      ),
    };
  }

  function buildBatchTranslationPrompt(options) {
    const {
      cues = [],
      metadata = {},
      customInstructions = "",
    } = options || {};
    const lines = [
      "Task: translate these YouTube captions into Simplified Chinese.",
      "Use neighboring captions as context to keep terminology and pronouns consistent.",
      "Keep each translation concise enough to fit the original subtitle timing.",
      "Preserve formulas, variable names, code, and common technical terms when translating them would reduce clarity.",
      "",
      "Default course translation guidance:",
      ...COURSE_TRANSLATION_GUIDANCE.map((line) => `- ${line}`),
      'Return only JSON in this exact shape: {"translations":[{"id":"cue-0","translation":"..."}]}',
      "",
      "Video metadata:",
      `- Title: ${safeLine(metadata.title) || "Unknown"}`,
      `- Channel: ${safeLine(metadata.channel) || "Unknown"}`,
      "",
      "Captions:",
    ];

    cues.forEach((cue) => {
      lines.push(
        `- ${safeLine(cue.id)} [${Number(cue.start).toFixed(2)}-${Number(cue.end).toFixed(2)}]: ${safeLine(cue.source)}`,
      );
    });

    if (normalizeCaptionText(customInstructions)) {
      lines.push("", "User translation preferences:", normalizeCaptionText(customInstructions));
    }

    return lines.join("\n");
  }

  function parseBatchTranslationResponse(text) {
    const stripped = stripFences(text);
    const candidates = [stripped];
    const objectMatch = stripped.match(/\{[\s\S]*"translations"\s*:[\s\S]*\}/);
    if (objectMatch) {
      candidates.push(objectMatch[0]);
    }

    for (const candidate of candidates) {
      try {
        const parsed = JSON.parse(candidate);
        const translations = Array.isArray(parsed?.translations)
          ? parsed.translations
          : [];
        return translations.reduce((result, item) => {
          const id = normalizeCaptionText(item?.id);
          const translation = cleanTranslationText(item?.translation);
          if (id && translation) {
            result[id] = translation;
          }
          return result;
        }, {});
      } catch (_error) {
        // Try the next candidate.
      }
    }

    return {};
  }

  function formatSummaryTimestamp(seconds) {
    const rawSeconds = Number(seconds);
    const totalSeconds = Number.isFinite(rawSeconds)
      ? Math.max(0, Math.floor(rawSeconds))
      : 0;
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const remainingSeconds = totalSeconds % 60;
    const pad = (value) => String(value).padStart(2, "0");
    if (hours > 0) {
      return `${hours}:${pad(minutes)}:${pad(remainingSeconds)}`;
    }
    return `${pad(minutes)}:${pad(remainingSeconds)}`;
  }

  function normalizedSummaryCues(cues) {
    return (Array.isArray(cues) ? cues : [])
      .map((cue) => {
        const rawStart = Number(cue?.start);
        const rawEnd = Number(cue?.end);
        const start = Number.isFinite(rawStart) && rawStart > 0 ? rawStart : 0;
        const end = Number.isFinite(rawEnd) && rawEnd >= start ? rawEnd : start;
        return {
          start,
          end,
          source: normalizeCaptionText(cue?.source),
        };
      })
      .filter((cue) => cue.source)
      .sort((first, second) => first.start - second.start);
  }

  function limitSummarySegmentText(text, maxChars) {
    const normalized = normalizeCaptionText(text);
    if (normalized.length <= maxChars) {
      return normalized;
    }
    if (maxChars <= 3) {
      return normalized.slice(0, maxChars);
    }
    return `${normalized.slice(0, maxChars - 3).trimEnd()}...`;
  }

  function totalSegmentChars(segments) {
    return segments.reduce((total, segment) => total + segment.text.length, 0);
  }

  function trimSelectedSummarySegments(segments, maxChars) {
    const selected = segments.map((segment) => ({ ...segment }));

    while (selected.length > 2 && totalSegmentChars(selected) > maxChars) {
      selected.splice(Math.floor(selected.length / 2), 1);
    }

    let totalChars = totalSegmentChars(selected);
    if (totalChars <= maxChars || selected.length === 0) {
      return selected;
    }

    const perSegmentChars = Math.max(1, Math.floor(maxChars / selected.length));
    selected.forEach((segment) => {
      segment.text = limitSummarySegmentText(segment.text, perSegmentChars);
    });

    totalChars = totalSegmentChars(selected);
    while (totalChars > maxChars && selected.some((segment) => segment.text)) {
      const segment = [...selected].reverse().find((item) => item.text);
      const overflow = totalChars - maxChars;
      segment.text = segment.text.slice(
        0,
        Math.max(0, segment.text.length - overflow),
      );
      totalChars = totalSegmentChars(selected);
    }

    return selected.filter((segment) => segment.text);
  }

  function compactTimelineForSummary(cues, options = {}) {
    const maxChars = clampInteger(options.maxChars, 1, 80000, 50000);
    const maxSegmentChars = clampInteger(options.maxSegmentChars, 20, 2000, 700);
    const rawMaxMergeGapSeconds = Number(options.maxMergeGapSeconds);
    const maxMergeGapSeconds = Number.isFinite(rawMaxMergeGapSeconds)
      ? Math.max(0, rawMaxMergeGapSeconds)
      : 8;
    const segments = [];

    for (const cue of normalizedSummaryCues(cues)) {
      const source = limitSummarySegmentText(cue.source, maxSegmentChars);
      const end = cue.end || cue.start;
      const previous = segments.at(-1);
      const gap = previous ? cue.start - previous.end : 0;
      const mergedText = previous ? `${previous.text} ${source}`.trim() : source;
      if (previous && gap <= maxMergeGapSeconds && mergedText.length <= maxSegmentChars) {
        previous.end = Math.max(previous.end, end);
        previous.text = mergedText;
      } else {
        segments.push({
          start: cue.start,
          end,
          text: source,
        });
      }
    }

    const totalChars = totalSegmentChars(segments);
    if (totalChars <= maxChars) {
      return segments;
    }
    if (segments.length <= 2) {
      return trimSelectedSummarySegments(segments, maxChars);
    }

    const averageSegmentChars = Math.max(1, Math.ceil(totalChars / segments.length));
    const targetCount = Math.min(
      segments.length,
      Math.max(2, Math.floor(maxChars / averageSegmentChars)),
    );
    const selectedIndexes = new Set([0, segments.length - 1]);

    for (
      let step = 1;
      selectedIndexes.size < targetCount && step < targetCount * 3;
      step += 1
    ) {
      const index = Math.round(
        (step * (segments.length - 1)) / Math.max(1, targetCount - 1),
      );
      selectedIndexes.add(Math.min(segments.length - 1, Math.max(0, index)));
    }

    const selected = [...selectedIndexes]
      .sort((first, second) => first - second)
      .map((index) => segments[index]);

    return trimSelectedSummarySegments(selected, maxChars);
  }

  function formatSummarySegmentForPrompt(segment) {
    return `[${formatSummaryTimestamp(segment.start)}-${formatSummaryTimestamp(
      segment.end,
    )}] ${safeLine(segment.text)}`;
  }

  function totalPromptCaptionChars(segments) {
    return segments.reduce(
      (total, segment) => total + formatSummarySegmentForPrompt(segment).length + 2,
      0,
    );
  }

  function trimSummarySegmentsForPrompt(segments, maxChars) {
    const selected = segments.map((segment) => ({ ...segment }));

    while (selected.length > 2 && totalPromptCaptionChars(selected) > maxChars) {
      selected.splice(Math.floor(selected.length / 2), 1);
    }

    while (
      selected.length > 0 &&
      totalPromptCaptionChars(selected) > maxChars &&
      selected.some((segment) => segment.text)
    ) {
      const longest = selected.reduce((result, segment) =>
        segment.text.length > result.text.length ? segment : result,
      );
      const overflow = totalPromptCaptionChars(selected) - maxChars;
      longest.text = longest.text.slice(
        0,
        Math.max(0, longest.text.length - overflow),
      );
    }

    return selected.filter((segment) => normalizeCaptionText(segment.text));
  }

  function summaryTimelineRange(cues) {
    const normalized = normalizedSummaryCues(cues);
    if (normalized.length === 0) {
      return { start: 0, end: 0 };
    }
    return {
      start: normalized[0].start,
      end: normalized.reduce(
        (latest, cue) => Math.max(latest, cue.end || cue.start),
        normalized[0].end || normalized[0].start,
      ),
    };
  }

  function buildSummaryChapterAnchors(cues) {
    const range = summaryTimelineRange(cues);
    const rangeStart = Math.max(0, Math.floor(range.start));
    const rangeEnd = Math.max(rangeStart, Math.floor(range.end));
    const duration = Math.max(0, rangeEnd - rangeStart);
    if (duration <= 0) {
      return [];
    }

    const chapterCount = duration < 600
      ? Math.min(4, Math.max(1, Math.ceil(duration / 120)))
      : Math.min(10, Math.max(5, Math.ceil(duration / 360)));
    const rawInterval = duration / chapterCount;
    const roundedInterval = Math.max(
      1,
      Math.round(rawInterval / 60) * 60,
    );

    return Array.from({ length: chapterCount }, (_item, index) => {
      const start = Math.min(rangeStart + roundedInterval * index, rangeEnd);
      const nextStart = index + 1 < chapterCount
        ? rangeStart + roundedInterval * (index + 1)
        : rangeEnd;
      return {
        start,
        end: Math.max(start, Math.min(nextStart, rangeEnd)),
      };
    }).filter((anchor, index, anchors) =>
      anchor.start < rangeEnd ||
      index === anchors.length - 1,
    );
  }

  function buildVideoSummaryPrompt(options = {}) {
    const {
      cues = [],
      metadata = {},
      customInstructions = "",
      maxChars = 50000,
      maxSegmentChars = 700,
      maxMergeGapSeconds,
    } = options || {};
    const summaryMaxChars = clampInteger(maxChars, 1, 80000, 50000);
    const summaryCueCount = normalizedSummaryCues(cues).length;
    const mergeGap =
      Number.isFinite(Number(maxMergeGapSeconds))
        ? maxMergeGapSeconds
        : summaryCueCount <= 2
          ? 0.5
          : undefined;
    const segments = trimSummarySegmentsForPrompt(
      compactTimelineForSummary(cues, {
        maxChars: summaryMaxChars,
        maxSegmentChars,
        maxMergeGapSeconds: mergeGap,
      }),
      summaryMaxChars,
    );
    const timelineRange = summaryTimelineRange(cues);
    const timelineStart = formatSummaryTimestamp(timelineRange.start);
    const timelineEnd = formatSummaryTimestamp(timelineRange.end);
    const chapterAnchors = buildSummaryChapterAnchors(cues);
    const lines = [
      "Task: summarize this YouTube video in Simplified Chinese.",
      "Use only the caption content and video metadata. Do not invent details.",
      "Write concise course-note style Chinese for a learner reviewing the video.",
      "Preserve technical terms, code, formulas, variable names, product names, and model names when translating them would reduce clarity.",
      "",
      "Default course summarization guidance:",
      ...COURSE_TRANSLATION_GUIDANCE.map((line) => `- ${line}`),
      "",
      'Strict JSON contract: return only {"summary":"...","highlights":["..."],"chapters":[{"start":0,"title":"...","points":["..."]}]}',
      "",
      "Output requirements:",
      "- summary: 150-250 Chinese characters when the video has enough content.",
      "- highlights: 3-6 concise bullets.",
      "- chapters: 5-10 timestamped sections when the source is long enough.",
      "- chapter start values must be seconds and close to real caption timestamps.",
      `- Timestamp range: ${timelineStart}-${timelineEnd}. Chapters must cover the entire timestamp range, not only the beginning.`,
      `- Include a final chapter near ${timelineEnd} when late captions exist.`,
      "- Do not stop chapters after the opening or first third; distribute chapters across early, middle, and late sections.",
      "- short videos may use fewer highlights and chapters but must keep the same JSON shape.",
      "",
      "Required chapter anchors:",
      "- Return exactly one chapter for each anchor below, in the same order.",
      "- Set each chapter.start to the anchor's seconds value.",
      "- Summarize content from that anchor until the next anchor; the final anchor covers through the end of the video.",
      ...chapterAnchors.map((anchor) =>
        `- ${anchor.start} seconds (${formatSummaryTimestamp(anchor.start)}) covers ${formatSummaryTimestamp(anchor.start)}-${formatSummaryTimestamp(anchor.end)}`,
      ),
      "",
      "Video metadata:",
      `- Title: ${safeLine(metadata.title) || "Unknown"}`,
      `- Channel: ${safeLine(metadata.channel) || "Unknown"}`,
      `- URL: ${safeLine(metadata.url) || "Unknown"}`,
      "",
      "Timestamped captions:",
    ];

    if (segments.length === 0) {
      lines.push("- None");
    } else {
      segments.forEach((segment) => {
        lines.push(`- ${formatSummarySegmentForPrompt(segment)}`);
      });
    }

    if (normalizeCaptionText(customInstructions)) {
      lines.push(
        "",
        "User translation and summarization preferences:",
        normalizeCaptionText(customInstructions),
      );
    }

    return lines.join("\n");
  }

  function extractJsonObjectCandidates(text) {
    const source = String(text || "");
    const candidates = [];

    for (let start = 0; start < source.length; start += 1) {
      if (source[start] !== "{") {
        continue;
      }

      let depth = 0;
      let inString = false;
      let escaped = false;
      for (let index = start; index < source.length; index += 1) {
        const char = source[index];
        if (escaped) {
          escaped = false;
          continue;
        }
        if (char === "\\") {
          escaped = true;
          continue;
        }
        if (char === '"') {
          inString = !inString;
          continue;
        }
        if (inString) {
          continue;
        }
        if (char === "{") {
          depth += 1;
        } else if (char === "}") {
          depth -= 1;
          if (depth === 0) {
            const candidate = source.slice(start, index + 1);
            if (/"(?:summary|highlights|chapters)"\s*:/.test(candidate)) {
              candidates.push(candidate);
            }
            break;
          }
        }
      }
    }

    return candidates;
  }

  function normalizeVideoSummary(value) {
    const cleanSummaryString = (item) =>
      typeof item === "string" ? cleanTranslationText(item) : "";
    const summary = cleanSummaryString(value?.summary);
    const highlights = (Array.isArray(value?.highlights) ? value.highlights : [])
      .map((item) => cleanSummaryString(item))
      .filter(Boolean);
    const chapters = (Array.isArray(value?.chapters) ? value.chapters : [])
      .map((chapter) => {
        const rawStart = Number(chapter?.start);
        const start = Number.isFinite(rawStart) && rawStart > 0 ? rawStart : 0;
        const title = cleanSummaryString(chapter?.title);
        const points = (Array.isArray(chapter?.points) ? chapter.points : [])
          .map((point) => cleanSummaryString(point))
          .filter(Boolean);
        return { start, title, points };
      })
      .filter((chapter) => chapter.title || chapter.points.length > 0);

    return { summary, highlights, chapters };
  }

  function parseVideoSummaryResponse(text) {
    if (typeof text !== "string") {
      return { summary: "", highlights: [], chapters: [] };
    }
    const stripped = stripFences(text);
    const candidates = [
      stripped,
      ...extractJsonObjectCandidates(stripped),
    ].filter(Boolean);
    const seen = new Set();

    for (const candidate of candidates) {
      if (seen.has(candidate)) {
        continue;
      }
      seen.add(candidate);
      try {
        const normalized = normalizeVideoSummary(JSON.parse(candidate));
        if (
          normalized.summary ||
          normalized.highlights.length > 0 ||
          normalized.chapters.length > 0
        ) {
          return normalized;
        }
      } catch (_error) {
        // Try the next candidate because providers sometimes wrap JSON in prose.
      }
    }

    return { summary: "", highlights: [], chapters: [] };
  }

  function hashString(value) {
    let hash = 2166136261;
    const text = String(value || "");
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36);
  }

  function createVideoSummaryCacheKey(options = {}) {
    const transcriptKey = normalizedSummaryCues(options.cues)
      .map((cue) =>
        [
          roundSeconds(cue.start),
          roundSeconds(cue.end),
          normalizeCaptionText(cue.source).toLowerCase(),
        ].join(":"),
      )
      .join("||");

    return [
      normalizeCaptionText(options.provider).toLowerCase(),
      normalizeCaptionText(options.model).toLowerCase(),
      normalizeCaptionText(options.videoId),
      normalizeCaptionText(options.customInstructions).toLowerCase(),
      VIDEO_SUMMARY_PROMPT_VERSION,
      hashString(transcriptKey),
    ].join("::");
  }

  function buildTranslationPrompt(options) {
    const {
      currentText,
      context = [],
      metadata = {},
      customInstructions = "",
      userGlossary = [],
      maxContextItems = DEFAULT_SETTINGS.contextItems,
    } = options || {};

    const current = normalizeCaptionText(currentText);
    const contextLimit = clampInteger(maxContextItems, 0, 20, DEFAULT_SETTINGS.contextItems);
    const boundedContext = context
      .filter((item) => item && normalizeCaptionText(item.source))
      .slice(-contextLimit);
    const lockedUserGlossary = normalizeGlossaryForPrompt(userGlossary);

    const lines = [
      "Task: translate the current YouTube caption into Simplified Chinese.",
      "Use the previous captions as context to correct pronouns, technical terms, omitted subjects, and ambiguous short phrases.",
      "Keep the translation concise and synchronized with the caption duration.",
      "Preserve formulas, variable names, code, and common technical terms when translating them would reduce clarity.",
      "",
      "Default course translation guidance:",
      ...COURSE_TRANSLATION_GUIDANCE.map((line) => `- ${line}`),
      'Return only JSON in this exact shape: {"translation":"..."}',
      "",
      "Video metadata:",
      `- Title: ${safeLine(metadata.title) || "Unknown"}`,
      `- Channel: ${safeLine(metadata.channel) || "Unknown"}`,
      `- URL: ${safeLine(metadata.url) || "Unknown"}`,
      "",
      "Glossary priority:",
      "- User glossary > video memory glossary > model default translation.",
      "",
      "User glossary:",
      lockedUserGlossary.length
        ? JSON.stringify(lockedUserGlossary)
        : "[]",
      "",
      "Previous captions:",
    ];

    if (boundedContext.length === 0) {
      lines.push("- None");
    } else {
      boundedContext.forEach((item, index) => {
        const source = safeLine(item.source);
        const translation = safeLine(item.translation);
        lines.push(
          `${index + 1}. EN: ${source}${translation ? ` | ZH: ${translation}` : ""}`,
        );
      });
    }

    if (normalizeCaptionText(customInstructions)) {
      lines.push("", "User translation preferences:", normalizeCaptionText(customInstructions));
    }

    lines.push("", "Current caption:", current);

    return lines.join("\n");
  }

  function stripFences(text) {
    const value = String(text || "").trim();
    const match = value.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
    return match ? match[1].trim() : value;
  }

  function extractTranslationFromText(text) {
    const stripped = stripFences(text);
    if (!stripped) {
      return "";
    }

    const candidates = [stripped];
    const objectMatch = stripped.match(/\{[\s\S]*"translation"\s*:[\s\S]*\}/);
    if (objectMatch) {
      candidates.push(objectMatch[0]);
    }

    for (const candidate of candidates) {
      try {
        const parsed = JSON.parse(candidate);
        if (parsed && typeof parsed.translation === "string") {
          return cleanTranslationText(parsed.translation);
        }
      } catch (_error) {
        // Plain-text fallback is intentional because providers may ignore JSON mode.
      }
    }

    return cleanTranslationText(stripped.replace(/^["']|["']$/g, ""));
  }

  function extractOpenAiCompatibleText(data) {
    return data?.choices?.[0]?.message?.content || "";
  }

  function extractGeminiText(data) {
    return (data?.candidates?.[0]?.content?.parts || [])
      .map((part) => part.text || "")
      .join("");
  }

  function extractProviderResponseText(provider, data) {
    if (provider === "deepseek" || provider === "openrouter") {
      return extractOpenAiCompatibleText(data);
    }
    return extractGeminiText(data);
  }

  function parseProviderResponse(provider, data) {
    return extractTranslationFromText(extractProviderResponseText(provider, data));
  }

  function stableContextString(context) {
    return (context || [])
      .filter((item) => item && normalizeCaptionText(item.source))
      .map((item) => `${normalizeCaptionText(item.source)}=>${normalizeCaptionText(item.translation)}`)
      .join("||");
  }

  function createSourceCleanHash(value) {
    return stableHash(normalizeCaptionText(value).toLowerCase());
  }

  function createCaptionCacheKey(options = {}) {
    const {
      provider,
      model,
      videoId,
      currentText,
      context,
      sourceLanguage = "",
      targetLanguage = "",
      promptVersion = "",
      glossaryVersion = "",
      segmentId = "",
      sourceClean = "",
      sourceCleanHash = "",
    } = options;
    const normalizedSourceClean = normalizeCaptionText(sourceClean);
    const effectiveSourceHash =
      sourceCleanHash ||
      (normalizedSourceClean
        ? createSourceCleanHash(normalizedSourceClean)
        : normalizeCaptionText(currentText).toLowerCase());
    return [
      provider || "",
      model || "",
      videoId || "",
      sourceLanguage || "",
      targetLanguage || "",
      promptVersion || "",
      glossaryVersion || "",
      segmentId || "",
      effectiveSourceHash,
      stableContextString(context),
    ].join("::");
  }

  function normalizePageUrlForCache(value) {
    const raw = normalizeCaptionText(value);
    if (!raw) {
      return "";
    }
    try {
      const url = new URL(raw);
      url.hash = "";
      Array.from(url.searchParams.keys()).forEach((key) => {
        const normalizedKey = key.toLowerCase();
        if (
          normalizedKey.startsWith("utm_") ||
          normalizedKey === "fbclid" ||
          normalizedKey === "gclid"
        ) {
          url.searchParams.delete(key);
        }
      });
      url.searchParams.sort();
      const query = url.searchParams.toString();
      return `${url.origin}${url.pathname}${query ? `?${query}` : ""}`;
    } catch (_error) {
      return raw.replace(/#.*$/, "");
    }
  }

  function createWebPageTranslationCacheKey(options = {}) {
    const sourceHash =
      options.sourceTextHash ||
      createSourceCleanHash(normalizeCaptionText(options.sourceText).toLowerCase());
    const headingHash = stableHash(
      (Array.isArray(options.headingPath) ? options.headingPath : [])
        .map(normalizeCaptionText)
        .filter(Boolean)
        .join(" > ")
        .toLowerCase(),
    );
    const protectedTermsHash = stableHash(
      JSON.stringify(
        normalizeWebPageProtectedTerms(
          options.protectedTerms || options.protected_terms,
        ),
      ),
    );
    return [
      normalizeCaptionText(options.provider).toLowerCase(),
      normalizeCaptionText(options.model).toLowerCase(),
      normalizePageUrlForCache(options.pageUrl),
      normalizeCaptionText(options.sourceLanguage).toLowerCase(),
      normalizeCaptionText(options.targetLanguage),
      normalizeCaptionText(options.promptVersion),
      normalizeCaptionText(options.glossaryVersion),
      headingHash,
      protectedTermsHash,
      sourceHash,
    ].join("::");
  }

  function sortWebPageBlocksByPosition(blocks, options = {}) {
    const rowTolerance = Number.isFinite(Number(options.rowTolerance))
      ? Number(options.rowTolerance)
      : 16;
    return (Array.isArray(blocks) ? blocks : [])
      .slice()
      .sort((left, right) => {
        const leftTop = Number(left?.top);
        const rightTop = Number(right?.top);
        const safeLeftTop = Number.isFinite(leftTop) ? leftTop : 0;
        const safeRightTop = Number.isFinite(rightTop) ? rightTop : 0;
        const topDelta = safeLeftTop - safeRightTop;
        if (Math.abs(topDelta) > rowTolerance) {
          return topDelta;
        }

        const leftX = Number(left?.left);
        const rightX = Number(right?.left);
        const safeLeftX = Number.isFinite(leftX) ? leftX : 0;
        const safeRightX = Number.isFinite(rightX) ? rightX : 0;
        const leftDelta = safeLeftX - safeRightX;
        if (Math.abs(leftDelta) > 1) {
          return leftDelta;
        }

        return Number(left?.order || 0) - Number(right?.order || 0);
      });
  }

  function applyGlossaryConsistency(options = {}) {
    const cueTranslations = options.cueTranslations || {};
    const cueSources = options.cueSources || {};
    const glossary = normalizeGlossaryForPrompt(options.glossary || [])
      .filter((item) => item.locked);
    return Object.entries(cueTranslations).reduce((result, [id, translation]) => {
      let nextTranslation = cleanTranslationText(translation);
      const source = normalizeCaptionText(cueSources[id]).toLowerCase();
      for (const item of glossary) {
        if (!source.includes(item.source.toLowerCase())) {
          continue;
        }
        if (nextTranslation.toLowerCase().includes(item.target.toLowerCase())) {
          continue;
        }
        nextTranslation = `${nextTranslation} ${item.target}`.trim();
      }
      if (id && nextTranslation) {
        result[id] = nextTranslation;
      }
      return result;
    }, {});
  }

  function getYouTubeVideoId(url) {
    try {
      const parsed = new URL(url);
      if (parsed.hostname.includes("youtube.com")) {
        return parsed.searchParams.get("v") || "";
      }
      if (parsed.hostname === "youtu.be") {
        return parsed.pathname.replace(/^\//, "");
      }
    } catch (_error) {
      return "";
    }
    return "";
  }

  function buildProviderRequest({ provider, model, prompt, maxOutputTokens }) {
    const normalizedProvider =
      provider === "deepseek" || provider === "openrouter" ? provider : "gemini";
    const normalizedModel = normalizeCaptionText(model);
    const normalizedPrompt = String(prompt || "");
    const tokenLimit = clampInteger(maxOutputTokens, 64, 8192, 256);

    if (normalizedProvider === "deepseek") {
      return {
        url: "https://api.deepseek.com/chat/completions",
        options: {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({
            model: normalizedModel || DEFAULT_SETTINGS.deepseekModel,
            thinking: { type: "disabled" },
            messages: [
              {
                role: "system",
                content:
                  "You are a precise subtitle translator. Return only valid JSON.",
              },
              {
                role: "user",
                content: normalizedPrompt,
              },
            ],
            temperature: 0.2,
            max_tokens: tokenLimit,
            response_format: { type: "json_object" },
          }),
        },
      };
    }

    if (normalizedProvider === "openrouter") {
      return {
        url: "https://openrouter.ai/api/v1/chat/completions",
        options: {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "HTTP-Referer": "https://www.youtube.com/",
            "X-OpenRouter-Title": "YouTube Context Translator",
          },
          body: JSON.stringify({
            model: normalizedModel || DEFAULT_SETTINGS.openrouterModel,
            messages: [
              {
                role: "system",
                content:
                  "You are a precise subtitle translator. Return only valid JSON.",
              },
              {
                role: "user",
                content: normalizedPrompt,
              },
            ],
            temperature: 0.2,
            max_tokens: tokenLimit,
            response_format: { type: "json_object" },
            plugins: [{ id: "response-healing" }],
          }),
        },
      };
    }

    return {
      url: `https://generativelanguage.googleapis.com/v1beta/models/${
        encodeURIComponent(normalizedModel || DEFAULT_SETTINGS.geminiModel)
      }:generateContent`,
      options: {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [{ text: normalizedPrompt }],
            },
          ],
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: tokenLimit,
            responseMimeType: "application/json",
          },
        }),
      },
    };
  }

  const api = {
    DEFAULT_SETTINGS,
    COURSE_TRANSLATION_GUIDANCE,
    TRANSLATION_PROMPT_VERSION,
    WEB_TRANSLATION_PROMPT_VERSION,
    normalizeCaptionText,
    isProbablyCodeText,
    splitWebPageTextSegments,
    parseUserGlossary,
    createGlossaryVersion,
    createSourceCleanHash,
    applyGlossaryConsistency,
    extractVisibleCaptionText,
    isNonSpeechCaptionText,
    buildBilingualCaption,
    extractCaptionTracksFromScripts,
    chooseCaptionTrack,
    extractYouTubePageConfigFromScripts,
    extractTranscriptParamsFromScripts,
    captionUrlWithFormat,
    parseJson3Captions,
    parseCaptionTrackText,
    parseTranscriptResponseCaptions,
    parseTranscriptPanelCaptions,
    parseTranscriptDomRows,
    findCueAtTime,
    shouldRetryTranscriptDomTimeline,
    cleanCaptionSourceText,
    buildTranslationSegmentsFromCues,
    buildSegmentTranslationPrompt,
    parseSegmentTranslationResponse,
    buildWebPageTranslationPrompt,
    parseWebPageTranslationResponse,
    buildWebPageMemoryPrompt,
    parseWebMemoryResponse,
    normalizeWebPageProtectedTerms,
    validateWebPageTranslationResult,
    buildWebPageRepairPrompt,
    parseWebTranslationSiteRules,
    matchWebTranslationSiteRule,
    buildVideoMemoryChunks,
    buildVideoMemoryPrompt,
    buildVideoMemoryReducePrompt,
    parseVideoMemoryResponse,
    mergeVideoMemoryItems,
    normalizeSettings,
    getApiKeyForProvider,
    getModelForProvider,
    buildTranslationPrompt,
    buildBatchTranslationPrompt,
    parseBatchTranslationResponse,
    compactTimelineForSummary,
    buildVideoSummaryPrompt,
    parseVideoSummaryResponse,
    createVideoSummaryCacheKey,
    extractTranslationFromText,
    extractProviderResponseText,
    parseProviderResponse,
    createCaptionCacheKey,
    createWebPageTranslationCacheKey,
    sortWebPageBlocksByPosition,
    getYouTubeVideoId,
    buildProviderRequest,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.YTContextTranslatorCore = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
