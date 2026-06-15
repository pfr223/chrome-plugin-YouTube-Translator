# Video Summarization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a manual current-video summarization feature on YouTube pages, using the existing caption timeline and model provider pipeline.

**Architecture:** Keep summary logic aligned with the existing subtitle translator split: `core.js` owns pure prompt/parsing/cache-key helpers, `background.js` owns provider calls and in-memory cache, and `content_script.js` owns YouTube page UI/state. The first version uses a single compacted transcript request and does not persist summaries to Chrome storage.

**Tech Stack:** Chrome MV3 content script/background service worker, plain JavaScript, existing provider APIs through `buildProviderRequest`, Node built-in test runner.

---

## File Structure

- Modify: `tests/core.test.js`
  - Add core unit tests for summary prompt, transcript compaction, response parsing, cache key stability, and static integration checks.
- Modify: `src/core.js`
  - Add pure summary helpers: `compactTimelineForSummary`, `buildVideoSummaryPrompt`, `parseVideoSummaryResponse`, and `createVideoSummaryCacheKey`.
- Modify: `src/background.js`
  - Add `summaryCache`, `fetchVideoSummary`, and the `YTCT_SUMMARIZE_VIDEO` message handler.
- Modify: `src/content_script.js`
  - Add right-side summary panel UI, summary state, message call, regeneration, and timestamp seek behavior.
- Modify: `src/content_script.css`
  - Add summary panel desktop/mobile layout and ready/loading/error state styles.
- Modify: `README.md`
  - Document the manual current-video summary feature and its limitation that complete captions are required.

## Task 1: Core Summary Tests

**Files:**
- Modify: `tests/core.test.js`

- [ ] **Step 1: Add failing tests for summary core helpers**

Insert this block after the existing `builds and parses batch timeline translations` test:

```js
test("compacts timeline cues for summary with timestamps and character budget", () => {
  const cues = Array.from({ length: 18 }, (_item, index) => ({
    id: `cue-${index}`,
    start: index * 10,
    end: index * 10 + 4,
    source: `segment ${index} explains reinforcement learning value updates`,
  }));

  const compacted = core.compactTimelineForSummary(cues, {
    maxChars: 500,
    maxSegmentChars: 90,
  });

  assert.ok(compacted.length >= 2);
  assert.ok(compacted.length < cues.length);
  assert.equal(compacted[0].start, 0);
  assert.match(compacted[0].text, /segment 0/);
  assert.match(compacted.at(-1).text, /segment 17/);
  assert.ok(
    compacted.reduce((total, segment) => total + segment.text.length, 0) <= 500,
  );
});

test("builds video summary prompt from compacted timestamped captions", () => {
  const prompt = core.buildVideoSummaryPrompt({
    cues: [
      { id: "cue-0", start: 0, end: 5, source: "we introduce Antigravity 2.0" },
      { id: "cue-1", start: 6, end: 12, source: "the IDE, CLI, and SDK share one agent" },
    ],
    metadata: {
      title: "Antigravity demo",
      channel: "Developer Tools",
      url: "https://www.youtube.com/watch?v=abc",
    },
    customInstructions: "保留 IDE / CLI / SDK。",
    maxChars: 1000,
  });

  assert.match(prompt, /summarize this YouTube video/i);
  assert.match(prompt, /Simplified Chinese/);
  assert.match(prompt, /Antigravity demo/);
  assert.match(prompt, /\[00:00-00:05\]/);
  assert.match(prompt, /IDE, CLI, and SDK/);
  assert.match(prompt, /"summary"/);
  assert.match(prompt, /"highlights"/);
  assert.match(prompt, /"chapters"/);
  assert.match(prompt, /保留 IDE \/ CLI \/ SDK/);
});

test("parses provider video summary responses from JSON variants", () => {
  const parsed = core.parseVideoSummaryResponse(
    '```json\n{"summary":"视频介绍 Antigravity 产品线。","highlights":["IDE 支持自动补全","","CLI 可在终端执行"],"chapters":[{"start":-5,"title":"开场","points":["介绍背景",""]},{"start":61.2,"title":"","points":["展示 SDK"]},{"start":"bad","title":"","points":[]}]}\n```',
  );

  assert.deepEqual(parsed, {
    summary: "视频介绍 Antigravity 产品线。",
    highlights: ["IDE 支持自动补全", "CLI 可在终端执行"],
    chapters: [
      { start: 0, title: "开场", points: ["介绍背景"] },
      { start: 61.2, title: "", points: ["展示 SDK"] },
    ],
  });

  assert.deepEqual(
    core.parseVideoSummaryResponse(
      'Here is the result:\n{"summary":"短视频摘要","highlights":["要点"],"chapters":[]}',
    ),
    {
      summary: "短视频摘要",
      highlights: ["要点"],
      chapters: [],
    },
  );
});

test("creates stable video summary cache keys from normalized transcript input", () => {
  const first = core.createVideoSummaryCacheKey({
    provider: "gemini",
    model: "gemini-2.5-flash-lite",
    videoId: "abc",
    customInstructions: "保留 Q value",
    cues: [
      { id: "cue-0", start: 0, end: 4, source: "Q   value is updated" },
      { id: "cue-1", start: 5, end: 8, source: "policy improves" },
    ],
  });
  const second = core.createVideoSummaryCacheKey({
    provider: "gemini",
    model: "gemini-2.5-flash-lite",
    videoId: "abc",
    customInstructions: "保留   Q value",
    cues: [
      { id: "cue-0", start: 0, end: 4, source: "Q value is updated" },
      { id: "cue-1", start: 5, end: 8, source: "policy improves" },
    ],
  });
  const changed = core.createVideoSummaryCacheKey({
    provider: "gemini",
    model: "gemini-2.5-flash-lite",
    videoId: "abc",
    customInstructions: "保留 Q value",
    cues: [
      { id: "cue-0", start: 0, end: 4, source: "Q value is updated differently" },
      { id: "cue-1", start: 5, end: 8, source: "policy improves" },
    ],
  });

  assert.equal(first, second);
  assert.notEqual(first, changed);
});

test("wires video summary integration points into background and content script", () => {
  const background = fs.readFileSync(
    path.join(projectRoot, "src", "background.js"),
    "utf8",
  );
  const script = fs.readFileSync(
    path.join(projectRoot, "src", "content_script.js"),
    "utf8",
  );
  const css = fs.readFileSync(
    path.join(projectRoot, "src", "content_script.css"),
    "utf8",
  );

  assert.match(background, /summaryCache/);
  assert.match(background, /YTCT_SUMMARIZE_VIDEO/);
  assert.match(background, /fetchVideoSummary/);
  assert.match(script, /ytct-summary-panel/);
  assert.match(script, /summarizeCurrentVideo/);
  assert.match(script, /seekToSummaryChapter/);
  assert.match(script, /YTCT_SUMMARIZE_VIDEO/);
  assert.match(css, /\.ytct-summary-panel/);
});
```

- [ ] **Step 2: Run tests and verify they fail for missing summary helpers**

Run:

```bash
npm test
```

Expected: FAIL with errors such as `core.compactTimelineForSummary is not a function`, and static integration checks fail because summary UI and background message handling do not exist yet.

- [ ] **Step 3: Commit the failing tests**

Run:

```bash
git add tests/core.test.js
git commit -m "test: specify video summarization behavior"
```

## Task 2: Core Summary Helpers

**Files:**
- Modify: `src/core.js`
- Test: `tests/core.test.js`

- [ ] **Step 1: Add summary helper functions to `src/core.js`**

Insert this code after `parseBatchTranslationResponse` and before `buildTranslationPrompt`:

