(function initContentScript() {
  const core = globalThis.YTContextTranslatorCore;
  const YTCT_INSTANCE_ID = `ytct-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2)}`;
  const state = {
    settings: core.normalizeSettings({}),
    hasApiKey: false,
    lastText: "",
    requestId: 0,
    checkTimer: 0,
    overlay: null,
    history: [],
    cache: new Map(),
    videoId: "",
    timeline: [],
    timelineMode: "loading",
    timelineTimer: 0,
    timelineLoadToken: 0,
    batchInFlight: false,
    lastPrefetchAt: 0,
    pageBridgePromise: null,
    fallbackInFlight: false,
    queuedFallbackText: "",
    pendingFallbackText: "",
    fallbackStableTimer: 0,
    fallbackMaxTimer: 0,
    fallbackBackoffUntil: 0,
    transcriptRetryTimer: 0,
    transcriptRetryInFlight: false,
    lastTranscriptRetryAt: 0,
    overlayDragging: false,
    overlayDragPointerId: null,
    lastRenderKey: "",
  };
  const MAX_LOCAL_CACHE_ITEMS = 150;
  const MAX_HISTORY_ITEMS = 30;
  const MESSAGE_TIMEOUT_MS = 22000;
  const BATCH_MESSAGE_TIMEOUT_MS = 35000;
  const TIMELINE_RENDER_INTERVAL_MS = 180;
  const TIMELINE_BATCH_SIZE = 10;
  const TIMELINE_PREFETCH_CUES = 28;
  const PREFETCH_THROTTLE_MS = 900;
  const CAPTION_TRACK_FORMATS = ["json3", "srv3", "vtt", "srv1"];
  const FALLBACK_ERROR_BACKOFF_MS = 8000;
  const FALLBACK_STABLE_DELAY_MS = 260;
  const FALLBACK_MAX_WAIT_MS = 900;
  const TRANSCRIPT_RETRY_DEBOUNCE_MS = 300;
  const TRANSCRIPT_RETRY_THROTTLE_MS = 3000;
  const OVERLAY_WIDTH_RATIO = 2 / 3;

  function clampNumber(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function getViewportSize() {
    return {
      width: window.innerWidth || document.documentElement.clientWidth || 0,
      height: window.innerHeight || document.documentElement.clientHeight || 0,
    };
  }

  function overlayWidthFromPlayer() {
    const playerRect = getPlayer().getBoundingClientRect();
    return Math.max(0, Math.round(playerRect.width * OVERLAY_WIDTH_RATIO));
  }

  function clampOverlayXPercent(value, overlayWidthPx) {
    const viewport = getViewportSize();
    const halfWidthPercent =
      viewport.width > 0 ? ((overlayWidthPx / 2) / viewport.width) * 100 : 0;
    return clampNumber(
      Number(value),
      halfWidthPercent,
      100 - halfWidthPercent,
    );
  }

  function clampOverlayYPercent(value) {
    return clampNumber(Number(value), 0, 100);
  }

  function sendMessage(message, timeoutMs = MESSAGE_TIMEOUT_MS) {
    return new Promise((resolve, reject) => {
      const timeoutId = window.setTimeout(() => {
        reject(new Error("翻译请求超时，请检查 API key、网络或更换模型。"));
      }, timeoutMs);

      chrome.runtime.sendMessage(message, (response) => {
        window.clearTimeout(timeoutId);
        const lastError = chrome.runtime.lastError;
        if (lastError) {
          reject(new Error(lastError.message));
          return;
        }
        resolve(response);
      });
    });
  }

  async function refreshSettings() {
    try {
      const response = await sendMessage({ type: "YTCT_GET_SETTINGS" });
      if (response?.ok && response.settings) {
        state.settings = core.normalizeSettings(response.settings);
        state.hasApiKey = Boolean(response.settings.hasApiKey);
      }
    } catch (_error) {
      // The page may keep a stale content script after extension reload.
    }
  }

  function getPlayer() {
    return document.querySelector(".html5-video-player") || document.body;
  }

  function getOverlayHost() {
    return document.fullscreenElement || document.body;
  }

  function removeStaleOverlays() {
    document.querySelectorAll(".ytct-overlay").forEach((element) => {
      if (element !== state.overlay) {
        element.remove();
      }
    });
  }

  function applyOverlayStyle() {
    if (!state.overlay) {
      return;
    }
    const settings = state.settings;
    const overlayWidthNumber = overlayWidthFromPlayer();
    const overlayWidthPx = `${overlayWidthNumber}px`;
    const safeXPercent = clampOverlayXPercent(
      settings.overlayXPercent,
      overlayWidthNumber,
    );
    const safeYPercent = clampOverlayYPercent(settings.overlayYPercent);
    state.overlay.style.setProperty(
      "--ytct-font-scale",
      String(settings.overlayFontScalePercent / 100),
    );
    Object.assign(state.overlay.style, {
      position: "fixed",
      left: `${safeXPercent}vw`,
      top: `${safeYPercent}vh`,
      bottom: "auto",
      width: overlayWidthPx,
      minWidth: overlayWidthPx,
      maxWidth: overlayWidthPx,
      transform: "translate(-50%, -100%)",
      background: `rgba(8, 8, 8, ${settings.overlayOpacityPercent / 100})`,
      pointerEvents: "auto",
      cursor: state.overlayDragging ? "grabbing" : "grab",
      touchAction: "none",
      userSelect: "none",
    });
  }

  function persistOverlayPosition() {
    sendMessage({
      type: "YTCT_SAVE_SETTINGS",
      settings: {
        overlayXPercent: state.settings.overlayXPercent,
        overlayYPercent: state.settings.overlayYPercent,
      },
    }).catch(() => {
      // Dragging should never interrupt caption playback.
    });
  }

  function updateOverlayPositionFromPointer(event) {
    const viewport = getViewportSize();
    if (viewport.width <= 0 || viewport.height <= 0) {
      return;
    }
    const overlayWidthNumber = overlayWidthFromPlayer();
    const nextX = Math.round(
      clampOverlayXPercent(
        (event.clientX / viewport.width) * 100,
        overlayWidthNumber,
      ),
    );
    const nextY = Math.round(
      clampOverlayYPercent((event.clientY / viewport.height) * 100),
    );
    state.settings = core.normalizeSettings({
      ...state.settings,
      overlayXPercent: nextX,
      overlayYPercent: nextY,
    });
    applyOverlayStyle();
  }

  function handleOverlayPointerDown(event) {
    if (event.button !== 0 || !state.overlay || state.overlay.hidden) {
      return;
    }
    state.overlayDragging = true;
    state.overlayDragPointerId = event.pointerId;
    state.overlay.setPointerCapture?.(event.pointerId);
    updateOverlayPositionFromPointer(event);
    applyOverlayStyle();
    event.preventDefault();
    event.stopPropagation();
  }

  function handleOverlayPointerMove(event) {
    if (
      !state.overlayDragging ||
      state.overlayDragPointerId !== event.pointerId
    ) {
      return;
    }
    updateOverlayPositionFromPointer(event);
    event.preventDefault();
    event.stopPropagation();
  }

  function handleOverlayPointerUp(event) {
    if (
      !state.overlayDragging ||
      state.overlayDragPointerId !== event.pointerId
    ) {
      return;
    }
    state.overlayDragging = false;
    state.overlayDragPointerId = null;
    state.overlay?.releasePointerCapture?.(event.pointerId);
    applyOverlayStyle();
    persistOverlayPosition();
    event.preventDefault();
    event.stopPropagation();
  }

  function ensureOverlay() {
    removeStaleOverlays();
    const host = getOverlayHost();
    if (!state.overlay || !state.overlay.isConnected) {
      state.overlay = document.createElement("div");
      state.overlay.className = "ytct-overlay";
      state.overlay.hidden = true;
      state.overlay.addEventListener("pointerdown", handleOverlayPointerDown);
      state.overlay.addEventListener("pointermove", handleOverlayPointerMove);
      state.overlay.addEventListener("pointerup", handleOverlayPointerUp);
      state.overlay.addEventListener("pointercancel", handleOverlayPointerUp);
    }
    state.overlay.dataset.ytctInstanceId = YTCT_INSTANCE_ID;
    Object.assign(state.overlay.style, {
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
    });
    applyOverlayStyle();

    if (host && state.overlay.parentElement !== host) {
      host.appendChild(state.overlay);
    }
    removeStaleOverlays();

    return state.overlay;
  }

  function renderOverlay(text, mode, sourceText = "") {
    const overlay = ensureOverlay();
    const caption = core.buildBilingualCaption({
      source: sourceText,
      translation: text,
    });
    const lines = caption.lines.slice();
    const reserveTranslationLine =
      caption.source && !caption.translation && mode !== "error";
    if (reserveTranslationLine) {
      lines.push({ lang: "translation", text: "\u00a0", placeholder: true });
    }
    const renderKey = JSON.stringify({
      mode: mode || "ready",
      lines: lines.map((line) => ({
        lang: line.lang,
        text: line.text,
        placeholder: Boolean(line.placeholder),
      })),
    });
    overlay.dataset.mode = mode || "ready";
    overlay.hidden = lines.length === 0;
    document.documentElement.classList.toggle(
      "ytct-hide-native-captions",
      state.settings.enabled && !overlay.hidden,
    );
    if (renderKey === state.lastRenderKey) {
      updateOverlayDiagnostics();
      return;
    }
    state.lastRenderKey = renderKey;
    overlay.replaceChildren(
      ...lines.map((line) => {
        const element = document.createElement("div");
        element.className = `ytct-line ytct-line-${line.lang}${
          line.placeholder ? " ytct-line-placeholder" : ""
        }`;
        element.textContent = line.text;
        Object.assign(element.style, {
          width: "auto",
          background: "transparent",
        });
        return element;
      }),
    );
    updateOverlayDiagnostics();
  }

  function updateOverlayDiagnostics(extra = {}) {
    if (!state.overlay) {
      return;
    }

    const counts = state.timeline.reduce(
      (result, cue) => {
        const status = cue.status || "unknown";
        result[status] = (result[status] || 0) + 1;
        return result;
      },
      {},
    );
    state.overlay.dataset.timelineMode = state.timelineMode;
    state.overlay.dataset.timelineCues = String(state.timeline.length);
    state.overlay.dataset.timelineReady = String(counts.ready || 0);
    state.overlay.dataset.timelinePending = String(counts.pending || 0);
    state.overlay.dataset.timelineTranslating = String(counts.translating || 0);
    state.overlay.dataset.timelineBatchInFlight = String(state.batchInFlight);
    for (const [key, value] of Object.entries(extra)) {
      state.overlay.dataset[key] = String(value);
    }
  }

  function readCaptionText() {
    const segments = Array.from(
      document.querySelectorAll(".html5-video-player .ytp-caption-segment"),
    ).map((element) => {
      const rect = element.getBoundingClientRect();
      const windowRect = element
        .closest(".caption-window")
        ?.getBoundingClientRect();
      return {
        text: element.textContent || "",
        rect: {
          top: rect.top,
          bottom: rect.bottom,
          left: rect.left,
        },
        windowRect: windowRect
          ? {
              top: windowRect.top,
              bottom: windowRect.bottom,
            }
          : null,
      };
    });

    return core.extractVisibleCaptionText(segments);
  }

  function readMetadata() {
    const title =
      document.querySelector("h1.ytd-watch-metadata yt-formatted-string")
        ?.textContent ||
      document.querySelector("h1.title")?.textContent ||
      document.title.replace(/\s+-\s+YouTube$/, "");
    const channel =
      document.querySelector("#owner ytd-channel-name a")?.textContent ||
      document.querySelector("ytd-video-owner-renderer ytd-channel-name a")
        ?.textContent ||
      "";

    return {
      title: core.normalizeCaptionText(title),
      channel: core.normalizeCaptionText(channel),
      url: location.href,
    };
  }

  function readCaptionTracks() {
    return core.extractCaptionTracksFromScripts(readPageScripts());
  }

  function readTranscriptDomRows() {
    const rows = [];
    const seen = new Set();
    const timestampPattern = /\b\d{1,2}:\d{2}(?::\d{2})?(?:\.\d+)?\b/;
    const segmentElements = Array.from(
      document.querySelectorAll("ytd-transcript-segment-renderer"),
    );

    segmentElements.forEach((element) => {
      const rowText = core.normalizeCaptionText(element.textContent || "");
      const timestampElement = element.querySelector(
        ".segment-timestamp, [class*='timestamp'], yt-formatted-string[class*='timestamp']",
      );
      const timestamp =
        core.normalizeCaptionText(timestampElement?.textContent || "") ||
        core.normalizeCaptionText(rowText.match(timestampPattern)?.[0] || "");
      if (!timestamp) {
        return;
      }

      const textElement = element.querySelector(
        ".segment-text, [class*='segment-text'], yt-formatted-string[class*='segment-text']",
      );
      const text = core.normalizeCaptionText(
        textElement?.textContent || rowText.replace(timestampPattern, ""),
      );
      const key = `${timestamp}::${text.toLowerCase()}`;
      if (!text || seen.has(key)) {
        return;
      }
      seen.add(key);
      rows.push({ timestamp, text, rowText });
    });

    return rows;
  }

  function readPageScripts() {
    return Array.from(document.scripts).map((script) => script.textContent || "");
  }

  function ensurePageBridge() {
    if (state.pageBridgePromise) {
      return state.pageBridgePromise;
    }

    state.pageBridgePromise = new Promise((resolve, reject) => {
      if (document.getElementById("ytct-page-bridge")) {
        resolve();
        return;
      }

      const script = document.createElement("script");
      script.id = "ytct-page-bridge";
      script.src = chrome.runtime.getURL("src/page_bridge.js");
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("page-bridge-load-failed"));
      (document.head || document.documentElement).appendChild(script);
    });
    return state.pageBridgePromise;
  }

  async function requestPageTranscript() {
    await ensurePageBridge();
    const requestId = `ytct-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    return new Promise((resolve, reject) => {
      const timeoutId = window.setTimeout(() => {
        window.removeEventListener("message", onMessage);
        reject(new Error("page-bridge-timeout"));
      }, 12000);

      function onMessage(event) {
        if (event.source !== window) {
          return;
        }
        const message = event.data || {};
        if (
          message.source !== "YTCT_PAGE_BRIDGE" ||
          message.type !== "FETCH_TRANSCRIPT_RESULT" ||
          message.requestId !== requestId
        ) {
          return;
        }

        window.clearTimeout(timeoutId);
        window.removeEventListener("message", onMessage);
        if (message.ok) {
          resolve(message.data);
        } else {
          reject(new Error(message.error || "page-bridge-failed"));
        }
      }

      window.addEventListener("message", onMessage);
      window.postMessage(
        {
          source: "YTCT_CONTENT",
          type: "FETCH_TRANSCRIPT",
          requestId,
        },
        "*",
      );
    });
  }

  async function requestPageTranscriptPanel(payload = {}) {
    await ensurePageBridge();
    const requestId = `ytct-panel-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    return new Promise((resolve, reject) => {
      const timeoutId = window.setTimeout(() => {
        window.removeEventListener("message", onMessage);
        reject(new Error("page-panel-timeout"));
      }, 16000);

      function onMessage(event) {
        if (event.source !== window) {
          return;
        }
        const message = event.data || {};
        if (
          message.source !== "YTCT_PAGE_BRIDGE" ||
          message.type !== "FETCH_TRANSCRIPT_PANEL_RESULT" ||
          message.requestId !== requestId
        ) {
          return;
        }

        window.clearTimeout(timeoutId);
        window.removeEventListener("message", onMessage);
        if (message.ok) {
          resolve(message.data);
        } else {
          reject(new Error(message.error || "page-panel-failed"));
        }
      }

      window.addEventListener("message", onMessage);
      window.postMessage(
        {
          source: "YTCT_CONTENT",
          type: "FETCH_TRANSCRIPT_PANEL",
          requestId,
          payload,
        },
        "*",
      );
    });
  }

  function switchToFallback(reason) {
    state.timelineMode = "fallback";
    clearFallbackDebounce();
    updateOverlayDiagnostics({ timelineError: reason || "fallback" });
    scheduleCaptionCheck();
    window.setTimeout(handleCaptionChange, 0);
  }

  function scheduleTranscriptTimelineRetry() {
    if (state.timelineMode !== "fallback" || !state.settings.enabled) {
      return;
    }
    window.clearTimeout(state.transcriptRetryTimer);
    state.transcriptRetryTimer = window.setTimeout(
      retryTranscriptTimelineFromDom,
      TRANSCRIPT_RETRY_DEBOUNCE_MS,
    );
  }

  async function retryTranscriptTimelineFromDom() {
    const domRows = readTranscriptDomRows();
    const now = Date.now();
    if (
      !core.shouldRetryTranscriptDomTimeline({
        timelineMode: state.timelineMode,
        domRowCount: domRows.length,
        retryInFlight: state.transcriptRetryInFlight,
        lastRetryAt: state.lastTranscriptRetryAt,
        now,
        throttleMs: TRANSCRIPT_RETRY_THROTTLE_MS,
      })
    ) {
      return;
    }

    const timeline = core.parseTranscriptDomRows(
      domRows,
      Number(getVideo()?.duration),
    );
    if (timeline.length === 0) {
      return;
    }

    state.lastTranscriptRetryAt = now;
    state.transcriptRetryInFlight = true;
    try {
      await loadCaptionTimeline();
    } finally {
      state.transcriptRetryInFlight = false;
    }
  }

  async function fetchCaptionTimeline(baseUrl) {
    let lastError = "empty";
    for (const format of CAPTION_TRACK_FORMATS) {
      const url = core.captionUrlWithFormat(baseUrl, format);
      if (!url) {
        lastError = "bad-url";
        continue;
      }

      const response = await fetch(url, { credentials: "include" });
      if (!response.ok) {
        lastError = `${format}-${response.status}`;
        continue;
      }

      const body = await response.text();
      const timeline = core.parseCaptionTrackText(body, format);
      if (timeline.length > 0) {
        return { format, timeline };
      }
      lastError = `empty-${format}`;
    }

    throw new Error(lastError);
  }

  async function fetchTranscriptPanelTimeline(track) {
    const video = getVideo();
    const existingDomTimeline = core.parseTranscriptDomRows(
      readTranscriptDomRows(),
      Number(video?.duration),
    );
    if (existingDomTimeline.length > 0) {
      return { format: "transcript-dom", timeline: existingDomTimeline };
    }

    const panel = await requestPageTranscriptPanel({
      languageCode: track?.languageCode || "",
    });
    const domRows = Array.isArray(panel?.domRows) && panel.domRows.length > 0
      ? panel.domRows
      : readTranscriptDomRows();
    const domTimeline = core.parseTranscriptDomRows(
      domRows,
      Number(video?.duration),
    );
    if (domTimeline.length > 0) {
      return { format: "transcript-panel-dom", timeline: domTimeline };
    }
    if (!panel?.body || Number(panel.status) !== 200) {
      throw new Error(`panel-${panel?.status || "empty"}`);
    }

    let timeline = [];
    if (panel.endpoint === "transcript") {
      timeline = core.parseTranscriptResponseCaptions(JSON.parse(panel.body));
    } else {
      timeline = core.parseTranscriptPanelCaptions(
        panel.body,
        Number(video?.duration),
      );
    }
    if (timeline.length === 0) {
      throw new Error("empty-transcript-panel");
    }
    return { format: "transcript-panel", timeline };
  }

  async function fetchTranscriptTimeline(scripts, track) {
    const errors = [];
    try {
      const data = await requestPageTranscript();
      const timeline = core.parseTranscriptResponseCaptions(data);
      if (timeline.length > 0) {
        return { format: "transcript-bridge", timeline };
      }
      errors.push("empty-transcript-bridge");
    } catch (error) {
      errors.push(error.message || "page-bridge-failed");
    }

    const config = core.extractYouTubePageConfigFromScripts(scripts);
    const params = core.extractTranscriptParamsFromScripts(scripts);
    if (config.apiKey && config.context && params) {
      try {
        const headers = {
          "content-type": "application/json",
        };
        if (config.visitorData) {
          headers["x-goog-visitor-id"] = config.visitorData;
        }
        if (config.clientName) {
          headers["x-youtube-client-name"] = String(config.clientName);
        }
        if (config.clientVersion) {
          headers["x-youtube-client-version"] = config.clientVersion;
        }

        const response = await fetch(
          `https://www.youtube.com/youtubei/v1/get_transcript?key=${encodeURIComponent(
            config.apiKey,
          )}&prettyPrint=false`,
          {
            method: "POST",
            credentials: "include",
            headers,
            body: JSON.stringify({
              context: config.context,
              params,
            }),
          },
        );
        if (!response.ok) {
          throw new Error(`transcript-${response.status}`);
        }

        const data = await response.json();
        const timeline = core.parseTranscriptResponseCaptions(data);
        if (timeline.length > 0) {
          return { format: "transcript", timeline };
        }
        errors.push("empty-transcript");
      } catch (error) {
        errors.push(error.message || "transcript-failed");
      }
    } else {
      errors.push("no-transcript-endpoint");
    }

    try {
      return await fetchTranscriptPanelTimeline(track);
    } catch (error) {
      errors.push(error.message || "panel-failed");
    }

    throw new Error(errors.filter(Boolean).slice(-3).join(" | ") || "transcript-failed");
  }

  async function loadCaptionTimeline() {
    const loadToken = ++state.timelineLoadToken;
    state.timelineMode = "loading";
    state.timeline = [];
    updateOverlayDiagnostics({ timelineError: "" });
    window.clearInterval(state.timelineTimer);
    state.timelineTimer = 0;

    try {
      const scripts = readPageScripts();
      const tracks = core.extractCaptionTracksFromScripts(scripts);
      const track = core.chooseCaptionTrack(tracks);
      if (!track && tracks.some((captionTrack) => captionTrack.baseUrl)) {
        switchToFallback("no-english-track");
        return;
      }
      let result = null;
      let transcriptError = "";
      let timedTextError = track ? "" : "no-track";
      const preferTranscript = !track || track.kind === "asr";

      if (preferTranscript) {
        try {
          result = await fetchTranscriptTimeline(scripts, track);
        } catch (error) {
          transcriptError = error.message || "transcript-failed";
        }
      }

      if (!result && track) {
        try {
          result = await fetchCaptionTimeline(track.baseUrl);
        } catch (error) {
          timedTextError = error.message || "timedtext-failed";
        }
      }

      if (!result && !preferTranscript) {
        try {
          result = await fetchTranscriptTimeline(scripts, track);
        } catch (error) {
          transcriptError = error.message || "transcript-failed";
        }
      }

      if (!result) {
        throw new Error(transcriptError || timedTextError || "caption-load-failed");
      }

      const { format, timeline } = result;
      if (loadToken !== state.timelineLoadToken) {
        return;
      }
      if (timeline.length === 0) {
        switchToFallback("empty-track");
        return;
      }

      state.timeline = timeline;
      state.timelineMode = "track";
      state.lastText = "";
      updateOverlayDiagnostics({ timelineError: "", timelineFormat: format });
      startTimelineRenderer();
      prefetchTimelineTranslations({ force: true });
    } catch (_error) {
      if (loadToken === state.timelineLoadToken) {
        switchToFallback(_error.message || "load-failed");
      }
    }
  }

  function getVideo() {
    return document.querySelector("video");
  }

  function getCurrentCueIndex() {
    const video = getVideo();
    if (!video || state.timeline.length === 0) {
      return -1;
    }

    const currentCue = core.findCueAtTime(state.timeline, video.currentTime);
    if (currentCue) {
      return state.timeline.findIndex((cue) => cue.id === currentCue.id);
    }

    return state.timeline.findIndex((cue) => cue.start > video.currentTime);
  }

  function renderTimelineCue() {
    if (state.timelineMode !== "track") {
      return;
    }

    if (!state.settings.enabled) {
      renderOverlay("", "ready");
      return;
    }

    const video = getVideo();
    if (!video) {
      renderOverlay("", "ready");
      return;
    }

    const cue = core.findCueAtTime(state.timeline, video.currentTime);
    if (!cue) {
      renderOverlay("", "ready");
      prefetchTimelineTranslations();
      return;
    }

    if (cue.translation) {
      renderOverlay(cue.translation, "ready", cue.source);
    } else {
      renderOverlay("", "ready", cue.source);
    }

    prefetchTimelineTranslations();
  }

  function startTimelineRenderer() {
    window.clearInterval(state.timelineTimer);
    state.timelineTimer = window.setInterval(
      renderTimelineCue,
      TIMELINE_RENDER_INTERVAL_MS,
    );
    renderTimelineCue();
  }

  function nextPendingTimelineBatch() {
    const currentIndex = Math.max(0, getCurrentCueIndex());
    const searchEnd = Math.min(
      state.timeline.length,
      currentIndex + TIMELINE_PREFETCH_CUES,
    );
    return state.timeline
      .slice(currentIndex, searchEnd)
      .filter((cue) => cue.status === "pending" && cue.source)
      .slice(0, TIMELINE_BATCH_SIZE);
  }

  async function prefetchTimelineTranslations(options = {}) {
    if (
      state.timelineMode !== "track" ||
      state.batchInFlight ||
      !state.settings.enabled ||
      !state.hasApiKey
    ) {
      return;
    }
    const now = Date.now();
    if (!options.force && now - state.lastPrefetchAt < PREFETCH_THROTTLE_MS) {
      return;
    }

    const batch = nextPendingTimelineBatch();
    if (batch.length === 0) {
      return;
    }

    state.lastPrefetchAt = now;
    state.batchInFlight = true;
    batch.forEach((cue) => {
      cue.status = "translating";
    });
    updateOverlayDiagnostics();

    try {
      const response = await sendMessage(
        {
          type: "YTCT_TRANSLATE_BATCH",
          payload: {
            videoId: state.videoId,
            cues: batch.map((cue) => ({
              id: cue.id,
              start: cue.start,
              end: cue.end,
              source: cue.source,
            })),
            metadata: readMetadata(),
          },
        },
        BATCH_MESSAGE_TIMEOUT_MS,
      );

      const translations = response?.ok
        ? response.result?.translations || []
        : [];
      const translationMap = translations.reduce((result, item) => {
        result[item.id] = item.translation;
        return result;
      }, {});

      batch.forEach((cue) => {
        const translation = core.normalizeCaptionText(translationMap[cue.id]);
        if (translation) {
          cue.translation = translation;
          cue.status = "ready";
          upsertHistory(cue.source, translation);
        } else {
          cue.status = "pending";
        }
      });
    } catch (_error) {
      batch.forEach((cue) => {
        cue.status = "pending";
      });
    } finally {
      state.batchInFlight = false;
      updateOverlayDiagnostics();
      renderTimelineCue();
      window.setTimeout(() => prefetchTimelineTranslations({ force: true }), 0);
    }
  }

  function rememberLocalCache(key, value) {
    if (state.cache.has(key)) {
      state.cache.delete(key);
    }
    state.cache.set(key, value);
    while (state.cache.size > MAX_LOCAL_CACHE_ITEMS) {
      state.cache.delete(state.cache.keys().next().value);
    }
  }

  function upsertHistory(source, translation) {
    const normalizedSource = core.normalizeCaptionText(source);
    if (!normalizedSource) {
      return;
    }

    const existing = state.history.findLast((item) => item.source === normalizedSource);
    if (existing) {
      if (translation) {
        existing.translation = translation;
      }
      return;
    }

    state.history.push({
      source: normalizedSource,
      translation: translation || "",
    });
    while (state.history.length > MAX_HISTORY_ITEMS) {
      state.history.shift();
    }
  }

  function resetForNavigation() {
    state.lastText = "";
    state.requestId += 1;
    state.history = [];
    state.cache.clear();
    state.timeline = [];
    state.timelineMode = "loading";
    state.batchInFlight = false;
    state.fallbackInFlight = false;
    state.queuedFallbackText = "";
    state.pendingFallbackText = "";
    state.fallbackBackoffUntil = 0;
    state.transcriptRetryInFlight = false;
    state.lastTranscriptRetryAt = 0;
    state.lastRenderKey = "";
    clearFallbackDebounce();
    window.clearTimeout(state.transcriptRetryTimer);
    state.transcriptRetryTimer = 0;
    window.clearInterval(state.timelineTimer);
    state.timelineTimer = 0;
    state.videoId = core.getYouTubeVideoId(location.href);
    renderOverlay("", "ready");
    loadCaptionTimeline();
  }

  function getContext() {
    return state.history
      .filter((item) => item.source !== state.lastText)
      .slice(-state.settings.contextItems);
  }

  async function translateCaption(currentText, requestId) {
    if (!state.hasApiKey) {
      renderOverlay("请先配置 API key", "error");
      return;
    }

    const context = getContext();
    const model = core.getModelForProvider(state.settings);
    const cacheKey = core.createCaptionCacheKey({
      provider: state.settings.provider,
      model,
      videoId: state.videoId,
      currentText,
      context,
    });

    if (state.cache.has(cacheKey)) {
      const cached = state.cache.get(cacheKey);
      upsertHistory(currentText, cached.translation);
      renderOverlay(cached.translation, "ready", currentText);
      return;
    }

    if (state.timelineMode === "fallback") {
      renderOverlay("", "ready", currentText);
    } else {
      renderOverlay("", "loading", currentText);
    }

    const response = await sendMessage({
      type: "YTCT_TRANSLATE",
      payload: {
        videoId: state.videoId,
        currentText,
        context,
        metadata: readMetadata(),
      },
    });

    if (requestId !== state.requestId) {
      return;
    }

    if (!response?.ok) {
      renderOverlay(response?.error || "翻译失败", "error");
      return;
    }

    if (response.result?.skipped) {
      renderOverlay("", "ready", currentText);
      return;
    }

    const translation = core.normalizeCaptionText(response.result?.translation);
    if (!translation) {
      renderOverlay("", "ready", currentText);
      return;
    }

    rememberLocalCache(cacheKey, { translation });
    upsertHistory(currentText, translation);
    renderOverlay(translation, "ready", currentText);
  }

  function startFallbackTranslation(currentText) {
    const requestId = ++state.requestId;
    state.fallbackInFlight = true;
    state.queuedFallbackText = "";
    let failed = false;

    translateCaption(currentText, requestId)
      .catch((error) => {
        failed = true;
        state.fallbackBackoffUntil = Date.now() + FALLBACK_ERROR_BACKOFF_MS;
        if (requestId === state.requestId) {
          renderOverlay(error.message || "翻译失败", "error");
        }
      })
      .finally(() => {
        state.fallbackInFlight = false;
        const nextText = state.queuedFallbackText;
        state.queuedFallbackText = "";
        if (
          state.timelineMode === "fallback" &&
          state.settings.enabled &&
          nextText &&
          nextText !== currentText
        ) {
          startFallbackTranslation(nextText);
          return;
        }
        if (failed) {
          state.lastText = "";
          window.setTimeout(handleCaptionChange, FALLBACK_ERROR_BACKOFF_MS);
          return;
        }
      });
  }

  function clearFallbackDebounce() {
    window.clearTimeout(state.fallbackStableTimer);
    window.clearTimeout(state.fallbackMaxTimer);
    state.fallbackStableTimer = 0;
    state.fallbackMaxTimer = 0;
  }

  function isCaptionTextComplete(text) {
    return /[.!?。！？]$/.test(String(text || "").trim());
  }

  function commitPendingFallbackText() {
    const currentText = state.pendingFallbackText;
    state.pendingFallbackText = "";
    clearFallbackDebounce();

    if (
      state.timelineMode !== "fallback" ||
      !state.settings.enabled ||
      Date.now() < state.fallbackBackoffUntil ||
      !currentText ||
      currentText === state.lastText
    ) {
      return;
    }

    state.lastText = currentText;
    upsertHistory(currentText, "");
    if (state.fallbackInFlight) {
      state.queuedFallbackText = currentText;
      state.requestId += 1;
      renderOverlay("", "ready", currentText);
      return;
    }

    startFallbackTranslation(currentText);
  }

  function handleCaptionChange() {
    if (state.timelineMode !== "fallback") {
      return;
    }

    if (!state.settings.enabled) {
      state.pendingFallbackText = "";
      clearFallbackDebounce();
      renderOverlay("", "ready");
      return;
    }
    if (Date.now() < state.fallbackBackoffUntil) {
      return;
    }

    const currentText = readCaptionText();
    if (!currentText) {
      state.pendingFallbackText = "";
      clearFallbackDebounce();
      state.lastText = "";
      renderOverlay("", "ready");
      return;
    }

    if (currentText === state.lastText || currentText === state.pendingFallbackText) {
      return;
    }

    state.pendingFallbackText = currentText;
    window.clearTimeout(state.fallbackStableTimer);
    if (isCaptionTextComplete(currentText)) {
      commitPendingFallbackText();
      return;
    }
    state.fallbackStableTimer = window.setTimeout(
      commitPendingFallbackText,
      FALLBACK_STABLE_DELAY_MS,
    );
    if (!state.fallbackMaxTimer) {
      state.fallbackMaxTimer = window.setTimeout(
        commitPendingFallbackText,
        FALLBACK_MAX_WAIT_MS,
      );
    }
  }

  function scheduleCaptionCheck() {
    window.clearTimeout(state.checkTimer);
    state.checkTimer = window.setTimeout(handleCaptionChange, 160);
    scheduleTranscriptTimelineRetry();
  }

  function startObservers() {
    const observer = new MutationObserver(scheduleCaptionCheck);
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      characterData: true,
    });
    document.addEventListener("yt-navigate-finish", resetForNavigation);
    document.addEventListener("fullscreenchange", ensureOverlay);
  }

  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === "YTCT_PUBLIC_SETTINGS_UPDATED") {
      state.settings = core.normalizeSettings(message.settings || {});
      state.hasApiKey = Boolean(message.settings?.hasApiKey);
      applyOverlayStyle();
      state.timeline.forEach((cue) => {
        cue.translation = "";
        cue.status = "pending";
      });
      state.batchInFlight = false;
      if (state.timelineMode === "track") {
        prefetchTimelineTranslations({ force: true });
      } else {
        scheduleCaptionCheck();
      }
    }
  });

  refreshSettings().finally(() => {
    state.videoId = core.getYouTubeVideoId(location.href);
    ensureOverlay();
    startObservers();
    loadCaptionTimeline();
  });
})();
