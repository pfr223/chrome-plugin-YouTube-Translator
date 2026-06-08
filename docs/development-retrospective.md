# YouTube 字幕翻译插件开发复盘

本文记录本插件从原型到可用版本过程中遇到的问题、走过的弯路，以及下次开发类似 Chrome 插件时应优先采用的经验。

## 最终目标

做一个 Chrome MV3 插件，在 YouTube 视频上同步显示英文字幕和中文字幕。字幕翻译需要利用上下文，尤其面向 ML、AI、RL 课程学习场景，尽量稳定处理术语、公式、缩写和 ASR 误识别。

最终形成的核心思路：

- 优先获取 YouTube 的字幕时间轴或 Transcript，按完整 cue 显示和翻译。
- 后台脚本统一调用 Gemini、DeepSeek、OpenRouter，API key 只保存在 Chrome 本地 storage。
- 内容脚本只负责字幕时间轴、渲染、拖拽、设置同步和页面适配。
- `core.js` 保持纯逻辑，负责 prompt、响应解析、字幕清洗、时间轴解析和测试覆盖。

## 主要弯路

### 1. 先翻译当前 DOM 字幕，导致延迟和乱跳

最初实现直接读取播放器当前显示的字幕 DOM，再逐条发 API 翻译。这个方案的问题很明显：

- YouTube 自动字幕会几个词几个词追加，DOM 文本不是完整句子。
- API 往返延迟通常大于字幕切换速度，播放时经常下一句已经出现，上一句翻译才回来。
- 屏幕上会出现“翻译中...”卡住、旧翻译覆盖新字幕、字幕内容滚动追加等问题。

更好的方式是先拿完整时间轴：字幕 track、Transcript panel 或 transcript API。把一句完整台词作为 cue，然后按时间点同步显示。翻译可以提前批量预取，这样播放到某句时大概率已有缓存。

经验：视频字幕翻译不应该围绕“当前屏幕文字”设计，而应该围绕“带时间戳的字幕时间轴”设计。DOM 当前字幕只能作为兜底。

### 2. 没有一开始定义字幕显示模型

沉浸式翻译的效果稳定，是因为它显示的是“当前完整台词 + 对应翻译”，不是把正在滚动的自动字幕碎片实时翻译出来。我们前期一直在修补滚动字幕和延迟问题，实际上是在错误模型上补丁。

正确模型：

- 当前时间命中一个 cue。
- 每次只显示一个 cue 的原文和译文。
- cue 原文是完整台词，不随 YouTube 自动字幕逐词追加而变化。
- 译文未准备好时可以临时只显示原文，但不要让“翻译中...”长期占位。

经验：先定义用户看到的稳定状态，再设计数据流。否则 UI 会跟随上游噪声一起抖动。

### 3. API 和模型 ID 需要先验证

早期配置里出现过不可用的 Gemini 模型名，例如 `gemini-3.1-flash`，直接导致 404。不同 provider 的接口格式、鉴权方式和响应结构也不一样。

后续做法：

- Gemini、DeepSeek、OpenRouter 分开配置页面和 API key。
- provider-specific model id 独立保存。
- OpenRouter 用 OpenAI 兼容 Chat Completions 格式。
- 响应解析支持 JSON、fenced JSON 和普通文本，避免模型返回 `Here is the JSON requested:` 时污染字幕。

经验：模型名不要凭印象写死；provider 配置要隔离；响应解析要面向真实 LLM 输出，而不是只面向理想 JSON。

### 4. 提示词一开始过于通用

普通翻译 prompt 对 ML、AI、RL 课程不够稳定，容易把术语翻错或把公式、变量、算法名硬翻。

后续 prompt 明确加入课程场景：

- 默认假设是 ML/AI/RL course lecture。
- 保留或稳定翻译 RL、MDP、PAC、UCB、TD、SARSA、Q value、epsilon-greedy、softmax 等术语。
- 公式、变量、希腊字母、代码、引用和 slide label 不翻译。
- 只修正明确的 ASR 错误，不编造缺失内容。