```js
  function formatSummaryTimestamp(seconds) {
    const totalSeconds = Math.max(0, Math.floor(Number(seconds) || 0));
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
      .map((cue) => ({
        id: normalizeCaptionText(cue?.id),
        start: Math.max(0, Number(cue?.start) || 0),
        end: Math.max(0, Number(cue?.end) || 0),
        source: normalizeCaptionText(cue?.source),
      }))
      .filter((cue) => cue.source)
      .sort((first, second) => first.start - second.start);
  }

  function compactTimelineForSummary(cues, options = {}) {
    const maxChars = clampInteger(options.maxChars, 500, 80000, 50000);
    const maxSegmentChars = clampInteger(options.maxSegmentChars, 80, 2000, 700);
    const normalized = normalizedSummaryCues(cues);
    const segments = [];

    for (const cue of normalized) {
      const previous = segments.at(-1);
      const nextText = previous
        ? `${previous.text} ${cue.source}`.trim()
        : cue.source;
      const gap = previous ? cue.start - previous.end : 0;
      if (previous && gap <= 8 && nextText.length <= maxSegmentChars) {
        previous.end = Math.max(previous.end, cue.end || cue.start);
        previous.text = nextText;
      } else {
        segments.push({
          start: cue.start,
          end: cue.end || cue.start,
          text: cue.source,
        });
      }
    }

    let totalChars = segments.reduce((total, segment) => total + segment.text.length, 0);
    if (totalChars <= maxChars) {
      return segments;
    }

    const selected = [];
    const selectedIndexes = new Set();
    const addIndex = (index) => {
      if (index >= 0 && index < segments.length && !selectedIndexes.has(index)) {
        selectedIndexes.add(index);
        selected.push(segments[index]);
      }
    };

    addIndex(0);
    addIndex(segments.length - 1);

    const averageSegmentChars = Math.max(1, Math.ceil(totalChars / segments.length));
    const targetCount = Math.max(2, Math.floor(maxChars / averageSegmentChars));
    for (let step = 1; selected.length < targetCount && step < targetCount * 2; step += 1) {
      const index = Math.round((step * (segments.length - 1)) / Math.max(1, targetCount - 1));
      addIndex(index);
    }

    selected.sort((first, second) => first.start - second.start);
    while (
      selected.length > 2 &&
      selected.reduce((total, segment) => total + segment.text.length, 0) > maxChars
    ) {
      selected.splice(Math.floor(selected.length / 2), 1);
    }

    return selected;
  }

  function buildVideoSummaryPrompt(options = {}) {
    const {
      cues = [],
      metadata = {},
      customInstructions = "",
      maxChars = 50000,
    } = options;
    const segments = compactTimelineForSummary(cues, { maxChars });
    const lines = [
      "Task: summarize this YouTube video in Simplified Chinese.",
      "Use only the caption content and video metadata. Do not invent details.",
      "Write concise course-note style Chinese for a learner reviewing the video.",
      "Preserve technical terms, code, formulas, variable names, product names, and model names when translating them would reduce clarity.",
      'Return only JSON in this exact shape: {"summary":"...","highlights":["..."],"chapters":[{"start":0,"title":"...","points":["..."]}]}',
      "",
      "Output requirements:",
      "- summary: 150-250 Chinese characters when the video has enough content.",
      "- highlights: 3-6 concise bullets.",
      "- chapters: 5-10 timestamped sections when the source is long enough.",
      "- chapter start values must be seconds and close to real caption timestamps.",
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
        lines.push(
          `- [${formatSummaryTimestamp(segment.start)}-${formatSummaryTimestamp(segment.end)}] ${safeLine(segment.text)}`,
        );
      });
    }

    if (normalizeCaptionText(customInstructions)) {
      lines.push("", "User translation and summarization preferences:", normalizeCaptionText(customInstructions));
    }

    return lines.join("\n");
  }

  function normalizeVideoSummary(value) {
    const summary = cleanTranslationText(value?.summary);
    const highlights = (Array.isArray(value?.highlights) ? value.highlights : [])
      .map((item) => cleanTranslationText(item))
      .filter(Boolean);
    const chapters = (Array.isArray(value?.chapters) ? value.chapters : [])
      .map((chapter) => {
        const rawStart = Number(chapter?.start);
        const start = Number.isFinite(rawStart) && rawStart > 0 ? rawStart : 0;
        const title = cleanTranslationText(chapter?.title);
        const points = (Array.isArray(chapter?.points) ? chapter.points : [])
          .map((point) => cleanTranslationText(point))
          .filter(Boolean);
        return { start, title, points };
      })
      .filter((chapter) => chapter.title || chapter.points.length > 0);

    return { summary, highlights, chapters };
  }

  function parseVideoSummaryResponse(text) {
    const stripped = stripFences(text);
    const candidates = [stripped];
    const objectMatch = stripped.match(/\{[\s\S]*"summary"\s*:[\s\S]*\}/);
    if (objectMatch) {
      candidates.push(objectMatch[0]);
    }

    for (const candidate of candidates) {
      try {
        const parsed = JSON.parse(candidate);
        const normalized = normalizeVideoSummary(parsed);
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
    const compacted = compactTimelineForSummary(options.cues || [], {
      maxChars: 50000,
    });
    const transcriptKey = compacted
      .map((segment) => [
        Math.round(Number(segment.start) || 0),
        Math.round(Number(segment.end) || 0),
        normalizeCaptionText(segment.text).toLowerCase(),
      ].join(":"))
      .join("||");

    return [
      options.provider || "",
      options.model || "",
      options.videoId || "",
      normalizeCaptionText(options.customInstructions).toLowerCase(),
      hashString(transcriptKey),
    ].join("::");
  }
```

