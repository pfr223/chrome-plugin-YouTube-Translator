# YouTube Context Translator

Chrome MV3 插件：读取 YouTube 英文字幕时间轴，先做全文预分析和语义分段，再把完整句翻译回填到原始 cue 时间轴，生成同步中文字幕覆盖层。

## API 选择

默认推荐 `OpenRouter` 或 `Gemini`。如果你已经有 OpenRouter key，建议先用 `OpenRouter` + `google/gemini-2.5-flash-lite`，因为 OpenRouter 使用 OpenAI 兼容的 Chat Completions 接口，切换模型更方便，也可以使用它的路由和 response-healing 插件。直接调用 Gemini 时默认模型为 `gemini-2.5-flash-lite`，这是 Google 官方模型页列出的低延迟、低成本 2.5 Flash-Lite 文本模型。

`DeepSeek` 默认使用 `deepseek-v4-flash`。官方文档显示它支持 1M 上下文、JSON 输出和非常低的 token 价格；本插件会关闭 thinking mode 来降低字幕翻译延迟。适合成本敏感场景，但实时稳定性和跨境网络表现需要你本机实测。

参考：

- [Gemini API pricing](https://ai.google.dev/gemini-api/docs/pricing)
- [Gemini API quickstart](https://ai.google.dev/gemini-api/docs/quickstart)
- [Gemini models](https://ai.google.dev/gemini-api/docs/models)
- [OpenRouter chat completion](https://openrouter.ai/docs/api-reference/chat-completion)
- [OpenRouter API overview](https://openrouter.ai/docs/api/reference/overview/)
- [DeepSeek models and pricing](https://api-docs.deepseek.com/quick_start/pricing)
- [DeepSeek chat completion](https://api-docs.deepseek.com/api/create-chat-completion)

## 本地安装

1. 打开 Chrome：`chrome://extensions/`
2. 开启右上角「开发者模式」
3. 点击「加载已解压的扩展程序」
4. 选择本目录：`/Users/peiduo/Documents/chrome_chajian_youtubetranslate`
5. 点击扩展图标，选择 API，并填写 API key
6. 打开 YouTube 视频并开启英文字幕

如果要测试翻译管线增强版本，先切到 feature 分支：

```bash
git fetch origin
git switch codex/translation-pipeline-v2
git pull --ff-only
```

## 工作方式

- `src/content_script.js` 优先读取 YouTube Transcript 时间轴，按完整 cue 同步显示双语字幕；必要时才回退到播放器字幕 DOM。
- `src/background.js` 持有 Gemini、DeepSeek、OpenRouter 各自的 API key 并发起请求，避免把 key 暴露给网页脚本。
- `src/core.js` 构造带上下文的翻译 prompt，并解析 JSON 或纯文本响应。
- 页面内「视频总结」面板会复用完整字幕时间轴，用户手动点击后生成当前视频的中文摘要、亮点和可跳转章节要点。
- 最近字幕原文和译文会进入上下文窗口，用来修正代词、术语、短句省略和技术词。
- 翻译单位从单个 cue 升级为 `Cue -> Segment -> Translation -> CueTranslation`：短 cue 会先合并成完整语义段，模型按完整句理解，再输出 cue 级译文，原始 YouTube 时间戳不变。
- 每个 cue 保留 `sourceRaw`，并生成用于翻译的 `sourceClean`。ASR 字幕会做更强的填充词清理、技术术语修正和轻量标点恢复；人工字幕只做轻量规范。
- 视频打开后会异步构建 `VideoMemory`：按字幕 chunk 做 map 分析，再 reduce 成 summary、domain、styleGuide、glossary、entities、asrCorrections。后续 batch 翻译会携带压缩后的全局记忆和局部前后文。
- VideoMemory 会写入本机 Chrome storage，并维护频道级记忆，避免同一视频重复做全文预分析。
- batch prompt 包含 `non_output_context_before`、`output_segments`、`non_output_context_after`、`videoMemory` 和用户词表；模型只输出 `output_segments` 的翻译。

## 常用设置

- `API`: OpenRouter、Gemini 或 DeepSeek，三者在设置页中各有独立配置页和独立 API key。
- `Gemini 模型`: 默认 `gemini-2.5-flash-lite`。
- `DeepSeek 模型`: 默认 `deepseek-v4-flash`。
- `OpenRouter 模型`: 默认 `google/gemini-2.5-flash-lite`，也可填你账户可用的其他 OpenRouter model id。
- `上下文字幕条数`: 默认 8，范围 0-20。越大越准，但延迟和成本越高。
- `翻译偏好`: 可写课程领域词表或风格要求，例如「保留 reinforcement learning / bandit / Q value」。
- `用户词表`: 每行一条锁定术语，优先级最高，高于频道/视频记忆和模型默认翻译。支持 `policy = policy`、`regret -> regret`、`bandit: bandit（多臂赌博机）` 这类写法。
- `同步策略`:
  - `A`: 完整句翻译后拆回 cue，默认推荐，时间轴最稳定。
  - `B`: 整句翻译在 segment 时间内显示，更自然但可能提前显示后半句。
  - `C`: 当前 cue 译文 + 完整句，适合学习场景但信息量更大。
- `原文显示`: 可选择显示原始 YouTube 字幕，或显示清洗后的 `sourceClean`。
- `字幕显示`: 字幕框宽度固定为视频窗口宽度的 2/3；可调整背景透明度和字体大小；字幕框也可以在 YouTube 页面内直接拖动，位置会保存到本机。
- 默认提示词面向 ML/AI/RL 课程学习优化，会稳定处理 RL、MDP、PAC、UCB、TD、SARSA、Q value、epsilon-greedy、softmax 等术语，并尽量修正明确的 ASR 误识别。

用户词表示例：

```text
policy = policy
regret = regret
bandit = bandit（多臂赌博机）
Q value = Q value
Bellman equation = Bellman equation（贝尔曼方程）
```

## 缓存与版本控制

- 翻译缓存 key 包含 provider、model、videoId、source/target language、promptVersion、glossaryVersion、segmentId 和 sourceClean hash，避免 prompt 或词表变化后复用旧译文。
- 开发翻译管线前已创建远端备份分支：`backup/pre-translation-pipeline-2026-06-09`，指向基线 `7e570f0`。
- 翻译管线增强开发分支：`codex/translation-pipeline-v2`。

## 开发

```bash
npm test
node --check src/core.js && node --check src/background.js && node --check src/content_script.js && node --check src/popup.js && node --check src/options.js
```

## 限制

- 插件只翻译 YouTube 已显示的字幕，不做音频识别。
- YouTube 页面结构变化可能影响字幕抓取选择器。
- API key 保存在本机 Chrome storage；不要在共享电脑上保存个人 key。
- 视频总结需要完整字幕时间轴；如果 YouTube 只暴露当前可见字幕而无法加载完整 transcript，插件不会调用 API 生成摘要。
