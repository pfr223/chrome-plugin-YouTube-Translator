# YouTube Context Translator

Chrome MV3 插件：读取 YouTube 英文字幕时间轴，先做全文预分析和语义分段，再把完整句翻译回填到原始 cue 时间轴，生成同步中文字幕覆盖层；同时支持基于当前视频完整字幕的一键中文摘要。3.0 起支持普通网页翻译：保留网页原始结构，在正文块下方插入对照译文。

## 新版本功能概览

- **3.0 网页翻译**：在普通网页中手动点击扩展 popup 的「翻译当前网页」，插件会识别正文段落、标题、列表和表格文本，并在原文下方插入中文对照译文。
- **3.1 网页翻译质量底座**：网页翻译启动时会先生成 `WebMemory`，提取页面主题、领域、风格、实体和术语表；后续批量翻译会按章节上下文理解段落，并对缺失或复制原文的译文做一次自动补译。
- **3.2 网页内联保护**：网页翻译会识别正文块里的内联代码、公式、变量和可见 URL，把它们作为 `protected_terms` 交给模型；后台会校验译文是否丢失保护项，失败时自动走一次 repair prompt。
- **Popup 网页翻译快捷控制**：popup 可直接调整网页目标语言、显示模式和翻译范围；点击「翻译当前网页」前会保存这些选项，方便在不同网站间快速切换。
- **仅译文显示模式**：网页翻译显示模式切到「仅插入译文样式」时，会隐藏原文文本并保留页面排版位置；清除网页译文或文本变化重译时会恢复原文。
- **网页翻译进度反馈**：页面内状态气泡会显示已完成段落数；如果模型成功返回但某些段落仍没有译文，会明确提示未返回译文的段落数量，不再静默显示“已更新”。
- **动态页面防陈旧译文**：SPA、展开面板或评论区内容变化时，同一个文本块如果原文变了，旧译文会被移除并重新进入翻译队列；请求过程中原文变化也不会渲染旧响应。
- **从上到下渐进翻译**：初始扫描和滚动/动态发现的文本块都会按视觉阅读顺序进入翻译队列，减少页面翻译跳段、乱序出现的问题。
- **网页翻译自变更过滤**：插件插入/清除译文节点、隐藏/恢复原文样式时不会触发自身 MutationObserver 重扫，降低 SPA 和长页面上的重复翻译与乱序风险。
- **网页结构保护**：网页翻译跳过导航、表单、代码块、隐藏元素和高风险布局元素，不覆盖原文，不替换页面 DOM，只插入可清理的译文节点。
- **网页上下文翻译**：网页翻译会把页面标题、URL、文档语言、标题路径、章节前后文块、用户词表和页面术语记忆一起发给模型，优先保证术语一致和段落自然度。
- **站点规则**：设置页支持用 JSON 配置站点级 root/block/include/exclude selectors 和最小文本阈值，用于修正复杂网站的漏翻、误翻和正文区域识别问题。
- **当前视频总结**：在 YouTube 视频页右侧或底部显示「视频总结」面板，点击后生成中文摘要、亮点和可跳转章节要点。
- **长视频章节锚点**：摘要 prompt 会按完整时间轴生成固定章节锚点，1 小时或更长视频不会只总结前 20 分钟。
- **语义分段翻译**：短字幕 cue 会先合并成完整语义段，模型按完整句理解后，再把翻译回填到原始时间轴。
- **VideoMemory 全文预分析**：视频打开后异步提取 summary、领域、术语表、实体和 ASR 纠错信息，后续字幕翻译会带上全局上下文。
- **用户词表**：可在设置页锁定术语翻译，优先级高于模型默认翻译和 VideoMemory。
- **显示与同步策略**：支持原始/清洗后英文显示，以及 cue 级同步、segment 级同步、学习模式等不同字幕展示方式。

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

## 工作方式