- [ ] **Step 2: Export the new helpers from `src/core.js`**

Add these entries to the `api` object near the existing batch translation helpers:

```js
    compactTimelineForSummary,
    buildVideoSummaryPrompt,
    parseVideoSummaryResponse,
    createVideoSummaryCacheKey,
```

- [ ] **Step 3: Run tests and verify only integration checks still fail**

Run:

```bash
npm test
```

Expected: core helper tests PASS. The final static integration test still FAILS because `background.js`, `content_script.js`, and `content_script.css` do not yet contain summary integration.

- [ ] **Step 4: Run syntax check for the core file**

Run:

```bash
node --check src/core.js
```

Expected: PASS with no output.

- [ ] **Step 5: Commit core helpers**

Run:

```bash
git add src/core.js
git commit -m "feat: add video summary core helpers"
```

## Task 3: Background Summary Provider Flow

**Files:**
- Modify: `src/background.js`
- Test: `tests/core.test.js`

- [ ] **Step 1: Add summary cache constants to `src/background.js`**

At the top of the file, near `translationCache`, change the constants to:

```js
const translationCache = new Map();
const summaryCache = new Map();
const MAX_CACHE_ITEMS = 300;
const MAX_SUMMARY_CACHE_ITEMS = 40;
const API_TIMEOUT_MS = 18000;
const SUMMARY_API_TIMEOUT_MS = 45000;
```

- [ ] **Step 2: Add a cache helper for summaries**

Insert this after `rememberCache`:

```js
function rememberSummaryCache(key, value) {
  if (summaryCache.has(key)) {
    summaryCache.delete(key);
  }
  summaryCache.set(key, value);
  while (summaryCache.size > MAX_SUMMARY_CACHE_ITEMS) {
    summaryCache.delete(summaryCache.keys().next().value);
  }
}
```

- [ ] **Step 3: Add `fetchVideoSummary`**

Insert this after `fetchBatchTranslation`:

```js
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

  const response = await fetchWithTimeout(url, requestOptions, SUMMARY_API_TIMEOUT_MS);
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
```

- [ ] **Step 4: Add the runtime message handler**

Add this block before `YTCT_TEST_TRANSLATION` in `chrome.runtime.onMessage.addListener`:

```js
  if (message.type === "YTCT_SUMMARIZE_VIDEO") {
    fetchVideoSummary(message.payload || {})
      .then((result) => sendResponse({ ok: true, result }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }
```

- [ ] **Step 5: Run focused tests**

Run:

```bash
npm test
```

Expected: summary core tests and background static assertions PASS. Content script and CSS static assertions still FAIL because the panel is not implemented yet.

- [ ] **Step 6: Run syntax check for background**

Run:

```bash
node --check src/background.js
```

Expected: PASS with no output.

- [ ] **Step 7: Commit background flow**

Run:

```bash
git add src/background.js
git commit -m "feat: add video summary provider flow"
```

## Task 4: Summary Panel Content Script

**Files:**
- Modify: `src/content_script.js`
- Test: `tests/core.test.js`

- [ ] **Step 1: Add summary state and timeout constants**

Extend the `state` object near `lastRenderKey`:

```js
    summaryPanel: null,
    summaryCollapsed: false,
    summaryStatus: "idle",
    summaryResult: null,
    summaryError: "",
    summaryCached: false,
    summaryRequestId: 0,
```

