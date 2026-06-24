const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const core = require("../src/core.js");
const projectRoot = path.join(__dirname, "..");

test("normalizes caption text without changing meaningful punctuation", () => {
  assert.equal(
    core.normalizeCaptionText("  given point  of time\nright  "),
    "given point of time right",
  );
  assert.equal(core.normalizeCaptionText("Q(a1) = 0.33"), "Q(a1) = 0.33");
});

test("detects probable code without skipping natural prose keywords", () => {
  assert.equal(
    core.isProbablyCodeText(
      "When you cannot write the rule, hand the search to the gradient and let examples shape the behavior.",
    ),
    false,
  );
  assert.equal(
    core.isProbablyCodeText("The class of models can return better answers over time."),
    false,
  );
  assert.equal(core.isProbablyCodeText("let value = computeReward(state);"), true);
  assert.equal(core.isProbablyCodeText("function updatePolicy(state) { return state; }"), true);
});

test("splits multiline web page text into translatable segments", () => {
  assert.deepEqual(
    core.splitWebPageTextSegments(`Do twin primes go on forever?

If you’re looking for a molecular modelling kit, try Snatoms.

▀▀▀
0:00 What are twin primes?
3:08 How To Find Prime Numbers

References can be found here: https://ve42.co/TwinPrimesRefs`),
    [
      "Do twin primes go on forever?",
      "If you’re looking for a molecular modelling kit, try Snatoms.",
      "0:00 What are twin primes?",
      "3:08 How To Find Prime Numbers",
      "References can be found here: https://ve42.co/TwinPrimesRefs",
    ],
  );
});

test("builds a context-aware prompt with bounded previous captions", () => {
  const prompt = core.buildTranslationPrompt({
    currentText: "given point of time right so what we do is right we do",
    context: [
      { source: "we have two actions", translation: "我们有两个动作" },
      { source: "a one and a two", translation: "a1 和 a2" },
      { source: "q value is updated", translation: "Q 值会更新" },
    ],
    metadata: {
      title: "W1_L3: Immediate RL and bandits",
      channel: "IIT Madras - B.S. Degree Programme",
      url: "https://www.youtube.com/watch?v=abc",
    },
    customInstructions: "保留 reinforcement learning 的常用术语。",
    maxContextItems: 2,
  });

  assert.match(prompt, /Current caption/);
  assert.match(prompt, /Immediate RL and bandits/);
  assert.doesNotMatch(prompt, /we have two actions/);
  assert.match(prompt, /a one and a two/);
  assert.match(prompt, /q value is updated/);
  assert.match(prompt, /保留 reinforcement learning/);
});

test("parses provider translations from JSON, fenced JSON, and plain text", () => {
  assert.equal(
    core.extractTranslationFromText('{"translation":"所以我们要做的是"}'),
    "所以我们要做的是",
  );
  assert.equal(
    core.extractTranslationFromText('```json\n{"translation":"Q 值会更新"}\n```'),
    "Q 值会更新",
  );
  assert.equal(
    core.extractTranslationFromText(
      'Here is the JSON requested:\n{"translation":"最终要识别正确的臂。"}',
    ),
    "最终要识别正确的臂。",
  );
  assert.equal(
    core.extractTranslationFromText("所以，我们在当前时刻要做的是……"),
    "所以，我们在当前时刻要做的是……",
  );
  assert.equal(
    core.extractTranslationFromText('{"translation":"、使用 Qε 贪婪算法和 softmax 算法。"}'),
    "使用 Qε 贪婪算法和 softmax 算法。",
  );
  assert.equal(
    core.parseProviderResponse("openrouter", {
      choices: [{ message: { content: '{"translation":"样本复杂度会被最小化。"}' } }],
    }),
    "样本复杂度会被最小化。",
  );
});