经验：字幕翻译 prompt 要服务具体使用场景。课程学习类字幕需要术语稳定性，优先级高于文学化表达。

## UI 和 Chrome 扩展问题

### 1. 字幕框宽度参照系反复搞错

字幕框宽度先后经历了几种错误：

- 用 `fit-content` 或内容撑开，长字幕会改变框宽。
- 用播放器父容器百分比，拖到边缘后可能变窄。
- 改成屏幕宽度 `2/3`，又不符合用户想要的视频窗口宽度。

最终做法：

- 字幕框宽度固定为 `getPlayer().getBoundingClientRect().width * 2 / 3`。
- 实际设置为固定像素 `width/minWidth/maxWidth`。
- 位置用 viewport 坐标保存，宽度用视频窗口计算。

经验：UI 中“宽度的 2/3”必须先明确参照物，是屏幕、页面、播放器、视频画面还是父容器。参照物不明确会导致反复改。

### 2. 字幕框挂在播放器里，移到视频外就不好拖

字幕层最初 append 到 `.html5-video-player` 里。这样它和播放器容器、层叠上下文、裁剪、事件命中都绑在一起。用户把字幕拖到视频窗口下方后，拖拽容易失效或行为不稳定。

最终做法：

- 字幕层挂到 `document.body`，全屏时挂到 `document.fullscreenElement`。
- 用 `position: fixed` 控制位置。
- 保持 `pointer-events: auto`、`touch-action: none`、`user-select: none`。

经验：可自由拖动的 overlay 不应默认挂在业务组件内部。能跨区域移动的层，应该挂到顶层容器，并单独管理坐标系。

### 3. 字体和透明度看似无效

原因不是参数没有保存，而是交互预期和刷新链路不清楚：

- 设置页滑块只有显示数值变化，原来需要点“保存”才广播。
- 内容脚本旧版本可能还在页面里运行，扩展重载后必须刷新 YouTube 页。
- 设置页自身也需要刷新才能加载新 options.js。

最终做法：

- 字体大小和背景透明度滑块输入后自动 debounce 保存。
- background 和 `--ytct-font-scale` 都在 content script inline style 中实时应用。
- background 不使用 `!important`，避免覆盖动态透明度。

经验：用户看到滑块变化，会自然期待立即生效。要么自动保存，要么 UI 必须明确标注“保存后生效”。扩展开发中还要区分“扩展已重载”和“页面 content script 已刷新”。

## 调试和验证经验

### 1. 只看截图不够，要读运行态样式

截图能说明问题，但不能区分：

- CSS 没加载。
- inline style 被覆盖。
- 旧 content script 还在运行。
- 设置没有广播。
- DOM 挂载位置导致坐标不一致。

有效验证方式：

```js
const overlay = document.querySelector(".ytct-overlay");
const player = document.querySelector(".html5-video-player");
const overlayRect = overlay.getBoundingClientRect();
const playerRect = player.getBoundingClientRect();
getComputedStyle(overlay);
```

这次最终运行态检查确认：播放器宽 `1765px`，字幕框宽 `1177px`，刚好是 `2/3`；字幕层 parent 是 `BODY`，`position: fixed`，`pointer-events: auto`。

经验：视觉问题要用 computed style 和 DOM rect 证明，不要只靠肉眼判断。

### 2. TDD 对回归很有帮助，但测试不要过度绑定实现细节

这次加了静态回归测试，覆盖：

- 字幕框宽度来自视频窗口，而不是 `vw` 或百分比。
- overlay 挂载到 body/fullscreen host 后，能在视频外继续拖。
- 字体/透明度滑块输入后自动保存显示设置。