Add this constant near `BATCH_MESSAGE_TIMEOUT_MS`:

```js
  const SUMMARY_MESSAGE_TIMEOUT_MS = 65000;
```

- [ ] **Step 2: Add summary availability and formatting helpers**

Insert these helpers after `readMetadata`:

```js
  function formatSummaryTime(seconds) {
    const totalSeconds = Math.max(0, Math.floor(Number(seconds) || 0));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const remainingSeconds = totalSeconds % 60;
    const pad = (value) => String(value).padStart(2, "0");
    if (hours > 0) {
      return `${hours}:${pad(minutes)}:${pad(remainingSeconds)}`;
    }
    return `${pad(minutes)}:${pad(remainingSeconds)}`;
  }

  function getSummaryAvailability() {
    if (!state.settings.enabled) {
      return { available: false, reason: "扩展已关闭" };
    }
    if (!state.hasApiKey) {
      return { available: false, reason: "请先配置 API key" };
    }
    if (state.timelineMode === "loading") {
      return { available: false, reason: "字幕加载中" };
    }
    if (state.timelineMode !== "track" || state.timeline.length === 0) {
      return { available: false, reason: "当前视频没有可用完整字幕，暂不能总结" };
    }
    return { available: true, reason: "" };
  }

  function summaryCuePayload() {
    return state.timeline
      .filter((cue) => cue.source)
      .map((cue) => ({
        id: cue.id,
        start: cue.start,
        end: cue.end,
        source: cue.source,
      }));
  }
```

- [ ] **Step 3: Add DOM creation helpers for the summary panel**

Insert this block after `updateOverlayDiagnostics`:

```js
  function createSummaryElement(tagName, className, text) {
    const element = document.createElement(tagName);
    if (className) {
      element.className = className;
    }
    if (text) {
      element.textContent = text;
    }
    return element;
  }

  function renderSummaryPanel() {
    const panel = ensureSummaryPanel();
    const body = panel.querySelector(".ytct-summary-body");
    const title = panel.querySelector(".ytct-summary-title");
    const collapseButton = panel.querySelector("[data-ytct-summary-action='toggle']");
    const availability = getSummaryAvailability();

    panel.dataset.status = state.summaryStatus;
    panel.dataset.collapsed = String(state.summaryCollapsed);
    title.textContent = "视频总结";
    collapseButton.textContent = state.summaryCollapsed ? "展开" : "收起";

    if (state.summaryCollapsed) {
      body.replaceChildren();
      return;
    }

    if (state.summaryStatus === "generating") {
      body.replaceChildren(
        createSummaryElement("p", "ytct-summary-muted", "正在总结当前视频..."),
      );
      return;
    }

    if (state.summaryStatus === "error") {
      const message = createSummaryElement(
        "p",
        "ytct-summary-error",
        state.summaryError || "摘要生成失败",
      );
      const retry = createSummaryElement("button", "ytct-summary-primary", "重试");
      retry.type = "button";
      retry.dataset.ytctSummaryAction = "regenerate";
      body.replaceChildren(message, retry);
      return;
    }

    if (state.summaryResult) {
      body.replaceChildren(renderSummaryResult(state.summaryResult));
      return;
    }

    const hint = createSummaryElement(
      "p",
      availability.available ? "ytct-summary-muted" : "ytct-summary-error",
      availability.available ? "基于完整字幕生成中文摘要、亮点和章节要点。" : availability.reason,
    );
    const action = createSummaryElement("button", "ytct-summary-primary", "总结当前视频");
    action.type = "button";
    action.disabled = !availability.available;
    action.dataset.ytctSummaryAction = "generate";
    body.replaceChildren(hint, action);
  }

  function renderSummaryResult(summary) {
    const fragment = document.createDocumentFragment();
    const actions = createSummaryElement("div", "ytct-summary-actions");
    const regenerate = createSummaryElement("button", "", "重新生成");
    regenerate.type = "button";
    regenerate.dataset.ytctSummaryAction = "regenerate";
    actions.appendChild(regenerate);
    if (state.summaryCached) {
      actions.appendChild(createSummaryElement("span", "ytct-summary-muted", "已使用缓存"));
    }
    fragment.appendChild(actions);

    if (summary.summary) {
      fragment.appendChild(createSummaryElement("h3", "", "摘要"));
      fragment.appendChild(createSummaryElement("p", "ytct-summary-text", summary.summary));
    }

    if (summary.highlights?.length) {
      fragment.appendChild(createSummaryElement("h3", "", "亮点"));
      const list = createSummaryElement("ul", "ytct-summary-list");
      summary.highlights.forEach((highlight) => {
        list.appendChild(createSummaryElement("li", "", highlight));
      });
      fragment.appendChild(list);
    }

    if (summary.chapters?.length) {
      fragment.appendChild(createSummaryElement("h3", "", "章节要点"));
      const chapters = createSummaryElement("div", "ytct-summary-chapters");
      summary.chapters.forEach((chapter) => {
        const item = createSummaryElement("section", "ytct-summary-chapter");
        const header = createSummaryElement("div", "ytct-summary-chapter-header");
        const seek = createSummaryElement("button", "ytct-summary-time", formatSummaryTime(chapter.start));
        seek.type = "button";
        seek.dataset.ytctSummaryAction = "seek";
        seek.dataset.start = String(chapter.start);
        header.appendChild(seek);
        header.appendChild(createSummaryElement("strong", "", chapter.title || "章节"));
        item.appendChild(header);
        if (chapter.points?.length) {
          const points = createSummaryElement("ul", "ytct-summary-list");
          chapter.points.forEach((point) => {
            points.appendChild(createSummaryElement("li", "", point));
          });
          item.appendChild(points);
        }
        chapters.appendChild(item);
      });
      fragment.appendChild(chapters);
    }

    return fragment;
  }
```

