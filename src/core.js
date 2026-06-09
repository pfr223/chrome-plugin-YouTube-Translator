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

  function hasSentenceEnding(text) {
    return /[.!?。！？]$/.test(normalizeCaptionText(text));
  }

  function cleanCaptionSourceText(value, options = {}) {
    let text = normalizeCaptionText(value);
    if (options.captionKind !== "asr") {
      return text;
    }

    [
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
    const maxCuesPerSegment = clampInteger(options.maxCuesPerSegment, 1, 10, 5);
    const maxSegmentChars = clampInteger(options.maxSegmentChars, 80, 600, 220);
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
      if (
        previous &&
        Number.isFinite(maxGapSeconds) &&
        cue.start - previous.end > maxGapSeconds
      ) {
        flush();
      }

      current.push(cue);
      const currentText = current.map((item) => item.sourceClean).join(" ");
      if (
        hasSentenceEnding(cue.sourceClean) ||
        current.length >= maxCuesPerSegment ||
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
    const promptInput = {
      videoMemory: compactMemory,
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
    cleanCaptionSourceText,
    buildTranslationSegmentsFromCues,
    buildSegmentTranslationPrompt,
    parseSegmentTranslationResponse,
    normalizeSettings,
    getApiKeyForProvider,
    getModelForProvider,
    buildTranslationPrompt,
    buildBatchTranslationPrompt,
    parseBatchTranslationResponse,
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