- `src/content_script.js` 优先读取 YouTube Transcript 时间轴，按完整 cue 同步显示双语字幕；必要时才回退到播放器字幕 DOM。
- `src/web_page_translator.js` 只在用户点击 popup 后注入普通网页，按视窗或整页渐进识别正文块，优先按同一标题路径组批翻译，并插入 `data-ytct-web-translation` 译文节点。
- `src/background.js` 持有 Gemini、DeepSeek、OpenRouter 各自的 API key 并发起请求，避免把 key 暴露给网页脚本。
- `src/core.js` 构造带上下文的翻译 prompt，并解析 JSON 或纯文本响应。
- 页面内「视频总结」面板会复用完整字幕时间轴，用户手动点击后生成当前视频的中文摘要、亮点和可跳转章节要点。
- 最近字幕原文和译文会进入上下文窗口，用来修正代词、术语、短句省略和技术词。
- 翻译单位从单个 cue 升级为 `Cue -> Segment -> Translation -> CueTranslation`：短 cue 会先合并成完整语义段，模型按完整句理解，再输出 cue 级译文，原始 YouTube 时间戳不变。
- 每个 cue 保留 `sourceRaw`，并生成用于翻译的 `sourceClean`。ASR 字幕会做更强的填充词清理、技术术语修正和轻量标点恢复；人工字幕只做轻量规范。
- 视频打开后会异步构建 `VideoMemory`：按字幕 chunk 做 map 分析，再 reduce 成 summary、domain、styleGuide、glossary、entities、asrCorrections。后续 batch 翻译会携带压缩后的全局记忆和局部前后文。
- VideoMemory 会写入本机 Chrome storage，并维护频道级记忆，避免同一视频重复做全文预分析。
- batch prompt 包含 `non_output_context_before`、`output_segments`、`non_output_context_after`、`videoMemory` 和用户词表；模型只输出 `output_segments` 的翻译。
- 网页翻译启动后会异步构建 `WebMemory`：按页面正文样本提取 summary、domain、styleGuide、glossary 和 entities。页面翻译 prompt 会携带该记忆、章节标题路径、相邻块上下文和 `protected_terms`；后台会校验模型输出，缺失、复制原文或丢失保护项的块会走一次 repair prompt。

## 视频总结

1. 打开 YouTube 视频，并确保页面能加载英文字幕或 transcript。
2. 插件会先复用同一份完整字幕时间轴，不会读取音频，也不会只拿当前屏幕上的几句字幕。
3. 点击页面内「视频总结」面板的生成按钮后，后台会调用当前选择的 API 生成结构化 JSON。
4. 输出包含三部分：
   - `摘要`: 用中文概括视频主题、结论和主要内容。
   - `亮点`: 提炼最值得注意的观点、工具、步骤或示例。
   - `章节要点`: 按固定时间锚点覆盖完整视频，点击章节可跳转到对应时间。

长视频会按时间轴自动设置章节锚点。例如 1 小时视频通常会覆盖 `00:00`、`06:00`、`12:00`、`18:00`、`24:00`、`30:00`、`36:00`、`42:00`、`48:00`、`54:00` 等位置；2 小时视频会继续按固定间隔覆盖后续内容，避免模型只输出开头部分。

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
- `网页翻译`: 可开启/关闭普通网页翻译，设置目标语言、显示模式和翻译范围；常用网页翻译选项也可直接在 popup 中调整。双语模式会保留原文并在下方插入译文；仅译文模式会隐藏原文文本，清除网页译文后恢复。点击 popup 后默认整页渐进翻译；也可切到仅翻译当前视窗附近。网页翻译不会自动读取所有网站，必须手动点击当前页翻译。
- `站点规则 JSON`: 可为复杂站点配置正文根节点、可翻译块、强制包含/排除选择器和最小文本长度。例如：

```json
[
  {
    "name": "Example Docs",
    "matches": ["docs.example.com", "*.papers.example.org"],
    "rootSelector": "article, main",
    "blockSelector": ".content p, .content h2, .content li",
    "excludeSelectors": [".ad", ".newsletter"],
    "minTextLength": 12,
    "minWords": 2
  }
]
```

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
- 网页翻译缓存 key 包含 provider、model、规范化页面 URL、source/target language、web prompt version、词表版本、标题路径、保护项 hash 和原文块 hash；缓存只保存在 background 内存中。
- 网页记忆缓存 key 包含规范化页面 URL、模型、词表版本、页面标题和正文样本 hash；同一页面重复翻译会复用已生成的 `WebMemory`。
- 视频总结缓存 key 包含 provider、model、videoId、摘要 prompt 版本、用户偏好和字幕内容 hash；章节锚点策略更新后不会复用旧摘要。
- 开发翻译管线前已创建远端备份分支：`backup/pre-translation-pipeline-2026-06-09`，指向基线 `7e570f0`。

## 开发

```bash
npm test
node --check src/core.js && node --check src/background.js && node --check src/content_script.js && node --check src/web_page_translator.js && node --check src/popup.js && node --check src/options.js
```

## 限制

- YouTube 功能只翻译 YouTube 已显示的字幕，不做音频识别。
- 普通网页翻译只处理页面中可见或渐进发现的文本块，不读取输入框、表单、代码块和隐藏内容。
- YouTube 页面结构变化可能影响字幕抓取选择器。
- API key 保存在本机 Chrome storage；不要在共享电脑上保存个人 key。
- 视频总结需要完整字幕时间轴；如果 YouTube 只暴露当前可见字幕而无法加载完整 transcript，插件不会调用 API 生成摘要。
