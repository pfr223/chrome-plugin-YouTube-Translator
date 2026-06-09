# Chrome Web Store Listing 文案

## 标题

YouTube Context Translator - YouTube 课程双语字幕翻译

## 短描述

为 YouTube 英文课程字幕同步生成简体中文翻译，支持上下文修正，用户自备 Gemini、DeepSeek 或 OpenRouter API key。

## 分类

首选：Education  
备选：Productivity

## 详细描述

```text
YouTube Context Translator 是一个面向课程学习的 YouTube 字幕同步翻译扩展。它读取 YouTube 当前英文字幕和 Transcript 时间轴，结合相邻字幕上下文，生成更连贯的简体中文字幕覆盖层，适合学习 ML、AI、RL、编程、数学、公开课和技术讲座。

核心能力

• 同步双语字幕：在 YouTube 播放器上显示英文原文和简体中文翻译。
• 优先使用 Transcript/字幕时间轴：尽量按完整 cue 同步翻译，减少只读播放器当前字幕造成的断句问题。
• 上下文修正：结合最近字幕，改善代词、术语、省略主语和短句歧义。
• 适合技术课程：默认提示词面向 ML/AI/RL 课程学习优化，可更稳定处理 reinforcement learning、MDP、UCB、SARSA、Q value、epsilon-greedy 等术语。
• 自定义翻译偏好：可写课程领域词表、保留英文术语、翻译风格等要求。
• 可调整字幕显示：支持调整字幕框透明度、字体大小和位置。
• 多 API provider：支持 Gemini、DeepSeek 和 OpenRouter。

商业模式

本扩展不收费，不提供订阅服务。你需要使用自己的 API key，也就是 BYOK（Bring Your Own Key）。这样做的好处是：

• 你的 API 用量和账单由你自己控制。
• 不需要把 API key 交给开发者服务器中转。
• 可以按自己的网络、价格和模型偏好选择 Gemini、DeepSeek 或 OpenRouter。
• 开发者不收取翻译订阅费。

限制也很明确：

• 翻译质量、延迟、可用地区和费用取决于你选择的 API provider 和模型。
• 本扩展不做音频识别，只翻译 YouTube 已提供或页面中可读取的字幕。
• YouTube 页面结构变化可能影响字幕读取，后续需要跟随维护。

隐私说明

本扩展没有开发者自营服务器。API key 和设置保存在你的本机 Chrome storage 中。启用翻译时，扩展会把当前字幕、相邻字幕上下文、必要视频元数据和你的翻译偏好，通过 HTTPS 发送给你选择的 API provider（Gemini、DeepSeek 或 OpenRouter）以生成翻译。开发者不收集、不出售、不用于广告，也不保存你的字幕内容或 API key。第三方 API provider 对数据的处理受其各自服务条款和隐私政策约束。

免责声明

本扩展不是 YouTube、Google、Gemini、DeepSeek、OpenRouter 或任何其他第三方服务的官方产品，也未获得这些服务的官方背书。YouTube 是其各自所有者的商标。本扩展仅用于辅助字幕学习和翻译。
```

## 功能亮点

- YouTube 英文字幕同步中文翻译。
- 优先 Transcript/字幕时间轴，适合长课程。
- 上下文感知翻译，减少术语漂移。
- 支持 Gemini、DeepSeek、OpenRouter。
- BYOK：用户自备 API key，无订阅费。
- 字幕样式、位置、透明度可调。
- 面向 ML/AI/RL 和技术公开课优化。

## 关键词

YouTube 字幕翻译, YouTube 双语字幕, 英文课程翻译, AI 字幕翻译, 机器学习课程, 强化学习课程, Gemini 字幕翻译, DeepSeek 字幕翻译, OpenRouter 字幕翻译, 自备 API key, YouTube captions, bilingual subtitles, Chinese translation, context-aware translation, lecture subtitles, BYOK