- [ ] **Step 4: Add panel lifecycle and click handling**

Insert this block after the code from Step 3:

```js
  function ensureSummaryPanel() {
    if (!state.summaryPanel || !state.summaryPanel.isConnected) {
      const panel = document.createElement("aside");
      panel.className = "ytct-summary-panel";
      panel.dataset.ytctInstanceId = YTCT_INSTANCE_ID;

      const header = createSummaryElement("div", "ytct-summary-header");
      const title = createSummaryElement("strong", "ytct-summary-title", "视频总结");
      const toggle = createSummaryElement("button", "ytct-summary-icon-button", "收起");
      toggle.type = "button";
      toggle.dataset.ytctSummaryAction = "toggle";
      header.append(title, toggle);

      const body = createSummaryElement("div", "ytct-summary-body");
      panel.append(header, body);
      panel.addEventListener("click", handleSummaryPanelClick);
      document.body.appendChild(panel);
      state.summaryPanel = panel;
    }
    return state.summaryPanel;
  }

  function handleSummaryPanelClick(event) {
    const actionElement = event.target.closest("[data-ytct-summary-action]");
    if (!actionElement) {
      return;
    }
    const action = actionElement.dataset.ytctSummaryAction;
    if (action === "toggle") {
      state.summaryCollapsed = !state.summaryCollapsed;
      renderSummaryPanel();
      return;
    }
    if (action === "generate") {
      summarizeCurrentVideo(false);
      return;
    }
    if (action === "regenerate") {
      summarizeCurrentVideo(true);
      return;
    }
    if (action === "seek") {
      seekToSummaryChapter(Number(actionElement.dataset.start));
    }
  }

  function seekToSummaryChapter(start) {
    const video = getVideo();
    if (!video || !Number.isFinite(start)) {
      return;
    }
    const wasPaused = video.paused;
    video.currentTime = Math.max(0, start);
    if (!wasPaused) {
      video.play().catch(() => {
        // Browser autoplay rules can reject play after seeking.
      });
    }
  }
```

- [ ] **Step 5: Add `summarizeCurrentVideo`**

Insert this after `seekToSummaryChapter`:

```js
  async function summarizeCurrentVideo(force) {
    const availability = getSummaryAvailability();
    if (!availability.available) {
      state.summaryStatus = "error";
      state.summaryError = availability.reason;
      renderSummaryPanel();
      return;
    }

    const requestId = ++state.summaryRequestId;
    state.summaryStatus = "generating";
    state.summaryError = "";
    renderSummaryPanel();

    try {
      const response = await sendMessage(
        {
          type: "YTCT_SUMMARIZE_VIDEO",
          payload: {
            videoId: state.videoId,
            metadata: readMetadata(),
            cues: summaryCuePayload(),
            force: Boolean(force),
          },
        },
        SUMMARY_MESSAGE_TIMEOUT_MS,
      );

      if (requestId !== state.summaryRequestId) {
        return;
      }
      if (!response?.ok) {
        throw new Error(response?.error || "摘要生成失败");
      }
      if (response.result?.skipped) {
        throw new Error("扩展已关闭");
      }

      state.summaryResult = response.result?.summary || null;
      state.summaryCached = Boolean(response.result?.cached);
      state.summaryStatus = state.summaryResult ? "ready" : "error";
      state.summaryError = state.summaryResult ? "" : "API 没有返回可用摘要";
    } catch (error) {
      if (requestId === state.summaryRequestId) {
        state.summaryStatus = "error";
        state.summaryError = error.message || "摘要生成失败";
      }
    } finally {
      if (requestId === state.summaryRequestId) {
        renderSummaryPanel();
      }
    }
  }
```

- [ ] **Step 6: Hook panel rendering into timeline and settings state**

Make these targeted edits:

```js
// At the end of loadCaptionTimeline success path, after prefetchTimelineTranslations({ force: true });
renderSummaryPanel();

// In switchToFallback, after updateOverlayDiagnostics(...)
renderSummaryPanel();

// In resetForNavigation, after state.videoId = core.getYouTubeVideoId(location.href);
state.summaryStatus = "idle";
state.summaryResult = null;
state.summaryError = "";
state.summaryCached = false;
state.summaryRequestId += 1;
renderSummaryPanel();

// In the YTCT_PUBLIC_SETTINGS_UPDATED listener, after applyOverlayStyle();
renderSummaryPanel();

// In refreshSettings().finally(...), after ensureOverlay();
ensureSummaryPanel();
renderSummaryPanel();
```

- [ ] **Step 7: Run tests and syntax check**

Run:

```bash
npm test
```

Expected: content script static assertions PASS except CSS assertion if CSS is not implemented yet.

Run:

```bash
node --check src/content_script.js
```

Expected: PASS with no output.

- [ ] **Step 8: Commit content script UI behavior**

Run:

```bash
git add src/content_script.js
git commit -m "feat: add video summary panel behavior"
```

## Task 5: Summary Panel CSS

**Files:**
- Modify: `src/content_script.css`
- Test: `tests/core.test.js`

- [ ] **Step 1: Add desktop and mobile summary panel styles**

Append this block to `src/content_script.css`:

