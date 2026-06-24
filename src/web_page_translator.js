(function initWebPageTranslator() {
  const previousController = window.__YTCT_WEB_PAGE_TRANSLATOR__;
  if (previousController && typeof previousController.stop === "function") {
    try {
      previousController.stop("replaced");
    } catch (_error) {
      // Older injected contexts can become invalid after the extension reloads.
    }
  }
  const YTCT_WEB_INSTANCE_ID = `ytct-web-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2)}`;
  window.__YTCT_WEB_PAGE_TRANSLATOR__ = {
    instanceId: YTCT_WEB_INSTANCE_ID,
    stop: () => {},
  };

  const core = globalThis.YTContextTranslatorCore;
  const BLOCK_SELECTOR = [
    "p",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "li",
    "blockquote",
    "figcaption",
    "caption",
    "td",
    "th",
    "dt",
    "dd",
    ".kicker",
    ".sub",
  ].join(",");
  const YOUTUBE_ROOT_SELECTOR = [
    "ytd-watch-metadata",
    "ytd-comments",
  ].join(",");
  const YOUTUBE_BLOCK_SELECTOR = [
    "#description-inline-expander #snippet-text",
    "#description-inline-expander[is-expanded] #expanded yt-attributed-string",
    "ytd-expandable-video-description-body-renderer ytd-text-inline-expander#inline-expander",
    "ytd-comment-thread-renderer #content-text",
  ].join(",");
  const SKIP_SELECTOR = [
    "nav",
    "footer",
    "aside",
    "form",
    "menu",
    "script",
    "style",
    "noscript",
    "template",
    "pre",
    "code",
    "kbd",
    "samp",
    "textarea",
    "input",
    "select",
    "option",
    "[contenteditable='true']",
    "[aria-hidden='true']",
    "[hidden]",
    ".ytct-web-translation",
    "[data-ytct-web-translation]",
  ].join(",");
  const PROTECTED_INLINE_SELECTOR =
    "a[href],code,kbd,samp,var,math,[role='math'],.katex,.MathJax";
  const SOURCE_HIDDEN_CLASS = "ytct-web-source-hidden";
  const MAX_BLOCKS_PER_SCAN = 1200;
  const BATCH_SIZE = 6;
  const CONTEXT_BLOCKS = 4;
  const MESSAGE_TIMEOUT_MS = 52000;

  const state = {
    active: false,
    settings: core.normalizeSettings({}),
    sessionId: 0,
    blockCounter: 0,
    blocks: new Map(),
    orderedBlocks: [],
    queue: [],
    queuedIds: new Set(),
    inFlight: false,
    pageMemory: { glossary: [] },
    intersectionObserver: null,
    mutationObserver: null,
    mutationTimer: 0,
    status: null,
    siteRule: null,
  };

  function isYouTubeWatchPage() {
    return /\.?youtube\.com$/i.test(location.hostname) && location.pathname === "/watch";
  }

  function isYouTubeTextBlock(element) {
    return isYouTubeWatchPage() && element.matches(YOUTUBE_BLOCK_SELECTOR);
  }

  function currentSiteRule() {
    return state.siteRule;
  }

  function joinSelectors(selectors) {
    return (Array.isArray(selectors) ? selectors : []).filter(Boolean).join(",");
  }

  function safeQuerySelectorAll(root, selector) {
    if (!root || !selector) {
      return [];
    }
    try {
      return Array.from(root.querySelectorAll(selector));
    } catch (_error) {
      return [];
    }
  }

  function safeClosest(element, selector) {
    if (!element || !selector) {
      return false;
    }
    try {
      return Boolean(element.closest(selector));
    } catch (_error) {
      return false;
    }
  }

  function blockSelectorForScan() {
    const rule = currentSiteRule();
    const includeSelector = joinSelectors(rule?.includeSelectors);
    if (includeSelector) {
      return includeSelector;
    }
    if (rule?.blockSelector) {
      return rule.blockSelector;
    }
    return isYouTubeWatchPage() ? YOUTUBE_BLOCK_SELECTOR : BLOCK_SELECTOR;
  }

  function elementDescriptor(element) {
    if (!element) {
      return "";
    }
    const className = typeof element.className === "string" ? element.className : "";
    return `${element.id || ""} ${className} ${element.getAttribute("role") || ""}`;
  }

  function isNavigationHeader(header) {
    if (!header) {
      return false;
    }
    const descriptor = elementDescriptor(header);
    const hasContentHeading = Boolean(header.querySelector("h1,h2,h3,.sub,p"));
    if (hasContentHeading && /\b(?:hero|article|post|entry|content|wrap)\b/i.test(descriptor)) {
      return false;
    }
    if (header.querySelector("nav,[role='navigation'],form,input,select,textarea")) {
      return true;
    }
    if (/\b(?:nav|navbar|menu|topbar|toolbar|site-header|global-header|app-header)\b/i.test(descriptor)) {
      return true;
    }
    const linkOrButtonCount = header.querySelectorAll("a,button,[role='button']").length;
    const textBlockCount = header.querySelectorAll("h1,h2,h3,h4,h5,h6,p,.sub,.kicker").length;
    return linkOrButtonCount >= 3 && textBlockCount <= 2;
  }

  function isInsideSkippedRegion(element) {
    if (!element || element.closest(SKIP_SELECTOR)) {
      return true;
    }
    const ruleExcludeSelector = joinSelectors(currentSiteRule()?.excludeSelectors);
    if (safeClosest(element, ruleExcludeSelector)) {
      return true;
    }
    const header = element.closest("header");
    return isNavigationHeader(header);
  }

  function sendMessage(message, timeoutMs = MESSAGE_TIMEOUT_MS) {
    return new Promise((resolve, reject) => {
      const timeoutId = window.setTimeout(() => {
        reject(new Error("网页翻译请求超时，请检查网络或更换模型。"));
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

  function showStatus(text, kind = "") {
    if (!state.status || !state.status.isConnected) {
      state.status = document.createElement("div");
      state.status.className = "ytct-web-status";
      state.status.setAttribute("data-ytct-web-translation", "status");
      document.documentElement.appendChild(state.status);
    }
    state.status.textContent = text;
    state.status.dataset.kind = kind;
    state.status.hidden = !text;
  }

  function hideStatusSoon() {
    window.setTimeout(() => {
      if (state.status) {
        state.status.hidden = true;
      }
    }, 1800);
  }

  function getTextWithoutTranslations(element) {
    const walker = document.createTreeWalker(
      element,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode(node) {
          const parent = node.parentElement;
          if (isInsideSkippedRegion(parent)) {
            return NodeFilter.FILTER_REJECT;
          }
          return NodeFilter.FILTER_ACCEPT;
        },
      },
    );
    const parts = [];
    while (walker.nextNode()) {
      parts.push(walker.currentNode.nodeValue || "");
    }
    return core.normalizeCaptionText(parts.join(" "));
  }

  function isUrlLikeText(text) {
    return /^(?:https?:\/\/|www\.|mailto:|[\w.+-]+@[\w.-]+\.[A-Za-z]{2,})/i.test(
      core.normalizeCaptionText(text),
    );
  }

  function addProtectedTerm(terms, seen, text, kind) {
    const normalized = core.normalizeCaptionText(text);
    if (!normalized || normalized.length > 240) {
      return;
    }
    const key = `${kind}:${normalized.toLowerCase()}`;
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    terms.push({ text: normalized, kind });
  }

  function protectedTermsForElement(element) {
    const terms = [];
    const seen = new Set();
    safeQuerySelectorAll(element, PROTECTED_INLINE_SELECTOR).forEach((node) => {
      const tagName = node.tagName.toLowerCase();
      const text = core.normalizeCaptionText(node.textContent || "");
      if (tagName === "a") {
        if (isUrlLikeText(text)) {
          addProtectedTerm(terms, seen, text, "link");
        }
        return;
      }
      if (tagName === "math" || node.getAttribute("role") === "math") {
        addProtectedTerm(terms, seen, text, "math");
        return;
      }
      if (node.matches(".katex,.MathJax")) {
        addProtectedTerm(terms, seen, text, "math");
        return;
      }
      addProtectedTerm(terms, seen, text, tagName);
    });
    return terms.slice(0, 24);
  }

  function countWords(text) {
    return core.normalizeCaptionText(text).split(/\s+/).filter(Boolean).length;
  }

  function chineseRatio(text) {
    const source = String(text || "");
    if (!source) {
      return 0;
    }
    const cjkCount = (source.match(/[\u3400-\u9fff]/g) || []).length;
    return cjkCount / source.length;
  }

  function isProbablyCode(text) {
    return core.isProbablyCodeText(text);
  }

  function isHeading(element) {
    return /^H[1-6]$/.test(element.tagName);
  }

  function shouldTranslateText(text, element) {
    const source = core.normalizeCaptionText(text);
    if (!source || chineseRatio(source) > 0.2 || isProbablyCode(source)) {
      return false;
    }
    if (/^(?:https?:\/\/|www\.|[\w.-]+@[\w.-]+$)/i.test(source)) {
      return false;
    }
    if (isHeading(element)) {
      return source.length >= 8 || countWords(source) >= 2;
    }
    if (element.tagName === "TD" || element.tagName === "TH") {
      return source.length >= 16 && countWords(source) >= 3;
    }
    const rule = currentSiteRule();
    if (rule?.minTextLength || rule?.minWords) {
      return (
        source.length >= Math.max(1, Number(rule.minTextLength || 1)) &&
        countWords(source) >= Math.max(1, Number(rule.minWords || 1))
      );
    }
    return source.length >= 28 && countWords(source) >= 5;
  }

  function isVisibleElement(element) {
    if (!element.isConnected || isInsideSkippedRegion(element)) {
      return false;
    }
    const style = window.getComputedStyle(element);
    if (
      style.display === "none" ||
      style.visibility === "hidden" ||
      Number(style.opacity) === 0
    ) {
      return false;
    }
    const rect = element.getBoundingClientRect();
    return rect.width > 1 && rect.height > 1;
  }

  function hasNestedTextBlocks(element) {
    if (element.tagName !== "LI" && element.tagName !== "TD" && element.tagName !== "TH") {
      return false;
    }
    return Boolean(
      element.querySelector(
        "p,h1,h2,h3,h4,h5,h6,blockquote,ul,ol,table,pre",
      ),
    );
  }

  function isHighRiskLayout(element) {
    if (isYouTubeTextBlock(element)) {
      return false;
    }
    if (element.tagName === "TD" || element.tagName === "TH" || element.tagName === "LI") {
      return false;
    }
    const display = window.getComputedStyle(element).display;
    return (
      display === "inline" ||
      display === "inline-block" ||
      display === "inline-flex" ||
      display === "inline-grid" ||
      display === "flex" ||
      display === "grid"
    );
  }

  function compareDocumentOrder(left, right) {
    if (left === right) {
      return 0;
    }
    return left.compareDocumentPosition(right) & Node.DOCUMENT_POSITION_PRECEDING
      ? 1
      : -1;
  }

  function headingPathFor(element) {
    const headings = Array.from(document.querySelectorAll("h1,h2,h3,h4"))
      .filter((heading) => compareDocumentOrder(heading, element) < 0)
      .slice(-4)
      .map((heading) => getTextWithoutTranslations(heading))
      .filter(Boolean);
    return headings;
  }

  function scanRoots() {
    const rule = currentSiteRule();
    if (rule?.rootSelector) {
      const ruleRoots = safeQuerySelectorAll(document, rule.rootSelector)
        .filter((element) => isVisibleElement(element));
      if (ruleRoots.length > 0) {
        return ruleRoots;
      }
    }

    if (isYouTubeWatchPage()) {
      return Array.from(document.querySelectorAll(YOUTUBE_ROOT_SELECTOR))
        .filter((element) => isVisibleElement(element));
    }

    const mainRoots = Array.from(
      document.querySelectorAll("main,[role='main']"),
    ).filter((element) => isVisibleElement(element));
    if (mainRoots.length > 0) {
      return mainRoots;
    }

    const articleRoots = Array.from(document.querySelectorAll("article"))
      .filter((element) => isVisibleElement(element));
    if (articleRoots.length > 0) {
      return articleRoots;
    }

    return document.body ? [document.body] : [];
  }

  function isInViewport(element) {
    const rect = element.getBoundingClientRect();
    const height = window.innerHeight || document.documentElement.clientHeight || 0;
    const width = window.innerWidth || document.documentElement.clientWidth || 0;
    return rect.bottom >= 0 && rect.right >= 0 && rect.top <= height && rect.left <= width;
  }

  function blockPayload(block) {
    return {
      id: block.id,
      text: block.text,
      tagName: block.element.tagName.toLowerCase(),
      role: block.element.getAttribute("role") || "",
      headingPath: block.headingPath,
      protectedTerms: block.protectedTerms,
    };
  }

  function resetBlockIfSourceChanged(block, nextText) {
    const previousText = block.text || "";
    if (previousText && previousText !== nextText) {
      if (block.translationElement) {
        block.translationElement.remove();
      }
      block.translationElement = null;
      block.status = "pending";
      restoreSourceElement(block);
    }
  }

  function pageContextPayload() {
    return {
      title: document.title,
      url: location.href,
      language: document.documentElement.lang || navigator.language || "",
    };
  }

  function collectBlocks() {
    const roots = scanRoots();
    if (roots.length === 0) {
      return [];
    }

    const elements = Array.from(
      new Set(
        roots.flatMap((root) => safeQuerySelectorAll(root, blockSelectorForScan())),
      ),
    );
    const collected = [];

    for (const [order, element] of elements.entries()) {
      if (
        !isVisibleElement(element) ||
        hasNestedTextBlocks(element) ||
        isHighRiskLayout(element)
      ) {
        continue;
      }
      const text = getTextWithoutTranslations(element);
      if (!shouldTranslateText(text, element)) {
        continue;
      }

      const existingId = element.dataset.ytctWebBlockId;
      const id = existingId || `web-block-${state.blockCounter}`;
      if (!existingId) {
        state.blockCounter += 1;
        element.dataset.ytctWebBlockId = id;
      }
      const block = state.blocks.get(id) || {
        id,
        element,
        translationElement: null,
        status: "pending",
      };
      const rect = element.getBoundingClientRect();
      resetBlockIfSourceChanged(block, text);
      block.text = text;
      block.headingPath = headingPathFor(element);
      block.protectedTerms = protectedTermsForElement(element);
      block.top = rect.top + window.scrollY;
      block.left = rect.left + window.scrollX;
      block.order = order;
      state.blocks.set(id, block);
      collected.push(block);
    }

    state.orderedBlocks = core.sortWebPageBlocksByPosition(collected)
      .slice(0, MAX_BLOCKS_PER_SCAN);
    if (state.intersectionObserver) {
      state.orderedBlocks.forEach((block) =>
        state.intersectionObserver.observe(block.element),
      );
    }
    return state.orderedBlocks;
  }

  function enqueueBlock(block) {
    if (
      !state.active ||
      !block ||
      block.status === "ready" ||
      block.status === "translating" ||
      block.status === "failed" ||
      state.queuedIds.has(block.id)
    ) {
      return;
    }
    state.queuedIds.add(block.id);
    insertQueuedBlock(block);
    window.setTimeout(processQueue, 0);
  }

  function translationProgress() {
    const blocks = state.orderedBlocks.filter((block) => block.element.isConnected);
    const ready = blocks.filter((block) => block.status === "ready").length;
    const failed = blocks.filter((block) => block.status === "failed").length;
    return {
      total: blocks.length,
      ready,
      failed,
    };
  }

  function orderedBlockIndex(block) {
    const index = state.orderedBlocks.findIndex((item) => item.id === block?.id);
    return index >= 0 ? index : Number.MAX_SAFE_INTEGER;
  }

  function insertQueuedBlock(block) {
    const nextIndex = orderedBlockIndex(block);
    let insertIndex = state.queue.findIndex(
      (queuedBlock) => orderedBlockIndex(queuedBlock) > nextIndex,
    );
    if (insertIndex < 0) {
      insertIndex = state.queue.length;
    }
    state.queue.splice(insertIndex, 0, block);
  }

  function enqueueInitialBlocks(blocks) {
    const shouldTranslateWholePage = state.settings.webTranslationScope === "page";
    blocks.forEach((block) => {
      if (shouldTranslateWholePage || isInViewport(block.element)) {
        enqueueBlock(block);
      }
    });
  }

  function contextForBatch(batch) {
    if (batch.length === 0) {
      return {
        nonOutputContextBefore: [],
        nonOutputContextAfter: [],
      };
    }
    const firstIndex = state.orderedBlocks.findIndex((block) => block.id === batch[0].id);
    const lastIndex = state.orderedBlocks.findIndex(
      (block) => block.id === batch[batch.length - 1].id,
    );
    if (firstIndex < 0 || lastIndex < 0) {
      return {
        nonOutputContextBefore: [],
        nonOutputContextAfter: [],
      };
    }
    return {
      nonOutputContextBefore: state.orderedBlocks
        .slice(Math.max(0, firstIndex - CONTEXT_BLOCKS), firstIndex)
        .map(blockPayload),
      nonOutputContextAfter: state.orderedBlocks
        .slice(lastIndex + 1, lastIndex + 1 + CONTEXT_BLOCKS)
        .map(blockPayload),
    };
  }

  function sectionKeyForBlock(block) {
    return (Array.isArray(block?.headingPath) ? block.headingPath : [])
      .map(core.normalizeCaptionText)
      .filter(Boolean)
      .join("\u001f");
  }

  function takeNextSectionBatch() {
    if (state.queue.length === 0) {
      return [];
    }
    const first = state.queue.shift();
    state.queuedIds.delete(first.id);
    const sectionKey = sectionKeyForBlock(first);
    const batch = [first];

    for (let index = 0; index < state.queue.length && batch.length < BATCH_SIZE;) {
      if (sectionKeyForBlock(state.queue[index]) !== sectionKey) {
        index += 1;
        continue;
      }
      const [block] = state.queue.splice(index, 1);
      state.queuedIds.delete(block.id);
      batch.push(block);
    }

    while (batch.length < BATCH_SIZE && state.queue.length > 0) {
      const block = state.queue.shift();
      state.queuedIds.delete(block.id);
      batch.push(block);
    }
    return batch;
  }

  function translationHostMode(element) {
    return element.tagName === "LI" || element.tagName === "TD" || element.tagName === "TH"
      ? "inside"
      : "after";
  }

  function syncTranslationTypography(element, sourceElement) {
    const sourceStyle = window.getComputedStyle(sourceElement);
    [
      "color",
      "fontFamily",
      "fontSize",
      "fontStyle",
      "fontWeight",
      "fontVariant",
      "lineHeight",
      "letterSpacing",
      "textAlign",
    ].forEach((property) => {
      element.style[property] = sourceStyle[property];
    });
  }

  function restoreSourceElement(block) {
    if (block?.element) {
      block.element.classList.remove(SOURCE_HIDDEN_CLASS);
    }
  }

  function applySourceDisplayMode(block) {
    restoreSourceElement(block);
    if (
      state.settings.webTranslationDisplayMode === "translation" &&
      block?.translationElement
    ) {
      block.element.classList.add(SOURCE_HIDDEN_CLASS);
    }
  }

  function renderTranslation(block, translation) {
    if (!block.element.isConnected) {
      return;
    }
    restoreSourceElement(block);
    const element = block.translationElement || document.createElement("div");
    element.className = "ytct-web-translation";
    element.lang = state.settings.webTranslationTargetLanguage || "zh-CN";
    element.dataset.mode = state.settings.webTranslationDisplayMode || "bilingual";
    element.setAttribute("data-ytct-web-translation", block.id);
    element.textContent = translation;
    syncTranslationTypography(element, block.element);

    if (!element.isConnected) {
      if (translationHostMode(block.element) === "inside") {
        block.element.appendChild(element);
      } else {
        block.element.insertAdjacentElement("afterend", element);
      }
    }
    block.translationElement = element;
    block.status = "ready";
    applySourceDisplayMode(block);
  }

  function mergePageGlossary(glossary) {
    const nextItems = Array.isArray(glossary) ? glossary : [];
    if (nextItems.length === 0) {
      return;
    }
    const bySource = new Map(
      (state.pageMemory.glossary || []).map((item) => [
        core.normalizeCaptionText(item.source).toLowerCase(),
        item,
      ]),
    );
    nextItems.forEach((item) => {
      const source = core.normalizeCaptionText(item.source);
      const translation = core.normalizeCaptionText(item.translation);
      if (source && translation) {
        bySource.set(source.toLowerCase(), { source, translation });
      }
    });
    state.pageMemory.glossary = Array.from(bySource.values()).slice(0, 80);
  }

  async function analyzePageMemory(blocks) {
    if (!Array.isArray(blocks) || blocks.length === 0) {
      return;
    }
    showStatus("分析网页上下文...");
    try {
      const response = await sendMessage({
        type: "YTCT_ANALYZE_WEB_PAGE_MEMORY",
        payload: {
          pageContext: pageContextPayload(),
          blocks: blocks.slice(0, 80).map(blockPayload),
        },
      });
      if (!response?.ok || response.result?.skipped) {
        return;
      }
      const pageMemory = response.result?.pageMemory;
      if (pageMemory && typeof pageMemory === "object") {
        state.pageMemory = {
          summary: core.normalizeCaptionText(pageMemory.summary),
          domain: core.normalizeCaptionText(pageMemory.domain),
          styleGuide: core.normalizeCaptionText(pageMemory.styleGuide),
          glossary: Array.isArray(pageMemory.glossary) ? pageMemory.glossary : [],
          entities: Array.isArray(pageMemory.entities) ? pageMemory.entities : [],
        };
      }
    } catch (_error) {
      state.pageMemory = { glossary: [] };
    }
  }

  async function processQueue() {
    if (!state.active || state.inFlight || state.queue.length === 0) {
      return;
    }

    const sessionId = state.sessionId;
    const batch = takeNextSectionBatch().filter(
      (block) => block.element.isConnected && block.status !== "ready",
    );
    if (batch.length === 0) {
      return;
    }
    batch.forEach((block) => {
      block.status = "translating";
      block.requestText = block.text;
    });
    state.inFlight = true;
    showStatus(`网页翻译中：${batch.length} 段`);

    try {
      const context = contextForBatch(batch);
      const response = await sendMessage({
        type: "YTCT_TRANSLATE_WEB_PAGE_BATCH",
        payload: {
          pageContext: {
            ...pageContextPayload(),
          },
          sourceLanguage: document.documentElement.lang || "",
          targetLanguage: state.settings.webTranslationTargetLanguage,
          blocks: batch.map(blockPayload),
          nonOutputContextBefore: context.nonOutputContextBefore,
          nonOutputContextAfter: context.nonOutputContextAfter,
          pageMemory: state.pageMemory,
        },
      });

      if (sessionId !== state.sessionId) {
        return;
      }
      if (!response?.ok) {
        throw new Error(response?.error || "网页翻译失败");
      }
      if (response.result?.skipped) {
        showStatus("网页翻译已关闭", "error");
        return;
      }

      const translationMap = (response.result?.translations || []).reduce(
        (result, item) => {
          result[item.id] = item.translation;
          return result;
        },
        {},
      );
      batch.forEach((block) => {
        if (block.requestText && block.text !== block.requestText) {
          block.status = "pending";
          block.requestText = "";
          return;
        }
        const translation = core.normalizeCaptionText(translationMap[block.id]);
        if (translation) {
          renderTranslation(block, translation);
        } else {
          block.status = "failed";
        }
        block.requestText = "";
      });
      mergePageGlossary(response.result?.glossary);
      const progress = translationProgress();
      showStatus(
        `网页翻译已更新：${progress.ready}/${progress.total} 段${progress.failed ? `，${progress.failed} 段未返回译文` : ""}`,
        progress.failed ? "error" : "",
      );
      if (!progress.failed) {
        hideStatusSoon();
      }
    } catch (error) {
      batch.forEach((block) => {
        block.status = "pending";
        block.requestText = "";
      });
      showStatus(error.message || "网页翻译失败", "error");
    } finally {
      if (sessionId === state.sessionId) {
        state.inFlight = false;
        window.setTimeout(processQueue, 0);
      }
    }
  }

  function setupIntersectionObserver() {
    state.intersectionObserver?.disconnect();
    if (!("IntersectionObserver" in window)) {
      return;
    }
    state.intersectionObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const id = entry.target.dataset.ytctWebBlockId;
            enqueueBlock(state.blocks.get(id));
          }
        });
      },
      { rootMargin: "600px 0px" },
    );
  }

  function scheduleRescan() {
    if (!state.active) {
      return;
    }
    window.clearTimeout(state.mutationTimer);
    state.mutationTimer = window.setTimeout(() => {
      const blocks = collectBlocks();
      enqueueInitialBlocks(blocks);
    }, 350);
  }

  function isOwnTranslationNode(node) {
    if (!node || node.nodeType !== Node.ELEMENT_NODE) {
      return false;
    }
    return Boolean(
      node.matches?.("[data-ytct-web-translation]") ||
      node.closest?.("[data-ytct-web-translation]"),
    );
  }

  function isOwnMutation(mutation) {
    const target = mutation.target?.nodeType === Node.ELEMENT_NODE
      ? mutation.target
      : mutation.target?.parentElement;
    if (
      mutation.type === "attributes" &&
      mutation.attributeName === "class" &&
      (
        target?.classList?.contains(SOURCE_HIDDEN_CLASS) ||
        mutation.oldValue?.includes(SOURCE_HIDDEN_CLASS)
      )
    ) {
      return true;
    }
    if (isOwnTranslationNode(target)) {
      return true;
    }
    const changedNodes = Array.from(mutation.addedNodes || [])
      .concat(Array.from(mutation.removedNodes || []));
    return changedNodes.length > 0 && changedNodes.every(isOwnTranslationNode);
  }

  function setupMutationObserver() {
    state.mutationObserver?.disconnect();
    state.mutationObserver = new MutationObserver((mutations) => {
      const onlyOwnMutations = mutations.every(isOwnMutation);
      if (!onlyOwnMutations) {
        scheduleRescan();
      }
    });
    state.mutationObserver.observe(document.body || document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "hidden", "is-expanded", "style"],
      attributeOldValue: true,
      childList: true,
      subtree: true,
      characterData: true,
    });
  }

  function clearTranslations() {
    document.querySelectorAll("[data-ytct-web-translation]").forEach((element) => {
      element.remove();
    });
    document.querySelectorAll(`.${SOURCE_HIDDEN_CLASS}`).forEach((element) => {
      element.classList.remove(SOURCE_HIDDEN_CLASS);
    });
    document.querySelectorAll("[data-ytct-web-block-id]").forEach((element) => {
      delete element.dataset.ytctWebBlockId;
    });
    state.blocks.clear();
    state.orderedBlocks = [];
    state.queue = [];
    state.queuedIds.clear();
    state.inFlight = false;
    state.pageMemory = { glossary: [] };
    state.siteRule = null;
  }

  async function start(settings) {
    state.sessionId += 1;
    state.settings = core.normalizeSettings(settings || {});
    if (!state.settings.enabled || !state.settings.webTranslationEnabled) {
      clearTranslations();
      showStatus("网页翻译已关闭", "error");
      return { skipped: true, reason: "disabled" };
    }
    state.active = true;
    clearTranslations();
    state.siteRule = core.matchWebTranslationSiteRule(
      location.href,
      core.parseWebTranslationSiteRules(state.settings.webTranslationSiteRules),
    );
    setupIntersectionObserver();
    setupMutationObserver();
    const blocks = collectBlocks();
    await analyzePageMemory(blocks);
    enqueueInitialBlocks(blocks);
    showStatus(blocks.length ? "网页翻译已启动" : "未找到可翻译正文", blocks.length ? "" : "error");
    if (blocks.length) {
      hideStatusSoon();
    }
    return { started: true, blocks: blocks.length };
  }

  function stop() {
    state.active = false;
    state.sessionId += 1;
    window.clearTimeout(state.mutationTimer);
    state.intersectionObserver?.disconnect();
    state.mutationObserver?.disconnect();
    state.intersectionObserver = null;
    state.mutationObserver = null;
    clearTranslations();
    try {
      chrome.runtime.onMessage.removeListener(handleRuntimeMessage);
    } catch (_error) {
      // The extension runtime can be invalidated during reload.
    }
    return { cleared: true };
  }

  function handleRuntimeMessage(message, _sender, sendResponse) {
    if (message?.type === "YTCT_WEB_TRANSLATE_START") {
      start(message.settings || {})
        .then((result) => sendResponse({ ok: true, result }))
        .catch((error) => sendResponse({ ok: false, error: error.message }));
      return true;
    }
    if (message?.type === "YTCT_WEB_TRANSLATE_CLEAR") {
      sendResponse({ ok: true, result: stop() });
      return false;
    }
    if (message?.type === "YTCT_PUBLIC_SETTINGS_UPDATED") {
      state.settings = core.normalizeSettings(message.settings || {});
      if (!state.settings.enabled || !state.settings.webTranslationEnabled) {
        stop();
      }
    }
    return false;
  }

  chrome.runtime.onMessage.addListener(handleRuntimeMessage);
  window.__YTCT_WEB_PAGE_TRANSLATOR__ = {
    instanceId: YTCT_WEB_INSTANCE_ID,
    stop,
  };
})();
