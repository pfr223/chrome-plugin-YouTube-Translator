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
    overlayOpacityPercent: 78,
    overlayFontScalePercent: 100,
    overlayXPercent: 50,
    overlayYPercent: 86,
  });
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
        const nextStart = Number(rawCues[index + 1]?.start);
        const videoDuration = Number(videoDurationSeconds);
        const end =
          Number.isFinite(nextStart) && nextStart > cue.start
            ? nextStart - 0.001
            : Number.isFinite(videoDuration) && videoDuration > cue.start
              ? videoDuration
              : cue.start + 5;
        return {
          start: cue.start,
          end,
          source: cue.source,
        };
      }),
    );
  }

  function parseTranscriptDomRows(rows, videoDurationSeconds) {
    const rawCues = [];
    const seen = new Set();

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

      if (!source || !Number.isFinite(start) || seen.has(key)) {
        return;
      }
      seen.add(key);
      rawCues.push({ start, source });
    });

    rawCues.sort((left, right) => Number(left.start) - Number(right.start));
    return makeTimeline(
      rawCues.map((cue, index) => {
        const nextStart = Number(rawCues[index + 1]?.start);
        const videoDuration = Number(videoDurationSeconds);
        const end =
          Number.isFinite(nextStart) && nextStart > cue.start
            ? nextStart - 0.001
            : Number.isFinite(videoDuration) && videoDuration > cue.start
              ? videoDuration
              : cue.start + 5;
        return {
          start: cue.start,
          end,
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
      maxContextItems = DEFAULT_SETTINGS.contextItems,
    } = options || {};

    const current = normalizeCaptionText(currentText);
    const contextLimit = clampInteger(maxContextItems, 0, 20, DEFAULT_SETTINGS.contextItems);
    const boundedContext = context
      .filter((item) => item && normalizeCaptionText(item.source))
      .slice(-contextLimit);

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

  function createCaptionCacheKey({ provider, model, videoId, currentText, context }) {
    return [
      provider || "",
      model || "",
      videoId || "",
      normalizeCaptionText(currentText).toLowerCase(),
      stableContextString(context),
    ].join("::");
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
    normalizeCaptionText,
    extractVisibleCaptionText,
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
    getYouTubeVideoId,
    buildProviderRequest,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.YTContextTranslatorCore = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