```css
.ytct-summary-panel {
  position: fixed;
  top: 88px;
  right: 24px;
  z-index: 2147483646;
  box-sizing: border-box;
  width: min(380px, calc(100vw - 32px));
  max-height: calc(100vh - 120px);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid rgba(0, 0, 0, 0.12);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.98);
  color: #151515;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.18);
  font-family:
    "PingFang SC",
    "Microsoft YaHei",
    "Noto Sans CJK SC",
    Arial,
    sans-serif;
  line-height: 1.45;
  letter-spacing: 0;
}

.ytct-summary-panel[data-collapsed="true"] {
  width: auto;
  max-width: calc(100vw - 32px);
}

.ytct-summary-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 14px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.08);
}

.ytct-summary-title {
  font-size: 16px;
  line-height: 1.25;
}

.ytct-summary-body {
  display: grid;
  gap: 12px;
  min-height: 0;
  overflow: auto;
  padding: 14px;
  font-size: 14px;
}

.ytct-summary-body h3 {
  margin: 8px 0 0;
  font-size: 15px;
  line-height: 1.3;
}

.ytct-summary-text,
.ytct-summary-muted,
.ytct-summary-error {
  margin: 0;
}

.ytct-summary-muted {
  color: #666;
  font-size: 12px;
}

.ytct-summary-error {
  color: #b3261e;
}

.ytct-summary-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.ytct-summary-list {
  display: grid;
  gap: 6px;
  margin: 0;
  padding-left: 20px;
}

.ytct-summary-chapters {
  display: grid;
  gap: 10px;
}

.ytct-summary-chapter {
  display: grid;
  gap: 6px;
  padding: 10px 0;
  border-top: 1px solid rgba(0, 0, 0, 0.08);
}

.ytct-summary-chapter-header {
  display: flex;
  align-items: center;
  gap: 8px;
}

.ytct-summary-panel button {
  border: 1px solid rgba(0, 0, 0, 0.16);
  border-radius: 6px;
  padding: 6px 10px;
  background: #fff;
  color: #151515;
  cursor: pointer;
  font: inherit;
}

.ytct-summary-panel button:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.ytct-summary-primary {
  border-color: #d93025 !important;
  background: #d93025 !important;
  color: #fff !important;
}

.ytct-summary-icon-button,
.ytct-summary-time {
  white-space: nowrap;
}

.ytct-summary-time {
  color: #065fd4 !important;
}

@media (prefers-color-scheme: dark) {
  .ytct-summary-panel {
    border-color: rgba(255, 255, 255, 0.16);
    background: rgba(32, 33, 36, 0.98);
    color: #f2f2f2;
    box-shadow: 0 12px 32px rgba(0, 0, 0, 0.42);
  }

  .ytct-summary-header,
  .ytct-summary-chapter {
    border-color: rgba(255, 255, 255, 0.12);
  }

  .ytct-summary-muted {
    color: #b8b8b8;
  }

  .ytct-summary-error {
    color: #ff8a82;
  }

  .ytct-summary-panel button {
    border-color: rgba(255, 255, 255, 0.22);
    background: #202124;
    color: #f2f2f2;
  }

  .ytct-summary-time {
    color: #8ab4f8 !important;
  }
}

@media (max-width: 720px) {
  .ytct-summary-panel {
    top: auto;
    right: 12px;
    bottom: 12px;
    left: 12px;
    width: auto;
    max-height: min(62vh, 520px);
  }
}
```

- [ ] **Step 2: Run the full test suite**

Run:

```bash
npm test
```

Expected: PASS.

- [ ] **Step 3: Run all syntax checks**

Run:

```bash
npm run check
```

Expected: PASS.

- [ ] **Step 4: Commit CSS**

Run:

```bash
git add src/content_script.css
git commit -m "style: add video summary panel styles"
```

## Task 6: README And Manual Verification

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Update README working behavior**

In the `工作方式` list, add this bullet after the `src/core.js` bullet:

```md
- 页面内「视频总结」面板会复用完整字幕时间轴，用户手动点击后生成当前视频的中文摘要、亮点和可跳转章节要点。
```

- [ ] **Step 2: Update README limitations**

In the `限制` list, add this bullet:

```md
- 视频总结需要完整字幕时间轴；如果 YouTube 只暴露当前可见字幕而无法加载完整 transcript，插件不会调用 API 生成摘要。
```

- [ ] **Step 3: Run final automated verification**

Run:

```bash
npm test
```

Expected: PASS.

Run:

```bash
npm run check
```

Expected: PASS.

- [ ] **Step 4: Load extension and manually verify on YouTube**

Manual browser verification:

1. Open `chrome://extensions/`.
2. Reload the unpacked extension from `/Users/peiduo/Documents/chrome_chajian_youtubetranslate`.
3. Open a YouTube video with English captions.
4. Confirm the `视频总结` panel appears on the page.
5. Confirm the button is disabled while captions are loading.
6. Click `总结当前视频` after timeline mode is ready.
7. Confirm `摘要`, `亮点`, and `章节要点` render in Chinese.
8. Click a chapter timestamp and confirm the video seeks to that point.
9. Click `重新生成` and confirm the request runs again rather than showing the cached marker.

- [ ] **Step 5: Commit README**

Run:

```bash
git add README.md
git commit -m "docs: document video summarization"
```

## Final Review Checklist

- [ ] `git status --short` shows only intended files or a clean tree.
- [ ] `npm test` passes.
- [ ] `npm run check` passes.
- [ ] Summary failures stay inside the summary panel and do not affect subtitle translation.
- [ ] No summaries are written to `chrome.storage`.
- [ ] The implementation uses the existing `state.timeline` and does not add a second transcript-fetching path.
