(function initYouTubeContextTranslatorPageBridge() {
  if (window.__YTCT_PAGE_BRIDGE__) {
    return;
  }
  window.__YTCT_PAGE_BRIDGE__ = true;
  const pendingPanelRequests = [];
  let fetchHookInstalled = false;

  function normalizeText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
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

  function readYtcfgValue(key) {
    try {
      if (window.ytcfg?.get) {
        return window.ytcfg.get(key);
      }
    } catch (_error) {
      // Fall back to script parsing below.
    }
    return undefined;
  }

  function readConfigFromScripts() {
    for (const script of Array.from(document.scripts)) {
      const text = script.textContent || "";
      if (!text.includes("ytcfg.set")) {
        continue;
      }
      const json = extractJsonObjectAfter(text, "ytcfg.set");
      if (!json) {
        continue;
      }
      try {
        return JSON.parse(json);
      } catch (_error) {
        // Keep scanning.
      }
    }
    return {};
  }

  function readInitialDataFromScripts() {
    const markers = [
      "ytInitialData =",
      "ytInitialData=",
      "window.ytInitialData =",
      "window[\"ytInitialData\"] =",
    ];

    for (const script of Array.from(document.scripts)) {
      const text = script.textContent || "";
      if (!text.includes("getTranscriptEndpoint")) {
        continue;
      }
      for (const marker of markers) {
        const json = extractJsonObjectAfter(text, marker);
        if (!json) {
          continue;
        }
        try {
          return JSON.parse(json);
        } catch (_error) {
          // Keep scanning.
        }
      }
    }
    return null;
  }

  function readTranscriptParams() {
    return normalizeText(
      findNestedValue(
        window.ytInitialData || readInitialDataFromScripts(),
        (value) => value?.getTranscriptEndpoint?.params || "",
      ),
    );
  }

  function readTranscriptConfig() {
    const scriptConfig = readConfigFromScripts();
    const context =
      readYtcfgValue("INNERTUBE_CONTEXT") ||
      scriptConfig.INNERTUBE_CONTEXT ||
      null;
    return {
      apiKey: normalizeText(
        readYtcfgValue("INNERTUBE_API_KEY") || scriptConfig.INNERTUBE_API_KEY,
      ),
      context,
      clientName: normalizeText(
        readYtcfgValue("INNERTUBE_CONTEXT_CLIENT_NAME") ||
          readYtcfgValue("INNERTUBE_CLIENT_NAME") ||
          scriptConfig.INNERTUBE_CONTEXT_CLIENT_NAME ||
          scriptConfig.INNERTUBE_CLIENT_NAME ||
          context?.client?.clientName,
      ),
      clientVersion: normalizeText(
        readYtcfgValue("INNERTUBE_CLIENT_VERSION") ||
          scriptConfig.INNERTUBE_CLIENT_VERSION ||
          context?.client?.clientVersion,
      ),
      visitorData: normalizeText(context?.client?.visitorData),
    };
  }

  async function requestTranscript() {
    const config = readTranscriptConfig();
    const rawParams = readTranscriptParams();
    if (!config.apiKey || !config.context || !rawParams) {
      throw new Error("no-transcript-endpoint");
    }

    const paramsCandidates = [rawParams];
    try {
      const decoded = decodeURIComponent(rawParams);
      if (decoded && decoded !== rawParams) {
        paramsCandidates.push(decoded);
      }
    } catch (_error) {
      // rawParams is already usable.
    }

    let lastError = "transcript-failed";
    for (const params of paramsCandidates) {
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
        `/youtubei/v1/get_transcript?key=${encodeURIComponent(
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
      const text = await response.text();
      let data = null;
      try {
        data = JSON.parse(text);
      } catch (_error) {
        // Report a short text sample below.
      }
      if (response.ok && data) {
        return data;
      }
      lastError = `transcript-${response.status}:${text.slice(0, 160)}`;
    }

    throw new Error(lastError);
  }

  function installPanelFetchHook() {
    if (fetchHookInstalled) {
      return;
    }
    fetchHookInstalled = true;

    const originalFetch = window.fetch;
    window.fetch = function patchedFetch(input, init) {
      const url = String(input?.url || input || "");
      const isTranscriptRequest =
        url.includes("/youtubei/v1/get_panel") ||
        url.includes("/youtubei/v1/get_transcript");
      if (!isTranscriptRequest || pendingPanelRequests.length === 0) {
        return originalFetch.apply(this, arguments);
      }

      return originalFetch.apply(this, arguments).then(async (response) => {
        try {
          const body = await response.clone().text();
          const pending = pendingPanelRequests.shift();
          if (pending) {
            window.clearTimeout(pending.timer);
            pending.resolve({
              endpoint: url.includes("/get_panel") ? "panel" : "transcript",
              status: response.status,
              body,
            });
          }
        } catch (_error) {
          // Preserve YouTube's request even if our clone/read fails.
        }
        return response;
      });
    };

    const OriginalXHR = window.XMLHttpRequest;
    window.XMLHttpRequest = function PatchedXMLHttpRequest() {
      const xhr = new OriginalXHR();
      let requestUrl = "";
      const originalOpen = xhr.open;
      const originalSend = xhr.send;

      xhr.open = function patchedOpen(method, url) {
        requestUrl = String(url || "");
        return originalOpen.apply(this, arguments);
      };

      xhr.send = function patchedSend() {
        const isTranscriptRequest =
          requestUrl.includes("/youtubei/v1/get_panel") ||
          requestUrl.includes("/youtubei/v1/get_transcript");
        if (isTranscriptRequest && pendingPanelRequests.length > 0) {
          xhr.addEventListener("loadend", () => {
            const pending = pendingPanelRequests.shift();
            if (!pending) {
              return;
            }
            window.clearTimeout(pending.timer);
            let body = "";
            try {
              body = xhr.responseText || "";
            } catch (_error) {
              body = "";
            }
            pending.resolve({
              endpoint: requestUrl.includes("/get_panel") ? "panel" : "transcript",
              status: xhr.status,
              body,
            });
          });
        }
        return originalSend.apply(this, arguments);
      };

      return xhr;
    };
    window.XMLHttpRequest.prototype = OriginalXHR.prototype;
  }

  function setCaptionLanguage(languageCode) {
    const lang = normalizeText(languageCode);
    if (!lang) {
      return;
    }
    try {
      const player = document.querySelector("#movie_player");
      if (player?.setOption) {
        player.setOption("captions", "track", { languageCode: lang });
      }
    } catch (_error) {
      // The transcript panel can still use YouTube's current caption language.
    }
  }

  function installTranscriptPanelMask() {
    if (document.getElementById("ytct-transcript-panel-mask")) {
      return;
    }
    const style = document.createElement("style");
    style.id = "ytct-transcript-panel-mask";
    style.textContent =
      'ytd-engagement-panel-section-list-renderer[target-id*="transcript" i]' +
      "{visibility:hidden!important;opacity:0!important;pointer-events:none!important;}";
    (document.head || document.documentElement).appendChild(style);
  }

  function removeTranscriptPanelMask() {
    document.getElementById("ytct-transcript-panel-mask")?.remove();
  }

  function findTranscriptPanel() {
    const candidates = Array.from(
      document.querySelectorAll(
        [
          'ytd-engagement-panel-section-list-renderer[target-id*="transcript" i]',
          "ytd-engagement-panel-section-list-renderer[is-sync-scroll-panel]",
          "ytd-transcript-renderer",
          "ytd-transcript-search-panel-renderer",
        ].join(","),
      ),
    );
    if (candidates.length === 0) {
      return null;
    }

    const scored = candidates
      .map((element) => {
        const rect = element.getBoundingClientRect();
        const visible = rect.width > 0 && rect.height > 0;
        const rowCount = element.querySelectorAll(
          "ytd-transcript-segment-renderer",
        ).length;
        const targetId = normalizeText(element.getAttribute("target-id") || "");
        const searchableTranscript = /searchable-transcript/i.test(targetId);
        return {
          element,
          score:
            rowCount * 1000 +
            (visible ? 100 : 0) +
            (searchableTranscript ? 25 : 0),
        };
      })
      .sort((left, right) => right.score - left.score);

    return scored[0]?.element || null;
  }

  function readTranscriptPanelDomRows() {
    const panel = findTranscriptPanel();
    if (!panel) {
      return [];
    }

    const rowSelectors = [
      "ytd-transcript-segment-renderer",
      "ytd-transcript-segment-list-renderer [role='button']",
      "ytd-transcript-body-renderer [role='button']",
      "yt-list-item-view-model",
      "[class*='transcript'][class*='segment']",
    ];
    const rows = [];
    const seenElements = new Set();
    const seenRows = new Set();
    const timestampPattern = /\b\d{1,2}:\d{2}(?::\d{2})?(?:\.\d+)?\b/;

    function looksLikeMergedTranscriptDomRow(rowText, source) {
      const normalizedRowText = normalizeText(rowText);
      const normalizedSource = normalizeText(source);
      if (normalizedSource.length < 220) {
        return false;
      }

      const timestampCount =
        (
          normalizedRowText.match(
            /\b\d{1,2}:\d{2,4}\b/g,
          ) || []
        ).length +
        (
          normalizedSource.match(
            /\b\d{1,2}:\d{2,4}\b/g,
          ) || []
        ).length;
      const durationLabelCount =
        (normalizedRowText.match(/(?:minutes?|seconds?)/gi) || []).length +
        (normalizedSource.match(/(?:minutes?|seconds?)/gi) || []).length;
      return timestampCount >= 2 || durationLabelCount >= 3;
    }

    function pushRow(element) {
      if (!element || seenElements.has(element)) {
        return;
      }
      seenElements.add(element);
      const rowText = normalizeText(element.textContent || "");
      if (!rowText) {
        return;
      }

      const timestampElement = element.querySelector(
        ".segment-timestamp, [class*='timestamp'], yt-formatted-string[class*='timestamp']",
      );
      const timestamp =
        normalizeText(timestampElement?.textContent || "") ||
        normalizeText(rowText.match(timestampPattern)?.[0] || "");
      if (!timestamp) {
        return;
      }

      const textElement = element.querySelector(
        ".segment-text, [class*='segment-text'], yt-formatted-string[class*='segment-text']",
      );
      const text = normalizeText(
        textElement?.textContent || rowText.replace(timestampPattern, ""),
      );
      const key = `${timestamp}::${text.toLowerCase()}`;
      if (
        !text ||
        looksLikeMergedTranscriptDomRow(rowText, text) ||
        seenRows.has(key)
      ) {
        return;
      }
      seenRows.add(key);
      rows.push({ timestamp, text, rowText });
    }

    rowSelectors.forEach((selector) => {
      panel.querySelectorAll(selector).forEach(pushRow);
    });

    if (rows.length === 0) {
      Array.from(panel.querySelectorAll("div, span, yt-formatted-string, button"))
        .filter((element) => timestampPattern.test(normalizeText(element.textContent)))
        .forEach(pushRow);
    }

    return rows;
  }

  function waitForTranscriptPanelDomRows(timeoutMs = 1600) {
    const immediate = readTranscriptPanelDomRows();
    if (immediate.length > 0) {
      return Promise.resolve(immediate);
    }

    return new Promise((resolve) => {
      const startedAt = Date.now();
      const timer = window.setInterval(() => {
        const rows = readTranscriptPanelDomRows();
        if (rows.length > 0 || Date.now() - startedAt >= timeoutMs) {
          window.clearInterval(timer);
          resolve(rows);
        }
      }, 120);
    });
  }

  function findTranscriptButton() {
    const root = document.querySelector("ytd-watch-metadata") || document;
    const positive =
      /transcript|文字稿|轉錄|转录|文字起こし|書き起こし|스크립트|transcrição|transcripción|transkript|trascriz/i;
    const negative = /close|关闭|關閉|閉じる|닫기|hide|隐藏|隱藏/i;
    const buttons = Array.from(root.querySelectorAll("button[aria-label]"));
    return (
      buttons.find((button) => {
        const label = button.getAttribute("aria-label") || "";
        return positive.test(label) && !negative.test(label);
      }) || null
    );
  }

  function expandDescription() {
    try {
      document
        .querySelector(
          '#description-inline-expander tp-yt-paper-button[id="expand"], #description-inline-expander #expand',
        )
        ?.click();
    } catch (_error) {
      // The transcript button may already be visible.
    }
  }

  function closeTranscriptPanel() {
    try {
      const panel = findTranscriptPanel();
      panel?.querySelector('button[aria-label*="Close"], button[aria-label*="关闭"], button[aria-label*="關閉"]')?.click();
    } catch (_error) {
      // Closing is best effort; the panel is masked while we use it.
    }
  }

  function clickTranscriptButton(requestId, reject) {
    expandDescription();
    let attempts = 0;
    const tryClick = () => {
      const button = findTranscriptButton();
      if (button) {
        try {
          button.click();
        } catch (error) {
          reject(error);
        }
        return;
      }

      attempts += 1;
      if (attempts < 8) {
        window.setTimeout(tryClick, 300);
        return;
      }
      reject(new Error(`panel-button-not-found:${requestId}`));
    };
    tryClick();
  }

  async function requestTranscriptPanel({ languageCode } = {}) {
    installPanelFetchHook();
    setCaptionLanguage(languageCode);
    const existingRows = readTranscriptPanelDomRows();
    const openedByUs = existingRows.length === 0;
    if (existingRows.length > 0) {
      return {
        endpoint: "dom",
        status: 200,
        body: "",
        domRows: existingRows,
      };
    }

    installTranscriptPanelMask();

    try {
      await new Promise((resolve) => window.setTimeout(resolve, 350));
      const requestId = `panel-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const data = await new Promise((resolve, reject) => {
        let settled = false;
        let pending = null;
        const cleanup = () => {
          if (pending) {
            const index = pendingPanelRequests.indexOf(pending);
            if (index >= 0) {
              pendingPanelRequests.splice(index, 1);
            }
            window.clearTimeout(pending.timer);
            window.clearInterval(pending.domTimer);
          }
        };
        const finish = (value) => {
          if (settled) {
            return;
          }
          settled = true;
          cleanup();
          resolve(value);
        };
        const fail = (error) => {
          if (settled) {
            return;
          }
          settled = true;
          cleanup();
          reject(error);
        };
        pending = {
          resolve: finish,
          timer: window.setTimeout(() => {
            const domRows = readTranscriptPanelDomRows();
            if (domRows.length > 0) {
              finish({
                endpoint: "dom",
                status: 200,
                body: "",
                domRows,
              });
              return;
            }
            fail(new Error("panel-timeout"));
          }, 14000),
          domTimer: window.setInterval(() => {
            const domRows = readTranscriptPanelDomRows();
            if (domRows.length > 0) {
              finish({
                endpoint: "dom",
                status: 200,
                body: "",
                domRows,
              });
            }
          }, 250),
        };
        pendingPanelRequests.push(pending);
        clickTranscriptButton(requestId, fail);
      });
      const domRows =
        Array.isArray(data?.domRows) && data.domRows.length > 0
          ? data.domRows
          : await waitForTranscriptPanelDomRows();
      return { ...data, domRows };
    } finally {
      window.setTimeout(() => {
        if (openedByUs) {
          closeTranscriptPanel();
        }
        removeTranscriptPanelMask();
      }, 250);
    }
  }

  window.addEventListener("message", (event) => {
    if (event.source !== window) {
      return;
    }
    const message = event.data || {};
    if (message.source !== "YTCT_CONTENT") {
      return;
    }

    if (message.type === "FETCH_TRANSCRIPT") {
      requestTranscript()
        .then((data) => {
          window.postMessage(
            {
              source: "YTCT_PAGE_BRIDGE",
              type: "FETCH_TRANSCRIPT_RESULT",
              requestId: message.requestId,
              ok: true,
              data,
            },
            "*",
          );
        })
        .catch((error) => {
          window.postMessage(
            {
              source: "YTCT_PAGE_BRIDGE",
              type: "FETCH_TRANSCRIPT_RESULT",
              requestId: message.requestId,
              ok: false,
              error: error.message || "transcript-failed",
            },
            "*",
          );
        });
      return;
    }

    if (message.type !== "FETCH_TRANSCRIPT_PANEL") {
      return;
    }

    requestTranscriptPanel(message.payload || {})
      .then((data) => {
        window.postMessage(
          {
            source: "YTCT_PAGE_BRIDGE",
            type: "FETCH_TRANSCRIPT_PANEL_RESULT",
            requestId: message.requestId,
            ok: true,
            data,
          },
          "*",
        );
      })
      .catch((error) => {
        window.postMessage(
          {
            source: "YTCT_PAGE_BRIDGE",
            type: "FETCH_TRANSCRIPT_PANEL_RESULT",
            requestId: message.requestId,
            ok: false,
            error: error.message || "panel-failed",
          },
          "*",
        );
      });
  });
})();