test("normalizes settings with provider-specific defaults and safe bounds", () => {
  assert.deepEqual(core.normalizeSettings({}), {
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
    syncStrategy: "cue",
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

  assert.equal(
    core.normalizeSettings({ provider: "deepseek", contextItems: 99 }).contextItems,
    20,
  );
  assert.equal(
    core.normalizeSettings({ provider: "unknown", contextItems: -5 }).provider,
    "gemini",
  );
  assert.equal(
    core.normalizeSettings({ geminiModel: "gemini-3.1-flash" }).geminiModel,
    "gemini-2.5-flash-lite",
  );
  assert.equal(
    core.normalizeSettings({ provider: "openrouter" }).provider,
    "openrouter",
  );
  assert.equal(
    core.getModelForProvider({ provider: "openrouter", openrouterModel: "openai/gpt-5-mini" }),
    "openai/gpt-5-mini",
  );
  assert.equal(
    core.normalizeSettings({ userGlossary: " policy = policy " }).userGlossary,
    "policy = policy",
  );
  assert.equal(
    core.normalizeSettings({ sourceDisplayMode: "clean" }).sourceDisplayMode,
    "clean",
  );
  assert.equal(
    core.normalizeSettings({ syncStrategy: "segment" }).syncStrategy,
    "segment",
  );
  assert.equal(
    core.normalizeSettings({ sourceDisplayMode: "unknown", syncStrategy: "bad" })
      .syncStrategy,
    "cue",
  );
  assert.equal(
    core.normalizeSettings({ webTranslationEnabled: false }).webTranslationEnabled,
    false,
  );
  assert.equal(
    core.normalizeSettings({ webTranslationTargetLanguage: " ja " })
      .webTranslationTargetLanguage,
    "ja",
  );
  assert.equal(
    core.normalizeSettings({ webTranslationDisplayMode: "translation" })
      .webTranslationDisplayMode,
    "translation",
  );
  assert.equal(
    core.normalizeSettings({ webTranslationScope: "page" }).webTranslationScope,
    "page",
  );
  assert.equal(
    core.normalizeSettings({ webTranslationSiteRules: "[]" }).webTranslationSiteRules,
    "[]",
  );
});

test("keeps provider API keys and overlay display settings independently", () => {
  const settings = core.normalizeSettings({
    provider: "openrouter",
    geminiApiKey: " gemini-key ",
    deepseekApiKey: " deepseek-key ",
    openrouterApiKey: " openrouter-key ",
    overlayOpacityPercent: -20,
    overlayFontScalePercent: 1000,
    overlayXPercent: 101,
    overlayYPercent: -1,
  });

  assert.equal(settings.apiKey, "openrouter-key");
  assert.equal(settings.geminiApiKey, "gemini-key");
  assert.equal(settings.deepseekApiKey, "deepseek-key");
  assert.equal(settings.openrouterApiKey, "openrouter-key");
  assert.equal(core.getApiKeyForProvider(settings), "openrouter-key");
  assert.equal(Object.hasOwn(settings, "overlayWidthPercent"), false);
  assert.equal(settings.overlayOpacityPercent, 0);
  assert.equal(settings.overlayFontScalePercent, 150);
  assert.equal(settings.overlayXPercent, 100);
  assert.equal(settings.overlayYPercent, 0);
});

test("pins overlay width to two thirds of the video frame", () => {
  const css = fs.readFileSync(
    path.join(projectRoot, "src", "content_script.css"),
    "utf8",
  );
  const script = fs.readFileSync(
    path.join(projectRoot, "src", "content_script.js"),
    "utf8",
  );

  assert.match(css, /position:\s*fixed/);
  assert.doesNotMatch(css, /66\.6667vw/);
  assert.match(script, /const OVERLAY_WIDTH_RATIO = 2 \/ 3/);
  assert.match(script, /getPlayer\(\)\.getBoundingClientRect\(\)/);
  assert.match(script, /position:\s*"fixed"/);
  assert.match(script, /width:\s*overlayWidthPx/);
  assert.match(script, /minWidth:\s*overlayWidthPx/);
  assert.match(script, /maxWidth:\s*overlayWidthPx/);
  assert.doesNotMatch(script, /width:\s*"66\.6667%"/);
  assert.doesNotMatch(script, /maxWidth:\s*"66\.6667%"/);
  assert.doesNotMatch(script, /width:\s*overlayWidth,\n/);
});

test("keeps overlay draggable outside the player and live-saves display sliders", () => {
  const script = fs.readFileSync(
    path.join(projectRoot, "src", "content_script.js"),
    "utf8",
  );
  const options = fs.readFileSync(
    path.join(projectRoot, "src", "options.js"),
    "utf8",
  );

  assert.match(script, /function getOverlayHost\(\)/);
  assert.match(script, /document\.fullscreenElement \|\| document\.body/);
  assert.match(options, /function scheduleDisplaySettingsSave\(\)/);
  assert.match(options, /input\.addEventListener\("input", \(\) => \{/);
  assert.match(options, /scheduleDisplaySettingsSave\(\)/);
});

test("content script removes stale duplicate subtitle overlays", () => {
  const script = fs.readFileSync(
    path.join(projectRoot, "src", "content_script.js"),
    "utf8",
  );
  const css = fs.readFileSync(
    path.join(projectRoot, "src", "content_script.css"),
    "utf8",
  );

  assert.match(script, /YTCT_INSTANCE_ID/);
  assert.match(script, /function removeStaleOverlays\(\)/);
  assert.match(script, /querySelectorAll\("\.ytct-overlay"\)/);
  assert.match(script, /dataset\.ytctInstanceId/);
  assert.match(script, /\.remove\(\)/);
  assert.match(css, /ytp-caption-window-container/);
});

test("adds ML AI RL course guidance to translation prompts", () => {
  const prompt = core.buildTranslationPrompt({
    currentText: "we update the q value using epsilon greedy exploration",
  });
  const batchPrompt = core.buildBatchTranslationPrompt({
    cues: [
      {
        id: "cue-0",
        start: 1,
        end: 2,
        source: "the policy maximizes the expected reward",
      },
    ],
  });

  assert.match(prompt, /ML\/AI\/RL course lecture/);
  assert.match(prompt, /Q value/);
  assert.match(prompt, /epsilon-greedy/);
  assert.match(prompt, /ASR/);
  assert.match(batchPrompt, /ML\/AI\/RL course lecture/);
});

test("builds semantic translation segments without changing cue timing", () => {
  const segments = core.buildTranslationSegmentsFromCues([
    { id: "cue-0", start: 1, end: 1.8, source: "in reinforcement" },
    { id: "cue-1", start: 1.8, end: 2.5, source: "learning the agent" },
    { id: "cue-2", start: 2.5, end: 3.3, source: "takes an action." },
    { id: "cue-3", start: 4, end: 5, source: "Then we update Q." },
  ]);

  assert.deepEqual(segments, [
    {
      id: "segment-0",
      start: 1,
      end: 3.3,
      sourceRaw: "in reinforcement learning the agent takes an action.",
      sourceClean: "in reinforcement learning the agent takes an action.",
      cueIds: ["cue-0", "cue-1", "cue-2"],
      cues: [
        {
          id: "cue-0",
          start: 1,
          end: 1.8,
          sourceRaw: "in reinforcement",
          sourceClean: "in reinforcement",
        },
        {
          id: "cue-1",
          start: 1.8,
          end: 2.5,
          sourceRaw: "learning the agent",
          sourceClean: "learning the agent",
        },
        {
          id: "cue-2",
          start: 2.5,
          end: 3.3,
          sourceRaw: "takes an action.",
          sourceClean: "takes an action.",
        },
      ],
    },
    {
      id: "segment-1",
      start: 4,
      end: 5,
      sourceRaw: "Then we update Q.",
      sourceClean: "Then we update Q.",
      cueIds: ["cue-3"],
      cues: [
        {
          id: "cue-3",
          start: 4,
          end: 5,
          sourceRaw: "Then we update Q.",
          sourceClean: "Then we update Q.",
        },
      ],
    },
  ]);
});

test("builds sourceClean for ASR cues while preserving sourceRaw", () => {
  const segments = core.buildTranslationSegmentsFromCues(
    [
      {
        id: "cue-0",
        start: 1,
        end: 2,
        source: "we use q learning",
      },
      {
        id: "cue-1",
        start: 2,
        end: 3,
        source: "and epsilon greedy in mdp.",
      },
    ],
    { captionKind: "asr" },
  );

  assert.equal(
    segments[0].sourceRaw,
    "we use q learning and epsilon greedy in mdp.",
  );
  assert.equal(
    segments[0].sourceClean,
    "we use Q-learning and epsilon-greedy in MDP.",
  );
  assert.deepEqual(
    segments[0].cues.map((cue) => cue.sourceRaw),
    ["we use q learning", "and epsilon greedy in mdp."],
  );
  assert.deepEqual(
    segments[0].cues.map((cue) => cue.sourceClean),
    ["we use Q-learning", "and epsilon-greedy in MDP."],
  );
});

test("keeps manual captions on light source cleaning", () => {
  assert.equal(
    core.cleanCaptionSourceText("  Q learning   and epsilon greedy  ", {
      captionKind: "manual",
    }),
    "Q learning and epsilon greedy",
  );
});

test("cleans ASR fillers, casing, punctuation, and common technical errors", () => {
  assert.equal(
    core.cleanCaptionSourceText(
      "um you know mark off decision process and cue value",
      { captionKind: "asr" },
    ),
    "Markov decision process and Q value.",
  );
  assert.equal(
    core.cleanCaptionSourceText("uh temporal different signal", {
      captionKind: "asr",
    }),
    "Temporal-difference signal.",
  );
});

test("keeps incomplete segment endings attached to the next cue", () => {
  const segments = core.buildTranslationSegmentsFromCues([
    { id: "cue-0", start: 1, end: 2, source: "The first part is the." },
    { id: "cue-1", start: 2, end: 3, source: "Bellman equation." },
  ]);

  assert.equal(segments.length, 1);
  assert.deepEqual(segments[0].cueIds, ["cue-0", "cue-1"]);
});

test("splits long segments by duration and word count limits", () => {
  assert.deepEqual(
    core.buildTranslationSegmentsFromCues(
      [
        { id: "cue-0", start: 0, end: 2, source: "one two three" },
        { id: "cue-1", start: 2, end: 4, source: "four five six" },
        { id: "cue-2", start: 4, end: 6, source: "seven eight nine" },
      ],
      { maxWordsPerSegment: 6, maxDurationSeconds: 10 },
    ).map((segment) => segment.cueIds),
    [
      ["cue-0", "cue-1"],
      ["cue-2"],
    ],
  );
  assert.deepEqual(
    core.buildTranslationSegmentsFromCues(
      [
        { id: "cue-0", start: 0, end: 6, source: "alpha beta" },
        { id: "cue-1", start: 6, end: 13, source: "gamma delta" },
      ],
      { maxDurationSeconds: 12 },
    ).map((segment) => segment.cueIds),
    [["cue-0"], ["cue-1"]],
  );
});

test("builds segment prompt that asks for cue-level output", () => {
  const segments = core.buildTranslationSegmentsFromCues([
    { id: "cue-0", start: 1, end: 1.8, source: "in reinforcement" },
    { id: "cue-1", start: 1.8, end: 2.6, source: "learning." },
  ]);
  const prompt = core.buildSegmentTranslationPrompt({
    outputSegments: segments,
    nonOutputContextBefore: [
      { id: "cue-before", start: 0, end: 1, source: "Today we discuss MDPs." },
    ],
    nonOutputContextAfter: [
      { id: "cue-after", start: 3, end: 4, source: "The reward comes next." },
    ],
    videoMemory: {
      summary: "A reinforcement learning lecture.",
      glossary: [{ source: "MDP", translation: "MDP" }],
    },
    metadata: { title: "RL lecture" },
    customInstructions: "保留 policy。",
    userGlossary: [{ source: "policy", target: "policy", locked: true }],
  });

  assert.match(prompt, /whole segment/);
  assert.match(prompt, /cue_translations/);
  assert.match(prompt, /non_output_context_before/);
  assert.match(prompt, /output_segments/);
  assert.match(prompt, /non_output_context_after/);
  assert.match(prompt, /videoMemory/);
  assert.match(prompt, /segment-0/);
  assert.match(prompt, /cue-0/);
  assert.match(prompt, /cue-1/);
  assert.match(prompt, /A reinforcement learning lecture/);
  assert.match(prompt, /user_glossary/);
  assert.match(prompt, /User glossary > video memory glossary/);
  assert.match(prompt, /保留 policy/);
});

test("parses user glossary entries with locked priority", () => {
  assert.deepEqual(
    core.parseUserGlossary(`
policy = policy
regret -> regret
bandit: bandit（多臂赌博机）
invalid line
    `),
    [
      { source: "policy", target: "policy", locked: true },
      { source: "regret", target: "regret", locked: true },
      { source: "bandit", target: "bandit（多臂赌博机）", locked: true },
    ],
  );
  assert.equal(
    core.createGlossaryVersion(core.parseUserGlossary("policy = policy")),
    core.createGlossaryVersion(core.parseUserGlossary(" policy=policy ")),
  );
});

test("parses segment translation response into cue translations", () => {
  const result = core.parseSegmentTranslationResponse(`Here is JSON:
  {
    "segments": [
      {
        "id": "segment-0",
        "clean_source": "in reinforcement learning.",
        "full_translation": "在强化学习中。",
        "cue_translations": [
          {"id": "cue-0", "translation": "在强化"},
          {"id": "cue-1", "translation": "学习中。"}
        ]
      }
    ]
  }`);

  assert.deepEqual(result, {
    cueTranslations: {
      "cue-0": "在强化",
      "cue-1": "学习中。",
    },
    segmentTranslations: {
      "segment-0": {
        cleanSource: "in reinforcement learning.",
        fullTranslation: "在强化学习中。",
      },
    },
  });
});

test("builds overlapping video memory chunks from cleaned cues", () => {
  const cues = [
    { id: "cue-0", start: 0, end: 1, source: "we discuss q learning" },
    { id: "cue-1", start: 1, end: 2, source: "and mdp." },
    { id: "cue-2", start: 2, end: 3, source: "the policy changes" },
    { id: "cue-3", start: 3, end: 4, source: "with reward." },
    { id: "cue-4", start: 4, end: 5, source: "next topic." },
  ];

  assert.deepEqual(
    core.buildVideoMemoryChunks(cues, {
      captionKind: "asr",
      chunkSize: 3,
      overlap: 1,
    }),
    [
      {
        id: "memory-chunk-0",
        cues: [
          {
            id: "cue-0",
            start: 0,
            end: 1,
            sourceRaw: "we discuss q learning",
            sourceClean: "we discuss Q-learning",
          },
          {
            id: "cue-1",
            start: 1,
            end: 2,
            sourceRaw: "and mdp.",
            sourceClean: "and MDP.",
          },
          {
            id: "cue-2",
            start: 2,
            end: 3,
            sourceRaw: "the policy changes",
            sourceClean: "the policy changes",
          },
        ],
      },
      {
        id: "memory-chunk-1",
        cues: [
          {
            id: "cue-2",
            start: 2,
            end: 3,
            sourceRaw: "the policy changes",
            sourceClean: "the policy changes",
          },
          {
            id: "cue-3",
            start: 3,
            end: 4,
            sourceRaw: "with reward.",
            sourceClean: "with reward.",
          },
          {
            id: "cue-4",
            start: 4,
            end: 5,
            sourceRaw: "next topic.",
            sourceClean: "next topic.",
          },
        ],
      },
    ],
  );
});

test("builds and parses video memory analysis prompts", () => {
  const chunk = core.buildVideoMemoryChunks(
    [{ id: "cue-0", start: 0, end: 1, source: "q value is updated" }],
    { captionKind: "asr" },
  )[0];
  const prompt = core.buildVideoMemoryPrompt({
    chunk,
    metadata: { title: "RL lecture" },
    captionKind: "asr",
  });
  const parsed = core.parseVideoMemoryResponse(`{
    "summary": "RL update rules.",
    "domain": "reinforcement learning",
    "styleGuide": "Use concise subtitle Chinese.",
    "glossary": [{"source":"Q value","translation":"Q 值"}],
    "entities": ["Bellman"],
    "asrCorrections": [{"wrong":"cue value","correct":"Q value"}]
  }`);

  assert.match(prompt, /VideoMemory map step/);
  assert.match(prompt, /summary/);
  assert.match(prompt, /glossary/);
  assert.match(prompt, /asrCorrections/);
  assert.match(prompt, /Q value/);
  assert.deepEqual(parsed, {
    summary: "RL update rules.",
    domain: "reinforcement learning",
    styleGuide: "Use concise subtitle Chinese.",
    glossary: [{ source: "Q value", translation: "Q 值" }],
    entities: ["Bellman"],
    asrCorrections: [{ wrong: "cue value", correct: "Q value" }],
  });
});

test("merges video memory map outputs into a compressed memory", () => {
  assert.deepEqual(
    core.mergeVideoMemoryItems([
      {
        summary: "Introduces bandits.",
        domain: "reinforcement learning",
        glossary: [
          { source: "Q value", translation: "Q 值" },
          { source: "policy", translation: "策略" },
        ],
        entities: ["UCB"],
        asrCorrections: [{ wrong: "cue value", correct: "Q value" }],
      },
      {
        summary: "Explains regret.",
        domain: "RL",
        glossary: [{ source: "Q value", translation: "Q 值" }],
        entities: ["UCB", "PAC"],
        asrCorrections: [{ wrong: "empty greedy", correct: "epsilon-greedy" }],
      },
    ]),
    {
      summary: "Introduces bandits. Explains regret.",
      domain: "reinforcement learning",
      styleGuide: "",
      glossary: [
        { source: "Q value", translation: "Q 值" },
        { source: "policy", translation: "策略" },
      ],
      entities: ["UCB", "PAC"],
      asrCorrections: [
        { wrong: "cue value", correct: "Q value" },
        { wrong: "empty greedy", correct: "epsilon-greedy" },
      ],
    },
  );
});

test("builds video memory reduce prompts with channel memory", () => {
  const prompt = core.buildVideoMemoryReducePrompt({
    items: [
      {
        summary: "Introduces Q value.",
        glossary: [{ source: "Q value", translation: "Q 值" }],
      },
    ],
    channelMemory: {
      summary: "Prior lectures use policy in English.",
      glossary: [{ source: "policy", translation: "policy" }],
    },
    metadata: {
      title: "RL lecture",
      description: "A lecture about Bellman equations.",
      playlist: "RL course",
      chapters: ["Intro", "Bellman"],
    },
  });

  assert.match(prompt, /VideoMemory reduce step/);
  assert.match(prompt, /channelMemory/);
  assert.match(prompt, /RL course/);
  assert.match(prompt, /Bellman equations/);
  assert.match(prompt, /Q value/);
  assert.match(prompt, /policy/);
});

test("creates stable cache keys from provider, model, context, and caption", () => {
  const first = core.createCaptionCacheKey({
    provider: "gemini",
    model: "gemini-2.5-flash",
    videoId: "abc",
    currentText: "Hello world",
    context: [{ source: "Before", translation: "之前" }],
  });
  const second = core.createCaptionCacheKey({
    provider: "gemini",
    model: "gemini-2.5-flash",
    videoId: "abc",
    currentText: "Hello   world",
    context: [{ source: "Before", translation: "之前" }],
  });

  assert.equal(first, second);
});

test("creates versioned translation cache keys from clean source and glossary", () => {
  const base = {
    provider: "gemini",
    model: "gemini-2.5-flash",
    videoId: "abc",
    sourceLanguage: "en",
    targetLanguage: "zh-CN",
    promptVersion: "segment-v2",
    glossaryVersion: "g1",
    segmentId: "segment-1",
    sourceClean: "Q value is updated.",
  };

  assert.equal(
    core.createCaptionCacheKey(base),
    core.createCaptionCacheKey({ ...base, currentText: "ignored" }),
  );
  assert.notEqual(
    core.createCaptionCacheKey(base),
    core.createCaptionCacheKey({ ...base, glossaryVersion: "g2" }),
  );
  assert.notEqual(
    core.createCaptionCacheKey(base),
    core.createCaptionCacheKey({ ...base, sourceClean: "Q value changes." }),
  );
});

test("applies locked glossary terms to cue translations conservatively", () => {
  assert.deepEqual(
    core.applyGlossaryConsistency({
      cueTranslations: {
        "cue-0": "这个政策会更新。",
        "cue-1": "遗憾值会下降。",
      },
      cueSources: {
        "cue-0": "the policy is updated",
        "cue-1": "the regret decreases",
      },
      glossary: [
        { source: "policy", target: "policy", locked: true },
        { source: "regret", target: "regret", locked: true },
      ],
    }),
    {
      "cue-0": "这个政策会更新。 policy",
      "cue-1": "遗憾值会下降。 regret",
    },
  );
});

test("builds bilingual caption lines without duplicating empty translations", () => {
  assert.deepEqual(
    core.buildBilingualCaption({ source: "and doing Q Epsilon greedy", translation: "" }),
    {
      source: "and doing Q Epsilon greedy",
      translation: "",
      lines: [{ lang: "source", text: "and doing Q Epsilon greedy" }],
    },
  );
  assert.deepEqual(
    core.buildBilingualCaption({
      source: "and doing Q Epsilon greedy",
      translation: "使用 Q epsilon 贪婪算法",
    }),
    {
      source: "and doing Q Epsilon greedy",
      translation: "使用 Q epsilon 贪婪算法",
      lines: [
        { lang: "source", text: "and doing Q Epsilon greedy" },
        { lang: "translation", text: "使用 Q epsilon 贪婪算法" },
      ],
    },
  );
});

test("extracts only visible YouTube rollup caption rows and removes repeated words", () => {
  const text = core.extractVisibleCaptionText([
    {
      text: "pack",
      rect: { top: 642, bottom: 681 },
      windowRect: { top: 720, bottom: 798 },
    },
    {
      text: "pack framework framework ah ah is is to to minimize minimize the the the the",
      rect: { top: 681, bottom: 720 },
      windowRect: { top: 720, bottom: 798 },
    },
    {
      text: "number",
      rect: { top: 720, bottom: 759 },
      windowRect: { top: 720, bottom: 798 },
    },
    {
      text: "number of of samples samples you you take take or or",
      rect: { top: 759, bottom: 798 },
      windowRect: { top: 720, bottom: 798 },
    },
  ]);

  assert.equal(text, "number of samples you take or");
});

test("builds provider request payloads from the same translation prompt", () => {
  const prompt = core.buildTranslationPrompt({ currentText: "hello" });

  const gemini = core.buildProviderRequest({
    provider: "gemini",
    model: "gemini-2.5-flash",
    prompt,
  });
  assert.equal(gemini.url, "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent");
  assert.equal(gemini.options.method, "POST");
  assert.equal(JSON.parse(gemini.options.body).contents[0].parts[0].text, prompt);

  const deepseek = core.buildProviderRequest({
    provider: "deepseek",
    model: "deepseek-v4-flash",
    prompt,
  });
  const body = JSON.parse(deepseek.options.body);
  assert.equal(deepseek.url, "https://api.deepseek.com/chat/completions");
  assert.equal(body.model, "deepseek-v4-flash");
  assert.deepEqual(body.thinking, { type: "disabled" });
  assert.equal(body.messages.at(-1).content, prompt);
  assert.deepEqual(body.response_format, { type: "json_object" });

  const openrouter = core.buildProviderRequest({
    provider: "openrouter",
    model: "google/gemini-2.5-flash-lite",
    prompt,
  });
  const openrouterBody = JSON.parse(openrouter.options.body);
  assert.equal(openrouter.url, "https://openrouter.ai/api/v1/chat/completions");
  assert.equal(openrouterBody.model, "google/gemini-2.5-flash-lite");
  assert.equal(openrouterBody.messages.at(-1).content, prompt);
  assert.deepEqual(openrouterBody.response_format, { type: "json_object" });
  assert.deepEqual(openrouterBody.plugins, [{ id: "response-healing" }]);
});

test("extracts YouTube caption tracks from player response scripts", () => {
  const scripts = [
    "window.foo = {};",
    'var ytInitialPlayerResponse = {"captions":{"playerCaptionsTracklistRenderer":{"captionTracks":[{"baseUrl":"https://www.youtube.com/api/timedtext?v=abc\\u0026lang=en","name":{"simpleText":"English"},"languageCode":"en","kind":"asr","vssId":"a.en"},{"baseUrl":"https://www.youtube.com/api/timedtext?v=abc\\u0026lang=zh","name":{"runs":[{"text":"中文"}]},"languageCode":"zh","vssId":"zh"}]}}}}; var meta = {};',
  ];

  const tracks = core.extractCaptionTracksFromScripts(scripts);

  assert.equal(tracks.length, 2);
  assert.equal(tracks[0].name, "English");
  assert.equal(tracks[0].languageCode, "en");
  assert.equal(tracks[0].kind, "asr");
  assert.equal(tracks[0].baseUrl, "https://www.youtube.com/api/timedtext?v=abc&lang=en");
});

test("chooses only English caption tracks for timeline mode by default", () => {
  const tracks = [
    {
      baseUrl: "https://www.youtube.com/api/timedtext?v=abc&lang=hi",
      name: "Hindi",
      languageCode: "hi",
      kind: "asr",
      vssId: "a.hi",
    },
    {
      baseUrl: "https://www.youtube.com/api/timedtext?v=abc&lang=ur",
      name: "Urdu",
      languageCode: "ur",
      kind: "asr",
      vssId: "a.ur",
    },
  ];

  assert.equal(core.chooseCaptionTrack(tracks), null);
  assert.equal(core.chooseCaptionTrack(tracks, { allowNonEnglish: true }), tracks[0]);
  assert.equal(
    core.chooseCaptionTrack([
      ...tracks,
      {
        baseUrl: "https://www.youtube.com/api/timedtext?v=abc&lang=en",
        name: "English",
        languageCode: "en",
        kind: "asr",
        vssId: "a.en",
      },
    ])?.languageCode,
    "en",
  );
});

test("content script falls back to visible captions when only non-English tracks exist", () => {
  const script = fs.readFileSync(
    path.join(projectRoot, "src", "content_script.js"),
    "utf8",
  );

  assert.match(script, /core\.chooseCaptionTrack\(tracks\)/);
  assert.match(script, /switchToFallback\("no-english-track"\)/);
});

test("parses json3 captions into a searchable timeline", () => {
  const cues = core.parseJson3Captions({
    events: [
      {
        tStartMs: 1200,
        dDurationMs: 1800,
        segs: [{ utf8: "hello " }, { utf8: "world" }],
      },
      { tStartMs: 3200, dDurationMs: 900, segs: [{ utf8: "\n" }] },
      {
        tStartMs: 4200,
        dDurationMs: 1500,
        segs: [{ utf8: "Q" }, { utf8: " value" }],
      },
    ],
  });

  assert.deepEqual(cues, [
    { id: "cue-0", start: 1.2, end: 3, duration: 1.8, source: "hello world", translation: "", status: "pending" },
    { id: "cue-1", start: 4.2, end: 5.7, duration: 1.5, source: "Q value", translation: "", status: "pending" },
  ]);
  assert.equal(core.findCueAtTime(cues, 1.5)?.source, "hello world");
  assert.equal(core.findCueAtTime(cues, 3.4), null);
});

test("parses VTT and YouTube XML captions into the same timeline shape", () => {
  const vtt = core.parseCaptionTrackText(
    [
      "WEBVTT",
      "",
      "00:00:01.200 --> 00:00:03.000",
      "<c>Hello</c> world",
      "",
      "00:00:04.200 --> 00:00:05.700",
      "Q&nbsp;value",
    ].join("\n"),
    "vtt",
  );

  assert.deepEqual(vtt, [
    { id: "cue-0", start: 1.2, end: 3, duration: 1.8, source: "Hello world", translation: "", status: "pending" },
    { id: "cue-1", start: 4.2, end: 5.7, duration: 1.5, source: "Q value", translation: "", status: "pending" },
  ]);

  const srv3 = core.parseCaptionTrackText(
    '<timedtext><body><p t="1200" d="1800"><s>Hello</s> <s>XML</s></p><p t="4200" d="1500">Q&amp;nbsp;value</p></body></timedtext>',
    "srv3",
  );

  assert.deepEqual(srv3, [
    { id: "cue-0", start: 1.2, end: 3, duration: 1.8, source: "Hello XML", translation: "", status: "pending" },
    { id: "cue-1", start: 4.2, end: 5.7, duration: 1.5, source: "Q value", translation: "", status: "pending" },
  ]);
});

test("extracts YouTube transcript API inputs and parses transcript captions", () => {
  const scripts = [
    'ytcfg.set({"INNERTUBE_API_KEY":"test-key","INNERTUBE_CONTEXT":{"client":{"clientName":"WEB","clientVersion":"2.1","visitorData":"visitor"}}});',
    `var ytInitialData = ${JSON.stringify({
      engagementPanels: [
        {
          engagementPanelSectionListRenderer: {
            content: {
              continuationItemRenderer: {
                button: {
                  buttonRenderer: {
                    command: {
                      getTranscriptEndpoint: { params: "transcript-params" },
                    },
                  },
                },
              },
            },
          },
        },
      ],
    })};`,
  ];

  assert.deepEqual(core.extractYouTubePageConfigFromScripts(scripts), {
    apiKey: "test-key",
    context: { client: { clientName: "WEB", clientVersion: "2.1", visitorData: "visitor" } },
    clientName: "WEB",
    clientVersion: "2.1",
    visitorData: "visitor",
  });
  assert.equal(core.extractTranscriptParamsFromScripts(scripts), "transcript-params");

  const cues = core.parseTranscriptResponseCaptions({
    actions: [
      {
        updateEngagementPanelAction: {
          content: {
            transcriptRenderer: {
              body: {
                transcriptBodyRenderer: {
                  cueGroups: [
                    {
                      transcriptCueGroupRenderer: {
                        cues: [
                          {
                            transcriptCueRenderer: {
                              startOffsetMs: "1200",
                              durationMs: "1800",
                              cue: { runs: [{ text: "hello " }, { text: "transcript" }] },
                            },
                          },
                        ],
                      },
                    },
                    {
                      transcriptCueGroupRenderer: {
                        cues: [
                          {
                            transcriptCueRenderer: {
                              startOffsetMs: "4200",
                              durationMs: "1500",
                              cue: { simpleText: "Q value" },
                            },
                          },
                        ],
                      },
                    },
                  ],
                },
              },
            },
          },
        },
      },
    ],
  });

  assert.deepEqual(cues, [
    { id: "cue-0", start: 1.2, end: 3, duration: 1.8, source: "hello transcript", translation: "", status: "pending" },
    { id: "cue-1", start: 4.2, end: 5.7, duration: 1.5, source: "Q value", translation: "", status: "pending" },
  ]);
});

test("parses YouTube transcript panel captions", () => {
  const cues = core.parseTranscriptPanelCaptions(
    {
      content: {
        engagementPanelSectionListRenderer: {
          content: {
            sectionListRenderer: {
              contents: [
                {
                  itemSectionRenderer: {
                    contents: [
                      {
                        macroMarkersPanelItemViewModel: {
                          item: {
                            timelineItemViewModel: {
                              contentItems: [
                                {
                                  transcriptSegmentViewModel: {
                                    simpleText: "hello panel",
                                  },
                                },
                              ],
                            },
                          },
                          onTap: {
                            innertubeCommand: {
                              watchEndpoint: { startTimeSeconds: 0 },
                            },
                          },
                        },
                      },
                      {
                        macroMarkersPanelItemViewModel: {
                          item: {
                            timelineItemViewModel: {
                              contentItems: [
                                {
                                  transcriptSegmentViewModel: {
                                    runs: [{ text: "Q " }, { text: "value" }],
                                  },
                                },
                              ],
                            },
                          },
                          onTap: {
                            innertubeCommand: {
                              watchEndpoint: { startTimeSeconds: 4.2 },
                            },
                          },
                        },
                      },
                    ],
                  },
                },
              ],
            },
          },
        },
      },
    },
    7,
  );

  assert.deepEqual(cues, [
    { id: "cue-0", start: 0, end: 4.199, duration: 4.199, source: "hello panel", translation: "", status: "pending" },
    { id: "cue-1", start: 4.2, end: 7, duration: 2.8, source: "Q value", translation: "", status: "pending" },
  ]);
});

test("parses visible YouTube transcript panel rows into complete cues", () => {
  const cues = core.parseTranscriptDomRows(
    [
      { timestamp: "3:03", text: "behavior of these Bandit algorithms so" },
      { timestamp: "3:06", text: "ah in the last lecture we looked at" },
      { timestamp: "3:08", text: "eventual correctness so today we will" },
      { timestamp: "3:11", text: "start looking at ah you know other" },
      { timestamp: "3:13", text: "Notions of correctness so we started off" },
    ],
    230,
  );

  assert.deepEqual(cues.slice(0, 3), [
    {
      id: "cue-0",
      start: 183,
      end: 185.999,
      duration: 2.999,
      source: "behavior of these Bandit algorithms so",
      translation: "",
      status: "pending",
    },
    {
      id: "cue-1",
      start: 186,
      end: 187.999,
      duration: 1.999,
      source: "ah in the last lecture we looked at",
      translation: "",
      status: "pending",
    },
    {
      id: "cue-2",
      start: 188,
      end: 190.999,
      duration: 2.999,
      source: "eventual correctness so today we will",
      translation: "",
      status: "pending",
    },
  ]);
});

test("ignores merged transcript panel container rows", () => {
  const cues = core.parseTranscriptDomRows(
    [
      {
        timestamp: "0:05",
        rowText:
          "0:055 seconds[music]0:077 secondsMy name is Sitha Raman. I lead the innovation digital transformation practice.0:1616 secondsThis program is not just about pre-training.0:2525 secondsmultiple concepts from KV cache and attention mechanisms.0:3434 secondsmany other possibilities of attention mechanisms.",
        text:
          "[music]0:077 secondsMy name is Sitha Raman. I lead the innovation digital transformation practice.0:1616 secondsThis program is not just about pre-training.0:2525 secondsmultiple concepts from KV cache and attention mechanisms.0:3434 secondsmany other possibilities of attention mechanisms.",
      },
      { timestamp: "0:07", text: "My name is Sitha Raman." },
    ],
    1307,
  );

  assert.equal(cues.length, 1);
  assert.equal(cues[0].source, "My name is Sitha Raman.");
});

test("does not keep a trailing music transcript cue active until video end", () => {
  const cues = core.parseTranscriptDomRows(
    [
      { timestamp: "16:58", text: "now let us look at policy iteration" },
      { timestamp: "17:02", text: "[Music]" },
    ],
    1280,
  );

  assert.equal(cues.at(-1).source, "[Music]");
  assert.equal(cues.at(-1).end, 1027);
  assert.equal(core.findCueAtTime(cues, 1080), null);
  assert.equal(core.isNonSpeechCaptionText("[Music]"), true);
  assert.equal(core.isNonSpeechCaptionText("The music changes the policy."), false);
});

test("content script skips non-speech cues and recovers from incomplete timelines", () => {
  const script = fs.readFileSync(
    path.join(projectRoot, "src", "content_script.js"),
    "utf8",
  );

  assert.match(script, /core\.isNonSpeechCaptionText\(cue\.source\)/);
  assert.match(script, /core\.isNonSpeechCaptionText\(currentText\)/);
  assert.match(script, /switchToFallback\("timeline-gap"\)/);
});

test("retries transcript timeline when fallback can see transcript rows", () => {
  assert.equal(
    core.shouldRetryTranscriptDomTimeline({
      timelineMode: "fallback",
      domRowCount: 491,
      retryInFlight: false,
      lastRetryAt: 1000,
      now: 5000,
      throttleMs: 3000,
    }),
    true,
  );
  assert.equal(
    core.shouldRetryTranscriptDomTimeline({
      timelineMode: "track",
      domRowCount: 491,
      retryInFlight: false,
      lastRetryAt: 1000,
      now: 5000,
      throttleMs: 3000,
    }),
    false,
  );
  assert.equal(
    core.shouldRetryTranscriptDomTimeline({
      timelineMode: "fallback",
      domRowCount: 0,
      retryInFlight: false,
      lastRetryAt: 1000,
      now: 5000,
      throttleMs: 3000,
    }),
    false,
  );
  assert.equal(
    core.shouldRetryTranscriptDomTimeline({
      timelineMode: "fallback",
      domRowCount: 491,
      retryInFlight: true,
      lastRetryAt: 1000,
      now: 5000,
      throttleMs: 3000,
    }),
    false,
  );
});

test("builds and parses batch timeline translations", () => {
  const cues = [
    { id: "cue-0", start: 1, end: 2, source: "hello world" },
    { id: "cue-1", start: 2, end: 3, source: "Q value" },
  ];
  const prompt = core.buildBatchTranslationPrompt({
    cues,
    metadata: { title: "RL lecture" },
    customInstructions: "保留 Q value",
  });

  assert.match(prompt, /cue-0/);
  assert.match(prompt, /RL lecture/);
  assert.match(prompt, /Return only JSON/);
  assert.deepEqual(
    core.parseBatchTranslationResponse('{"translations":[{"id":"cue-0","translation":"你好世界"},{"id":"cue-1","translation":"、Q 值"}]}'),
    { "cue-0": "你好世界", "cue-1": "Q 值" },
  );
});

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

test("requires summary chapters to cover the full video timeline", () => {
  const cues = Array.from({ length: 720 }, (_item, index) => ({
    id: `cue-${index}`,
    start: index * 5,
    end: index * 5 + 4,
    source: `minute ${Math.floor((index * 5) / 60)} topic ${Math.floor(index / 12)}`,
  }));

  const prompt = core.buildVideoSummaryPrompt({
    cues,
    metadata: { title: "One hour lecture" },
  });

  assert.match(prompt, /Timestamp range: 00:00-59:59/);
  assert.match(prompt, /cover the entire timestamp range/i);
  assert.match(prompt, /include a final chapter near 59:59/i);
  assert.match(prompt, /Do not stop chapters after the opening or first third/i);
});

test("builds required chapter anchors across long videos", () => {
  const cues = Array.from({ length: 720 }, (_item, index) => ({
    id: `cue-${index}`,
    start: index * 5,
    end: index * 5 + 4,
    source: `minute ${Math.floor((index * 5) / 60)} topic ${Math.floor(index / 12)}`,
  }));

  const prompt = core.buildVideoSummaryPrompt({
    cues,
    metadata: { title: "One hour lecture" },
  });

  assert.match(prompt, /Required chapter anchors:/);
  assert.match(prompt, /Return exactly one chapter for each anchor/i);
  assert.match(prompt, /0 seconds \(00:00\)/);
  assert.match(prompt, /1080 seconds \(18:00\)/);
  assert.match(prompt, /2160 seconds \(36:00\)/);
  assert.match(prompt, /3240 seconds \(54:00\)/);
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
      '{"summary":"原始 JSON 摘要","highlights":["原始亮点"],"chapters":[{"start":12,"title":"原始章节","points":["原始要点"]}]}',
    ),
    {
      summary: "原始 JSON 摘要",
      highlights: ["原始亮点"],
      chapters: [
        { start: 12, title: "原始章节", points: ["原始要点"] },
      ],
    },
  );

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

test("background batch translation routes through semantic segments", () => {
  const script = fs.readFileSync(
    path.join(projectRoot, "src", "background.js"),
    "utf8",
  );

  assert.match(script, /core\.buildTranslationSegmentsFromCues/);
  assert.match(script, /core\.buildSegmentTranslationPrompt/);
  assert.match(script, /core\.parseSegmentTranslationResponse/);
  assert.match(script, /segmentTranslations/);
  assert.match(script, /captionKind:\s*payload\.captionKind/);
});

test("content script passes caption kind into batch translation", () => {
  const script = fs.readFileSync(
    path.join(projectRoot, "src", "content_script.js"),
    "utf8",
  );

  assert.match(script, /captionKind/);
  assert.match(script, /track\?\.kind === "asr"/);
  assert.match(script, /captionKind:\s*state\.captionKind/);
});

test("content script supports source display and sync strategies", () => {
  const script = fs.readFileSync(
    path.join(projectRoot, "src", "content_script.js"),
    "utf8",
  );

  assert.match(script, /segmentTranslations/);
  assert.match(script, /function displaySourceForCue/);
  assert.match(script, /sourceDisplayMode/);
  assert.match(script, /syncStrategy/);
  assert.match(script, /完整句/);
});

test("background exposes video memory analysis pipeline", () => {
  const script = fs.readFileSync(
    path.join(projectRoot, "src", "background.js"),
    "utf8",
  );

  assert.match(script, /YTCT_ANALYZE_VIDEO_MEMORY/);
  assert.match(script, /core\.buildVideoMemoryChunks/);
  assert.match(script, /core\.buildVideoMemoryPrompt/);
  assert.match(script, /core\.buildVideoMemoryReducePrompt/);
  assert.match(script, /core\.parseVideoMemoryResponse/);
  assert.match(script, /core\.mergeVideoMemoryItems/);
});

test("background persists video memory and updates channel memory", () => {
  const script = fs.readFileSync(
    path.join(projectRoot, "src", "background.js"),
    "utf8",
  );

  assert.match(script, /VIDEO_MEMORY_CACHE_KEY/);
  assert.match(script, /function videoMemoryCacheKey/);
  assert.match(script, /async function readVideoMemoryCache/);
  assert.match(script, /async function writeVideoMemoryCache/);
  assert.match(script, /channelMemories/);
});

test("background uses user glossary, consistency pass, and versioned cache keys", () => {
  const script = fs.readFileSync(
    path.join(projectRoot, "src", "background.js"),
    "utf8",
  );

  assert.match(script, /core\.parseUserGlossary\(settings\.userGlossary\)/);
  assert.match(script, /core\.createGlossaryVersion/);
  assert.match(script, /promptVersion/);
  assert.match(script, /segmentId/);
  assert.match(script, /sourceClean/);
  assert.match(script, /core\.applyGlossaryConsistency/);
});

test("content script requests video memory and sends it with batches", () => {
  const script = fs.readFileSync(
    path.join(projectRoot, "src", "content_script.js"),
    "utf8",
  );

  assert.match(script, /videoMemory/);
  assert.match(script, /function requestVideoMemoryAnalysis/);
  assert.match(script, /YTCT_ANALYZE_VIDEO_MEMORY/);
  assert.match(script, /videoMemory:\s*state\.videoMemory/);
});

test("content metadata includes description, playlist, and chapters", () => {
  const script = fs.readFileSync(
    path.join(projectRoot, "src", "content_script.js"),
    "utf8",
  );

  assert.match(script, /description/);
  assert.match(script, /playlist/);
  assert.match(script, /chapters/);
  assert.match(script, /expandMetadataDescription/);
});

test("options page exposes user glossary settings", () => {
  const html = fs.readFileSync(
    path.join(projectRoot, "src", "options.html"),
    "utf8",
  );
  const script = fs.readFileSync(
    path.join(projectRoot, "src", "options.js"),
    "utf8",
  );

  assert.match(html, /id="userGlossary"/);
  assert.match(script, /userGlossary:\s*document\.querySelector\("#userGlossary"\)/);
  assert.match(script, /form\.userGlossary\.value = settings\.userGlossary/);
  assert.match(script, /userGlossary:\s*form\.userGlossary\.value/);
});

test("options page exposes source display and sync strategy settings", () => {
  const html = fs.readFileSync(
    path.join(projectRoot, "src", "options.html"),
    "utf8",
  );
  const script = fs.readFileSync(
    path.join(projectRoot, "src", "options.js"),
    "utf8",
  );

  assert.match(html, /id="sourceDisplayMode"/);
  assert.match(html, /id="syncStrategy"/);
  assert.match(script, /sourceDisplayMode:\s*document\.querySelector\("#sourceDisplayMode"\)/);
  assert.match(script, /syncStrategy:\s*document\.querySelector\("#syncStrategy"\)/);
  assert.match(script, /sourceDisplayMode:\s*form\.sourceDisplayMode\.value/);
  assert.match(script, /syncStrategy:\s*form\.syncStrategy\.value/);
});

test("builds and parses web page translation prompts", () => {
  const prompt = core.buildWebPageTranslationPrompt({
    blocks: [
      {
        id: "web-block-0",
        tagName: "h1",
        text: "Gradient Handoff",
        headingPath: ["Gradient Handoff"],
      },
      {
        id: "web-block-1",
        tagName: "p",
        text: "When you cannot write the rule, describe the goal and let the gradient find it.",
        headingPath: ["Gradient Handoff"],
      },
    ],
    pageContext: {
      title: "Gradient Handoff",
      url: "https://example.com/article",
      language: "en",
    },
    nonOutputContextBefore: [
      { id: "before-0", text: "A note about intelligence.", tagName: "p" },
    ],
    nonOutputContextAfter: [
      { id: "after-0", text: "Vision, language, and reasoning examples follow.", tagName: "p" },
    ],
    pageMemory: {
      glossary: [{ source: "gradient descent", translation: "梯度下降" }],
    },
    userGlossary: [{ source: "gradient", target: "梯度", locked: true }],
    customInstructions: "保持技术术语一致。",
    targetLanguage: "zh-CN",
  });

  assert.match(prompt, /translate ordinary web page text/i);
  assert.match(prompt, /preserve the original DOM structure/i);
  assert.match(prompt, /output_blocks/);
  assert.match(prompt, /non_output_context_before/);
  assert.match(prompt, /non_output_context_after/);
  assert.match(prompt, /Gradient Handoff/);
  assert.match(prompt, /gradient descent/);
  assert.match(prompt, /保持技术术语一致/);

  assert.deepEqual(
    core.parseWebPageTranslationResponse(`{
      "translations": [
        {"id": "web-block-0", "translation": "梯度传递"},
        {"id": "web-block-1", "translation": "当你写不出规则时，就描述目标，让梯度找到它。"}
      ],
      "glossary": [{"source": "gradient descent", "translation": "梯度下降"}]
    }`),
    {
      translations: {
        "web-block-0": "梯度传递",
        "web-block-1": "当你写不出规则时，就描述目标，让梯度找到它。",
      },
      glossary: [{ source: "gradient descent", translation: "梯度下降" }],
    },
  );
});

test("builds and parses web page memory prompts", () => {
  const prompt = core.buildWebPageMemoryPrompt({
    pageContext: {
      title: "Gradient Handoff",
      url: "https://example.com/gradient-handoff",
      language: "en",
    },
    blocks: [
      {
        id: "web-block-0",
        tagName: "h1",
        text: "Gradient Handoff",
        headingPath: ["Gradient Handoff"],
      },
      {
        id: "web-block-1",
        tagName: "p",
        text: "A deep visual walk from a virus to attention inside Claude.",
        headingPath: ["Gradient Handoff"],
      },
    ],
    userGlossary: [{ source: "attention", target: "attention", locked: true }],
    customInstructions: "AI 术语保持一致。",
  });

  assert.match(prompt, /WebMemory map step/i);
  assert.match(prompt, /stable facts that help translate this web page/i);
  assert.match(prompt, /Gradient Handoff/);
  assert.match(prompt, /user_glossary/);
  assert.match(prompt, /AI 术语保持一致/);

  assert.deepEqual(
    core.parseWebMemoryResponse(`{
      "summary": "An AI mental-model article about gradient handoff.",
      "domain": "AI education",
      "styleGuide": "Use concise explanatory Chinese.",
      "glossary": [{"source": "gradient handoff", "translation": "梯度移交"}],
      "entities": ["Claude"]
    }`),
    {
      summary: "An AI mental-model article about gradient handoff.",
      domain: "AI education",
      styleGuide: "Use concise explanatory Chinese.",
      glossary: [{ source: "gradient handoff", translation: "梯度移交" }],
      entities: ["Claude"],
    },
  );
});

test("uses section context in web page translation prompts", () => {
  const prompt = core.buildWebPageTranslationPrompt({
    blocks: [
      {
        id: "web-block-1",
        tagName: "p",
        text: "Policy iteration alternates evaluation and improvement.",
        headingPath: ["Dynamic Programming", "Policy Iteration"],
      },
    ],
    pageMemory: {
      summary: "A reinforcement learning lecture note.",
      domain: "reinforcement learning",
      styleGuide: "Keep equations and RL terms concise.",
      glossary: [{ source: "policy iteration", translation: "policy iteration（策略迭代）" }],
      entities: ["Bellman equation"],
    },
  });

  assert.match(prompt, /Translate each output block as part of its surrounding section/i);
  assert.match(prompt, /styleGuide/);
  assert.match(prompt, /reinforcement learning/);
  assert.match(prompt, /Policy Iteration/);
});

test("protects inline code links and formulas in web page prompts", () => {
  const prompt = core.buildWebPageTranslationPrompt({
    blocks: [
      {
        id: "web-block-1",
        tagName: "p",
        text: "The update uses Q(s,a) and links to the Bellman proof.",
        headingPath: ["Dynamic Programming"],
        protectedTerms: [
          { text: "Q(s,a)", kind: "code" },
          { text: "argmax_a Q(s,a)", kind: "math" },
          { text: "https://example.com/bellman", kind: "link" },
        ],
      },
    ],
  });

  assert.match(prompt, /protected_terms/);
  assert.match(prompt, /Do not translate, rewrite, or drop protected_terms/i);
  assert.match(prompt, /Q\(s,a\)/);
  assert.match(prompt, /argmax_a Q\(s,a\)/);
  assert.match(prompt, /https:\/\/example\.com\/bellman/);
});

test("validates web page translations for missing and copied outputs", () => {
  const validation = core.validateWebPageTranslationResult({
    blocks: [
      {
        id: "web-block-0",
        text: "Gradient handoff starts here.",
        protectedTerms: [{ text: "Q(s,a)", kind: "code" }],
      },
      { id: "web-block-1", text: "Attention routes context." },
      { id: "web-block-2", text: "The policy changes." },
    ],
    translations: {
      "web-block-0": "梯度移交从这里开始。",
      "web-block-1": "Attention routes context.",
    },
  });

  assert.equal(validation.ok, false);
  assert.deepEqual(validation.retryIds, ["web-block-0", "web-block-1", "web-block-2"]);
  assert.deepEqual(validation.validTranslations, {});
  assert.match(validation.reason, /missing-protected/);
  assert.match(validation.reason, /copied-source/);
  assert.match(validation.reason, /missing/);
});

test("builds focused repair prompts for failed web page translation blocks", () => {
  const prompt = core.buildWebPageRepairPrompt({
    blocks: [
      {
        id: "web-block-2",
        text: "The policy changes according to Q(s,a).",
        tagName: "p",
        protectedTerms: [{ text: "Q(s,a)", kind: "code" }],
      },
    ],
    pageContext: { title: "Policy Iteration" },
    pageMemory: { glossary: [{ source: "policy", translation: "policy" }] },
    reason: "missing",
  });

  assert.match(prompt, /Repair missing or invalid web page translations/i);
  assert.match(prompt, /web-block-2/);
  assert.match(prompt, /The policy changes/);
  assert.match(prompt, /protected_terms/);
  assert.match(prompt, /Q\(s,a\)/);
  assert.match(prompt, /policy/);
  assert.match(prompt, /Return only JSON/);
});

test("parses and matches web page translation site rules", () => {
  const rules = core.parseWebTranslationSiteRules(JSON.stringify([
    {
      name: "Docs",
      matches: ["docs.example.com", "*.papers.example.org"],
      rootSelector: "article, main",
      blockSelector: ".content p, .content h2",
      includeSelectors: [".content p"],
      excludeSelectors: [".ad", ".newsletter"],
      minTextLength: 12,
      minWords: 2,
    },
  ]));

  assert.equal(rules.length, 1);
  assert.equal(rules[0].name, "Docs");
  assert.deepEqual(rules[0].includeSelectors, [".content p"]);
  assert.equal(
    core.matchWebTranslationSiteRule("https://docs.example.com/page", rules)?.name,
    "Docs",
  );
  assert.equal(
    core.matchWebTranslationSiteRule("https://intro.papers.example.org/a", rules)?.name,
    "Docs",
  );
  assert.equal(core.matchWebTranslationSiteRule("https://example.com", rules), null);
  assert.deepEqual(core.parseWebTranslationSiteRules("{bad json"), []);
});

test("creates stable web page translation cache keys", () => {
  const first = core.createWebPageTranslationCacheKey({
    provider: "gemini",
    model: "gemini-2.5-flash-lite",
    pageUrl: "https://example.com/article?utm_source=test#section",
    sourceLanguage: "en",
    targetLanguage: "zh-CN",
    promptVersion: core.WEB_TRANSLATION_PROMPT_VERSION,
    glossaryVersion: "abc",
    sourceText: "Gradient   descent finds it.",
    headingPath: ["Gradient Handoff"],
  });
  const second = core.createWebPageTranslationCacheKey({
    provider: "gemini",
    model: "gemini-2.5-flash-lite",
    pageUrl: "https://example.com/article",
    sourceLanguage: "en",
    targetLanguage: "zh-CN",
    promptVersion: core.WEB_TRANSLATION_PROMPT_VERSION,
    glossaryVersion: "abc",
    sourceText: "Gradient descent finds it.",
    headingPath: ["Gradient Handoff"],
  });
  const changed = core.createWebPageTranslationCacheKey({
    provider: "gemini",
    model: "gemini-2.5-flash-lite",
    pageUrl: "https://example.com/article",
    sourceLanguage: "en",
    targetLanguage: "zh-CN",
    promptVersion: core.WEB_TRANSLATION_PROMPT_VERSION,
    glossaryVersion: "abc",
    sourceText: "Attention learned it.",
    headingPath: ["Gradient Handoff"],
  });

  assert.equal(first, second);
  assert.notEqual(first, changed);
});

test("sorts web page blocks by visual reading order", () => {
  const blocks = core.sortWebPageBlocksByPosition([
    { id: "body-first", top: 200, left: 120, order: 1 },
    { id: "right-heading", top: 100, left: 640, order: 2 },
    { id: "left-heading", top: 104, left: 40, order: 3 },
    { id: "next-section", top: 480, left: 40, order: 4 },
  ]);

  assert.deepEqual(
    blocks.map((block) => block.id),
    ["left-heading", "right-heading", "body-first", "next-section"],
  );
});

test("web page translator includes content hero headers without translating scroll cues", () => {
  const translator = fs.readFileSync(
    path.join(projectRoot, "src", "web_page_translator.js"),
    "utf8",
  );
  const skipSelectorSource = translator.match(
    /const SKIP_SELECTOR = \[([\s\S]*?)\]\.join/,
  )?.[1];

  assert.ok(skipSelectorSource);
  assert.doesNotMatch(skipSelectorSource, /"header"/);
  assert.match(translator, /"\.kicker"/);
  assert.match(translator, /"\.sub"/);
  assert.doesNotMatch(translator, /"\.scrollcue"/);
  assert.match(translator, /function isNavigationHeader\(/);
  assert.match(translator, /function isInsideSkippedRegion\(/);
  assert.match(translator, /element\.closest\("header"\)/);
  assert.match(translator, /core\.isProbablyCodeText\(text\)/);
});

test("web page translator matches translation typography to the source block", () => {
  const translator = fs.readFileSync(
    path.join(projectRoot, "src", "web_page_translator.js"),
    "utf8",
  );
  const translatorCss = fs.readFileSync(
    path.join(projectRoot, "src", "web_page_translator.css"),
    "utf8",
  );
  const translationRule = translatorCss.match(
    /\.ytct-web-translation\s*\{([^}]*)\}/,
  )?.[1] || "";
  const translationModeRule = translatorCss.match(
    /\.ytct-web-translation\[data-mode="translation"\]\s*\{([^}]*)\}/,
  )?.[1] || "";

  assert.match(translationRule, /font:\s*inherit/);
  assert.match(translationRule, /font-size:\s*inherit/);
  assert.match(translationRule, /color:\s*inherit/);
  assert.doesNotMatch(translationRule, /font-size:\s*0\.96em/);
  assert.doesNotMatch(translationRule, /color:\s*#[0-9a-f]/i);
  assert.doesNotMatch(translationModeRule, /color:/i);
  assert.match(translator, /function syncTranslationTypography\(/);
  assert.match(translator, /window\.getComputedStyle\(sourceElement\)/);
  assert.match(translator, /"color"/);
  assert.match(translator, /"fontFamily"/);
  assert.match(translator, /"fontSize"/);
  assert.match(translator, /"fontWeight"/);
  assert.match(translator, /syncTranslationTypography\(element, block\.element\)/);
});

test("web page translator supports translation-only mode without leaving source hidden after cleanup", () => {
  const translator = fs.readFileSync(
    path.join(projectRoot, "src", "web_page_translator.js"),
    "utf8",
  );
  const translatorCss = fs.readFileSync(
    path.join(projectRoot, "src", "web_page_translator.css"),
    "utf8",
  );

  assert.match(translator, /const SOURCE_HIDDEN_CLASS = "ytct-web-source-hidden"/);
  assert.match(translator, /function restoreSourceElement\(block\)/);
  assert.match(translator, /function applySourceDisplayMode\(block\)/);
  assert.match(translator, /webTranslationDisplayMode === "translation"/);
  assert.match(translator, /block\.element\.classList\.add\(SOURCE_HIDDEN_CLASS\)/);
  assert.match(translator, /block\.element\.classList\.remove\(SOURCE_HIDDEN_CLASS\)/);
  assert.match(translator, /document\.querySelectorAll\(`\.\$\{SOURCE_HIDDEN_CLASS\}`\)/);
  assert.match(translatorCss, /\.ytct-web-source-hidden\s*\{/);
  assert.match(translatorCss, /font-size:\s*0\s*!important/);
  assert.match(translatorCss, /color:\s*transparent\s*!important/);
});

test("web page translator reports progress and failed web page blocks", () => {
  const translator = fs.readFileSync(
    path.join(projectRoot, "src", "web_page_translator.js"),
    "utf8",
  );

  assert.match(translator, /function translationProgress\(/);
  assert.match(translator, /block\.status = "failed"/);
  assert.match(translator, /网页翻译已更新：\$\{progress\.ready\}\/\$\{progress\.total\} 段/);
  assert.match(translator, /段未返回译文/);
});

test("web page translator keeps queued dynamic blocks in visual order", () => {
  const translator = fs.readFileSync(
    path.join(projectRoot, "src", "web_page_translator.js"),
    "utf8",
  );

  assert.match(translator, /function orderedBlockIndex\(block\)/);
  assert.match(translator, /function insertQueuedBlock\(block\)/);
  assert.doesNotMatch(translator, /state\.queue\.push\(block\)/);
  assert.match(translator, /state\.queue\.splice\(insertIndex, 0, block\)/);
});

test("web page translator resets stale translations when source block text changes", () => {
  const translator = fs.readFileSync(
    path.join(projectRoot, "src", "web_page_translator.js"),
    "utf8",
  );

  assert.match(translator, /function resetBlockIfSourceChanged\(/);
  assert.match(translator, /previousText && previousText !== nextText/);
  assert.match(translator, /block\.translationElement\.remove\(\)/);
  assert.match(translator, /block\.status = "pending"/);
});

test("web page translator ignores its own DOM mutations during injection and cleanup", () => {
  const translator = fs.readFileSync(
    path.join(projectRoot, "src", "web_page_translator.js"),
    "utf8",
  );

  assert.match(translator, /function isOwnTranslationNode\(/);
  assert.match(translator, /function isOwnMutation\(mutation\)/);
  assert.match(translator, /Array\.from\(mutation\.addedNodes \|\| \[\]\)/);
  assert.match(translator, /Array\.from\(mutation\.removedNodes \|\| \[\]\)/);
  assert.match(translator, /mutation\.attributeName === "class"/);
  assert.match(translator, /classList\?\.contains\(SOURCE_HIDDEN_CLASS\)/);
  assert.match(translator, /mutation\.oldValue\?\.includes\(SOURCE_HIDDEN_CLASS\)/);
  assert.match(translator, /attributeOldValue:\s*true/);
  assert.match(translator, /mutations\.every\(isOwnMutation\)/);
});

test("web page translation supports YouTube watch descriptions and comments", () => {
  const background = fs.readFileSync(
    path.join(projectRoot, "src", "background.js"),
    "utf8",
  );
  const translator = fs.readFileSync(
    path.join(projectRoot, "src", "web_page_translator.js"),
    "utf8",
  );

  assert.match(background, /function isYouTubeWatchUrl\(/);
  assert.match(background, /isYouTubeWatchUrl\(url\)/);
  assert.doesNotMatch(background, /return !\/\\\.\?youtube\\\.com\$\/i\.test\(url\.hostname\)/);
  assert.match(translator, /const YOUTUBE_ROOT_SELECTOR/);
  assert.match(translator, /"ytd-watch-metadata"/);
  assert.match(translator, /"ytd-comments"/);
  assert.match(translator, /const YOUTUBE_BLOCK_SELECTOR/);
  assert.match(translator, /"#description-inline-expander #snippet-text"/);
  assert.match(translator, /"#description-inline-expander\[is-expanded\] #expanded yt-attributed-string"/);
  assert.match(translator, /"ytd-expandable-video-description-body-renderer ytd-text-inline-expander#inline-expander"/);
  assert.match(translator, /"ytd-comment-thread-renderer #content-text"/);
  assert.match(translator, /function isYouTubeWatchPage\(/);
  assert.match(translator, /function isYouTubeTextBlock\(/);
  assert.match(translator, /function isYouTubeDescriptionBlock\(/);
  assert.match(translator, /function collectYouTubeDescriptionBlocks\(/);
  assert.match(translator, /core\.splitWebPageTextSegments/);
  assert.match(translator, /segmentIndex/);
  assert.match(translator, /data-ytct-web-segment-index/);
  assert.match(translator, /if \(isYouTubeWatchPage\(\)\)/);
  assert.match(translator, /attributes:\s*true/);
  assert.match(translator, /attributeFilter:\s*\["class", "hidden", "is-expanded", "style"\]/);
});

test("web page translator replaces stale injected instances after extension reload", () => {
  const translator = fs.readFileSync(
    path.join(projectRoot, "src", "web_page_translator.js"),
    "utf8",
  );

  assert.doesNotMatch(translator, /if \(window\.__YTCT_WEB_PAGE_TRANSLATOR__\) \{\s*return;\s*\}/);
  assert.match(translator, /const previousController = window\.__YTCT_WEB_PAGE_TRANSLATOR__/);
  assert.match(translator, /previousController\.stop\("replaced"\)/);
  assert.match(translator, /const YTCT_WEB_INSTANCE_ID = `ytct-web-/);
  assert.match(translator, /function handleRuntimeMessage\(/);
  assert.match(translator, /chrome\.runtime\.onMessage\.removeListener\(handleRuntimeMessage\)/);
  assert.match(translator, /window\.__YTCT_WEB_PAGE_TRANSLATOR__ = \{/);
  assert.match(translator, /instanceId: YTCT_WEB_INSTANCE_ID/);
  assert.match(translator, /stop/);
});

test("wires web page translation 3.0 through manifest, background, popup, and options", () => {
  const manifest = JSON.parse(
    fs.readFileSync(path.join(projectRoot, "manifest.json"), "utf8"),
  );
  const background = fs.readFileSync(
    path.join(projectRoot, "src", "background.js"),
    "utf8",
  );
  const popupHtml = fs.readFileSync(
    path.join(projectRoot, "src", "popup.html"),
    "utf8",
  );
  const popupScript = fs.readFileSync(
    path.join(projectRoot, "src", "popup.js"),
    "utf8",
  );
  const optionsHtml = fs.readFileSync(
    path.join(projectRoot, "src", "options.html"),
    "utf8",
  );
  const optionsScript = fs.readFileSync(
    path.join(projectRoot, "src", "options.js"),
    "utf8",
  );
  const translator = fs.readFileSync(
    path.join(projectRoot, "src", "web_page_translator.js"),
    "utf8",
  );
  const translatorCss = fs.readFileSync(
    path.join(projectRoot, "src", "web_page_translator.css"),
    "utf8",
  );

  assert.equal(manifest.version, "3.0.0");
  assert.ok(manifest.permissions.includes("activeTab"));
  assert.ok(manifest.permissions.includes("scripting"));
  assert.match(background, /YTCT_TRANSLATE_WEB_PAGE_BATCH/);
  assert.match(background, /YTCT_START_WEB_PAGE_TRANSLATION/);
  assert.match(background, /chrome\.scripting\.executeScript/);
  assert.match(background, /src\/web_page_translator\.js/);
  assert.match(popupHtml, /id="translatePage"/);
  assert.match(popupHtml, /id="clearPageTranslations"/);
  assert.match(popupHtml, /id="popupWebTranslationTargetLanguage"/);
  assert.match(popupHtml, /id="popupWebTranslationDisplayMode"/);
  assert.match(popupHtml, /id="popupWebTranslationScope"/);
  assert.match(popupScript, /YTCT_START_WEB_PAGE_TRANSLATION/);
  assert.match(popupScript, /YTCT_CLEAR_WEB_PAGE_TRANSLATION/);
  assert.match(popupScript, /function webTranslationSettingsFromPopup\(/);
  assert.match(popupScript, /webTranslationTargetLanguage/);
  assert.match(popupScript, /webTranslationDisplayMode/);
  assert.match(popupScript, /webTranslationScope/);
  assert.match(optionsHtml, /id="webTranslationEnabled"/);
  assert.match(optionsHtml, /id="webTranslationTargetLanguage"/);
  assert.match(optionsHtml, /id="webTranslationDisplayMode"/);
  assert.match(optionsHtml, /id="webTranslationScope"/);
  assert.match(optionsHtml, /id="webTranslationSiteRules"/);
  assert.match(optionsScript, /webTranslationEnabled/);
  assert.match(optionsScript, /webTranslationSiteRules/);
  assert.match(translator, /IntersectionObserver/);
  assert.match(translator, /MutationObserver/);
  assert.match(translator, /function scanRoots\(\)/);
  assert.match(translator, /function currentSiteRule\(\)/);
  assert.match(translator, /YTCT_ANALYZE_WEB_PAGE_MEMORY/);
  assert.match(translator, /function takeNextSectionBatch\(/);
  assert.match(translator, /function protectedTermsForElement\(/);
  assert.match(translator, /"a\[href\],code,kbd,samp,var,math,\[role='math'\],\.katex,\.MathJax"/);
  assert.match(translator, /protectedTerms:\s*block\.protectedTerms/);
  assert.match(translator, /querySelectorAll\("article"\)/);
  assert.doesNotMatch(translator, /document\.querySelector\("article"\) \|\|/);
  assert.match(translator, /core\.sortWebPageBlocksByPosition/);
  assert.match(translator, /YTCT_TRANSLATE_WEB_PAGE_BATCH/);
  assert.match(translator, /data-ytct-web-translation/);
  assert.match(translator, /firstIndex < 0 \|\| lastIndex < 0/);
  assert.match(background, /YTCT_ANALYZE_WEB_PAGE_MEMORY/);
  assert.match(background, /core\.buildWebPageRepairPrompt/);
  assert.match(background, /core\.validateWebPageTranslationResult/);
  assert.match(translatorCss, /\.ytct-web-translation/);
});
