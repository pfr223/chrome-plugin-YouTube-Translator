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
  assert.match(prompt, /保留 policy/);
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

test("background batch translation routes through semantic segments", () => {
  const script = fs.readFileSync(
    path.join(projectRoot, "src", "background.js"),
    "utf8",
  );

  assert.match(script, /core\.buildTranslationSegmentsFromCues/);
  assert.match(script, /core\.buildSegmentTranslationPrompt/);
  assert.match(script, /core\.parseSegmentTranslationResponse/);
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

test("background exposes video memory analysis pipeline", () => {
  const script = fs.readFileSync(
    path.join(projectRoot, "src", "background.js"),
    "utf8",
  );

  assert.match(script, /YTCT_ANALYZE_VIDEO_MEMORY/);
  assert.match(script, /core\.buildVideoMemoryChunks/);
  assert.match(script, /core\.buildVideoMemoryPrompt/);
  assert.match(script, /core\.parseVideoMemoryResponse/);
  assert.match(script, /core\.mergeVideoMemoryItems/);
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