中间也出现过测试写得太死的问题：要求 JS 里直接出现 `"66.6667vw"`，但实现后来改为常量生成字符串。测试应该锁定行为约束，而不是无意义地锁定字符串写法。

经验：测试要覆盖容易回退的设计决策，例如“宽度参照视频窗口”，但不要过度限制实现细节。

### 3. Chrome 扩展调试要注意生命周期

常见误判：

- 改了源文件，但没有在 `chrome://extensions` 重载扩展。
- 重载扩展后，没有刷新 YouTube 页面，旧 content script 仍在。
- 设置页开着不刷新，仍在跑旧 options.js。
- service worker 重启后状态变化，页面未收到预期广播。

推荐验证顺序：

1. `npm test`
2. `node --check src/*.js`
3. `chrome://extensions` 重载插件
4. 刷新 YouTube 页面
5. 刷新设置页
6. 用 DOM rect 和 computed style 检查运行态
7. 手动拖拽、调字体、调透明度

经验：扩展开发的“代码已改”不等于“浏览器页面已运行新代码”。

## 下次开发建议

### 架构优先级

1. 先确定字幕来源：track/transcript API 优先，DOM 兜底。
2. 先确定字幕显示模型：完整 cue、单句同步、提前预取。
3. 再做 provider 接入：模型 ID、鉴权、响应解析、超时、错误提示。
4. 最后做 overlay 交互：位置、宽度、字体、透明度、全屏适配。

### API 策略

- 默认选择低延迟模型，不要只看翻译质量。
- 支持 provider 独立配置，不共享模型字段和 API key 字段。
- 对 LLM 响应做宽松解析，不能假设严格 JSON。
- 批量翻译要限制 batch size，并做缓存。
- 错误信息要直出 provider status 和可读提示，便于定位模型名、额度、网络问题。

### 字幕同步策略

- 不要逐词翻译自动字幕 DOM。
- cue 需要有 `start/end/source/translation/status`。
- 当前时间只命中一个 active cue。
- 对未来若干 cue 预取翻译。
- API 失败时保留原文，不让 UI 长时间卡在 loading。

### Overlay 策略

- 坐标系、挂载点、宽度参照物要在实现前写清楚。
- 可拖拽层优先挂 body 或 fullscreen element。
- 宽度固定为像素，来源可以是视频 rect。
- `left/top` 用 viewport percent 持久化，适配页面尺寸变化。
- 动态样式使用 inline style 或 CSS variable，不要被 `!important` 抢优先级。

### 设置页策略

- 用户认为会“实时变化”的控件，例如滑块，应自动保存或明确说明保存后生效。
- 设置变更后要广播给 YouTube tabs。
- 保存设置和 API key 更新要分开考虑，避免空 key 覆盖已有 key。
- 设置页改动后需要刷新设置页本身才能测试新 JS。

## 保留的风险

- YouTube 内部页面结构和 transcript 数据接口可能变化。
- 自动字幕质量差时，即使有上下文，LLM 也只能有限修正。
- 不同地区网络到 DeepSeek、Gemini、OpenRouter 的延迟差异很大，需要本机实测。
- 其他字幕类插件可能也会操作 caption DOM，存在样式或隐藏原字幕的冲突。
- 全屏模式、影院模式、迷你播放器、不同窗口宽度仍需要持续回归测试。

## 下次开工检查清单

- [ ] 明确字幕来源优先级：track、transcript panel、DOM fallback。
- [ ] 明确字幕显示单位：完整 cue，而不是当前 DOM 文本碎片。
- [ ] 明确 overlay 坐标系和宽度参照物。
- [ ] 先写回归测试，再改字幕同步或 overlay 行为。
- [ ] 改完后跑 `npm test` 和 `node --check`。
- [ ] 重载扩展、刷新 YouTube、刷新设置页。
- [ ] 用 computed style 和 DOM rect 验证关键 UI。
- [ ] 手动验证播放中同步、暂停后显示、拖拽、字体、透明度。
