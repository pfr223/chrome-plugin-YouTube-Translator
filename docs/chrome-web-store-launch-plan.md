# YouTube Context Translator Chrome Web Store 上架方案

> 调研日期：2026-06-09  
> 目标仓库：<https://github.com/pfr223/chrome-plugin-YouTube-Translator>  
> 当前插件：Chrome MV3，YouTube 英文字幕同步中文翻译，用户自备 API key，支持 Gemini、DeepSeek、OpenRouter。

## 1. 官方上架要求速览

### 1.1 开发者账号与费用

- 入口：Chrome Web Store Developer Dashboard：<https://chrome.google.com/webstore/devconsole/>
- 官方要求：发布前必须注册 Chrome Web Store developer，并支付一次性注册费。官方注册页说明需要提供开发者邮箱，且账号创建后不能直接更改该邮箱。
- 费用：官方注册页只写“一次性注册费”，未在该页固定金额；Chrome Extensions 官方 What's New 页面在 2026-04-30 更新中提到成员加入 publisher account 不需要支付 `$5 registration fee`，因此当前可按 `5 USD 一次性费用` 预估，最终以 Developer Dashboard 付款页显示为准。
- 账号设置：需要填写发布者名称、验证联系邮箱；如果插件提供购买、订阅或付费功能，某些情况下还需要实体地址。本插件当前定位为免费、无订阅，不走付费功能，但仍应完成联系邮箱验证。
- 2FA：Chrome Web Store API 文档提到，发布或更新已有扩展需要 Google 账号启用两步验证。建议发布账号从一开始就启用 2FA。

官方来源：

- Register your developer account：<https://developer.chrome.com/docs/webstore/register/>
- Set up your developer account：<https://developer.chrome.com/docs/webstore/set-up-account>
- Use the Chrome Web Store API：<https://developer.chrome.com/docs/webstore/using_webstore_api>
- What's new in Chrome Extensions：<https://developer.chrome.com/docs/extensions/whats-new>

### 1.2 上传与审核流程

首次发布的标准流程：

1. 准备可发布 zip 包，zip 根目录应直接包含 `manifest.json`。
2. 进入 Developer Dashboard，点击 `Add new item`。
3. 上传 zip。manifest 和包格式通过后，进入 item 编辑页。
4. 填写 `Package`、`Store Listing`、`Privacy`、`Distribution`、`Test instructions`。
5. 点击 `Submit for Review`。
6. 可选择审核通过后自动发布，或使用 deferred publishing。若选择延迟发布，官方说明审核完成后最多有 30 天手动发布窗口，过期会回到 draft。

审核时间：

- 官方说明多数扩展会在几天内完成审核，也可能需要数周。
- 官方 2026-04 起提示 Chrome Web Store submission 激增，审核时间可能延长。
- 新开发者、新扩展、危险权限、重大代码变更、较宽 host 权限、难以审核的代码，都可能增加审核时间。

官方来源：

- Publish in the Chrome Web Store：<https://developer.chrome.com/docs/webstore/publish>
- Chrome Web Store review process：<https://developer.chrome.com/docs/webstore/review-process/>

### 1.3 Store Listing 必填与素材尺寸

Store Listing 需要：

- 详细描述：开头必须让用户一眼理解插件做什么，避免关键词堆砌。
- 主分类：建议本插件选择 `Education`，备选 `Productivity`。
- 语言：建议优先 `Chinese (Simplified)`，如后续做英文 listing，再加英文 locale。
- 图形资产：
  - 商店图标：`128x128 px`。
  - 截图：至少 1 张，最多 5 张，官方推荐 `1280x800 px`；也支持 `640x400 px`。
  - 小宣传图：`440x280 px`，PNG 或 JPEG。
  - Marquee 宣传图：`1400x560 px`，PNG 或 JPEG，官方列为可选，但建议准备。
  - YouTube 演示视频链接：可填，建议后续准备 30-60 秒演示。

截图规范：

- 展示真实使用体验。
- 方角、无 padding、全幅画面。
- 建议做满 5 张截图，提高用户理解和审核可信度。

官方来源：

- Complete your listing information：<https://developer.chrome.com/docs/webstore/cws-dashboard-listing/>
- Supplying Images：<https://developer.chrome.com/docs/webstore/images>
- Best Practices / categories：<https://developer.chrome.com/docs/webstore/best_practices>

### 1.4 隐私、权限与数据披露

Chrome Web Store 对扩展隐私要求的关键点：

- 只请求实现功能所需的最小权限。
- 如果产品处理任何用户数据，必须提供准确、最新的隐私政策链接。
- Privacy tab 必须披露扩展收集和使用的数据类型，并认证符合 Limited Use policy。
- 如果处理个人或敏感用户数据，必须安全传输；不要使用 HTTP 传输用户数据。
- Web browsing activity 只有在支持一个清晰披露的用户可见功能时才允许收集和使用。
- 不得把用户数据用于个性化广告、重定向广告、转卖给数据经纪商、信用评估等。
- 不得冒充其他公司、暗示被 YouTube、Google、DeepSeek、Gemini、OpenRouter 或“沉浸式翻译”等第三方官方背书。

本插件会读取 YouTube 页面字幕、视频元数据和用户设置，会把字幕文本与上下文发送给用户选择的第三方模型 API 做翻译，因此必须提交隐私政策，并在商店页清楚披露。

官方来源：

- Program Policies：<https://developer.chrome.com/docs/webstore/program-policies/policies>
- Fill out the privacy fields：<https://developer.chrome.com/docs/webstore/cws-dashboard-privacy>
- User Data FAQ：<https://developer.chrome.com/docs/webstore/user_data>
- Protect user privacy：<https://developer.chrome.com/docs/extensions/develop/security-privacy/user-privacy>
- Troubleshooting CWS violations：<https://developer.chrome.com/docs/webstore/troubleshooting/>

## 2. 本仓库上架前必须补齐或检查

### 2.1 当前 manifest 摘要

当前 `manifest.json`：

```json
{
  "manifest_version": 3,
  "name": "YouTube Context Translator",
  "version": "0.1.0",
  "description": "Context-aware Simplified Chinese translation overlay for YouTube captions.",
  "permissions": ["storage"],
  "host_permissions": [
    "https://www.youtube.com/*",
    "https://m.youtube.com/*",
    "https://generativelanguage.googleapis.com/*",
    "https://api.deepseek.com/*",
    "https://openrouter.ai/*"
  ]
}
```

优点：

- MV3，符合新扩展提交要求。
- 权限较窄，只有 `storage` 和明确 host 权限，没有 `<all_urls>`、`tabs`、`scripting`、`cookies`、`webRequest` 等高敏权限。
- 第三方 API host 都是 HTTPS。

必须补齐：

- `icons` 字段和图标文件：建议补 `16x16`、`32x32`、`48x48`、`128x128` PNG。
- 商店用 `128x128` 透明背景 PNG。
- 至少 1 张 `1280x800` 截图，建议 5 张。
- `440x280` 小宣传图。
- `1400x560` Marquee 图。
- 隐私政策页面，建议放到 GitHub Pages 或仓库 `docs/privacy-policy.md` 并发布为可访问 URL；Chrome Web Store 需要 URL，不建议只给仓库相对路径。
- Reviewer test instructions：写明如何配置测试 key、如何打开 YouTube 字幕、如何验证 overlay。
- Release zip 构建命令或手动打包步骤。

建议补齐但非硬性：

- `homepage_url` 对应的项目主页或 GitHub repo。
- 支持邮箱。
- 英文 listing 或双语 listing。
- 30-60 秒 YouTube 演示视频。

### 2.2 权限说明建议

Chrome Web Store 权限解释建议直接填写：

#### `storage`

用途：

> 保存用户在本机配置的 API provider、API key、模型名称、字幕上下文条数、翻译偏好、字幕样式和字幕框位置。API key 仅保存在用户本机 Chrome storage，用于向用户选择的模型服务发起翻译请求。

风险控制：

- 不上传到开发者自有服务器。
- 不用于广告、追踪或画像。
- 文案中说明共享电脑不要保存个人 API key。

#### `https://www.youtube.com/*` 和 `https://m.youtube.com/*`

用途：

> 在 YouTube 视频页面读取当前字幕、Transcript/字幕时间轴、视频标题等必要上下文，并在播放器上显示中英双语字幕覆盖层。

风险控制：

- 仅对 YouTube 和移动 YouTube 生效。
- 不读取其他网站。
- 不修改账号、评论、订阅、付款等 YouTube 数据。

#### `https://generativelanguage.googleapis.com/*`

用途：

> 当用户选择 Gemini 并填写自己的 API key 时，将当前字幕和必要上下文发送到 Gemini API 获取中文翻译。

#### `https://api.deepseek.com/*`

用途：

> 当用户选择 DeepSeek 并填写自己的 API key 时，将当前字幕和必要上下文发送到 DeepSeek API 获取中文翻译。

#### `https://openrouter.ai/*`

用途：

> 当用户选择 OpenRouter 并填写自己的 API key 时，将当前字幕和必要上下文发送到 OpenRouter API 获取中文翻译。

### 2.3 单一用途说明

建议在 Privacy tab 的 single purpose 中填写：

> 在 YouTube 视频页面读取英文字幕和字幕时间轴，结合相邻字幕上下文生成同步的简体中文字幕覆盖层，帮助中文用户学习英文课程视频。

避免写成“AI 学习助手”“YouTube 增强工具箱”等过宽用途。当前插件的核心用途应始终保持为：YouTube 字幕同步中文翻译。

### 2.4 数据使用披露建议

建议在 Privacy tab 中按实际行为谨慎披露：

- Website content：是。插件读取 YouTube 页面字幕、Transcript、视频标题、频道名等页面内容。
- Web browsing activity：建议披露为是或在 Dashboard 对应字段中如实选择，原因是插件会在 YouTube 页面运行，并根据当前视频 URL/页面上下文提供用户可见的翻译功能。重点说明仅限 YouTube 且用于字幕翻译。
- Authentication information：建议谨慎披露。插件不读取 YouTube 登录凭据、密码或 cookie，但用户输入的 Gemini/DeepSeek/OpenRouter API key 属于认证凭据；即使主要保存在本机并只发送给用户选择的 provider，也应在隐私政策和 Dashboard 对应字段中明确说明。
- Personally identifiable information：通常不主动收集姓名、邮箱、电话等；如果没有账号系统和遥测，不勾选。
- Financial and payment information：不收集。
- Health information：不收集。
- Personal communications：不收集。
- Location：不收集。
- User activity：如 Dashboard 有“页面交互/用户活动”字段，除非未来加遥测，否则不建议勾选；当前设置项和字幕框位置属于本机偏好。

第三方共享说明：

> 插件会在用户主动启用并配置 API key 后，将当前字幕文本、相邻字幕上下文、必要视频元数据和用户自定义翻译偏好发送给用户选择的 API provider，包括 Gemini、DeepSeek 或 OpenRouter。开发者不运营中转服务器，不接收或保存这些内容。第三方 API provider 对数据的处理还受其各自服务条款和隐私政策约束。

### 2.5 隐私政策必须写清楚

隐私政策建议包含：

- 插件单一用途。
- 收集/处理的数据：
  - YouTube 字幕文本和相邻字幕上下文。
  - 视频标题、频道名、URL 或 video id 等必要元数据。
  - 用户选择的 provider、模型名称、字幕样式、上下文条数、自定义翻译偏好。
  - 用户输入的 Gemini/DeepSeek/OpenRouter API key。
- 数据用途：
  - 生成同步中文字幕。
  - 保存本机设置。
  - 改善术语一致性和上下文翻译。
- 数据存储：
  - 设置和 API key 保存在用户本机 Chrome storage。
  - 开发者不运营服务器，不保存用户字幕或 API key。
  - 插件内存中有临时翻译缓存，用于减少重复请求。
- 数据传输：
  - 仅通过 HTTPS 发给用户选择的 provider。
  - 不发给广告平台、数据经纪商或开发者分析服务器。
- Limited Use 声明：
  - 使用用户数据仅用于插件的单一用途和用户可见功能。
  - 不用于个性化广告，不转售，不用于信用评估。
  - 除法律、安全、用户支持等政策允许情形外，不允许人工读取用户数据；当前开发者无服务器侧数据可读。
- 用户控制：
  - 可停用插件。
  - 可删除 API key。
  - 可在 Chrome 扩展页移除插件并清除本机数据。
- 第三方服务链接：
  - Gemini API：<https://ai.google.dev/>
  - DeepSeek API：<https://api-docs.deepseek.com/>
  - OpenRouter：<https://openrouter.ai/>

## 3. 图标与视觉资产方案

### 3.1 图标设计方向

关键词：YouTube 字幕、AI 翻译、中文学习、课程学习。

建议方向：

- 主形状：圆角方形透明背景图标，主体为播放按钮和双行字幕框。
- 视觉元素：
  - 一个抽象播放三角形，避免直接复制 YouTube 官方 logo 的红色圆角矩形。
  - 下方两行字幕：第一行 `EN` 或短横线，第二行 `中`。
  - 小型 AI 星点或 neural sparkle，表示智能上下文翻译。
  - 书页/课程笔记的轻微形状，可作为字幕框背景，不要复杂。
- 颜色：
  - 主色可用珊瑚红或亮红橙表达视频，但避免和 YouTube 商标 logo 过于相似。
  - 辅色用深墨蓝/白色增强字幕可读性。
  - `中` 字建议用醒目的绿色或蓝绿色，表达中文学习。
- 透明背景：商店图标和扩展图标都建议 PNG 透明背景，主体留 8-12 px 安全边距。

不要做：

- 不要直接使用 YouTube 官方 logo、Google/Gemini logo、DeepSeek/OpenRouter logo。
- 不要写“官方”“Pro Plus”“沉浸式翻译同款”等容易引发误导或商标风险的文案。
- 不要在 16px 小图标里放太多文字。

### 3.2 图标生成 prompt

可用于 AI 生成 1024x1024 母版，再人工导出 `16/32/48/128` PNG：

```text
Create a clean modern Chrome extension icon on a transparent background. 
Subject: an abstract video play symbol combined with bilingual subtitles and AI translation for Chinese learning.
Composition: centered rounded-square app icon shape, a coral-red abstract play triangle, two subtitle lines below it, first line represented by small white "EN" text or short caption bars, second line with a clear Chinese character "中", plus one subtle AI sparkle/neural dot accent.
Style: flat vector-like, premium educational tool, high contrast, readable at 16px, simple geometry, no photorealism, no gradients that mimic YouTube, no official YouTube/Google/Gemini logos, no trademarked icons.
Colors: coral red, deep navy, white, teal accent.
Output: transparent background PNG, 1024x1024, large safe margin, crisp edges.
```

如果使用 SVG 手工方案，建议先创建 `assets/icon.svg` 母版，再用 `sharp` 或浏览器导出 PNG：

```bash
npm install --save-dev sharp
node scripts/render-icons.js
```

可执行导出脚本思路：

- 输入：`assets/icon.svg`
- 输出：
  - `assets/icons/icon16.png`
  - `assets/icons/icon32.png`
  - `assets/icons/icon48.png`
  - `assets/icons/icon128.png`
  - `assets/store/icon128.png`
- 生成后在 `manifest.json` 加：

```json
"icons": {
  "16": "assets/icons/icon16.png",
  "32": "assets/icons/icon32.png",
  "48": "assets/icons/icon48.png",
  "128": "assets/icons/icon128.png"
}
```

### 3.3 建议截图脚本

建议准备 5 张 `1280x800` 截图：

1. YouTube 视频播放页，英文字幕 + 中文字幕 overlay 同步显示。
2. Transcript 时间轴模式，强调长课程视频更稳定。
3. 设置页 provider 选择：Gemini / DeepSeek / OpenRouter。
4. 自定义术语/课程偏好：ML/AI/RL 术语一致性。
5. 字幕样式和位置：透明度、字号、拖动字幕框。

每张截图可以加短标题，但必须保留真实产品 UI。标题不要遮挡核心画面。

官方素材指南建议宣传图尽量用品牌和产品视觉表达，不要依赖大量文字；如果要放中文文案，保持短句、大字号，并避免把关键卖点只写在图片里。

小宣传图 `440x280`：

- 文案：`YouTube 课程双语字幕`
- 副文案：`BYOK · Gemini / DeepSeek / OpenRouter`
- 画面：视频播放器 + 中英字幕 + 小 AI 星点。

Marquee `1400x560`：

- 文案：`把英文课程字幕同步翻成中文`
- 副文案：`上下文修正术语，适合 ML / AI / RL 学习`

## 4. 商店宣传文案

### 4.1 标题备选

首选：

> YouTube Context Translator

中文显示可用：

> YouTube Context Translator - YouTube 课程双语字幕翻译

如果商店标题长度限制导致过长，保留英文名，并在短描述写中文定位。

Chrome Web Store 从 2024-02 起对 `manifest.json` 的 `name` 字段采用通用 `75` 字符限制。当前英文名长度安全；如果改成中英双语长标题，先计算字符数并在本地加载验证。

### 4.2 短描述

> 为 YouTube 英文课程字幕同步生成简体中文翻译，支持上下文修正，用户自备 Gemini、DeepSeek 或 OpenRouter API key。

### 4.3 详细描述

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

### 4.4 功能亮点

- YouTube 英文字幕同步中文翻译。
- 优先 Transcript/字幕时间轴，适合长课程。
- 上下文感知翻译，减少术语漂移。
- 支持 Gemini、DeepSeek、OpenRouter。
- BYOK：用户自备 API key，无订阅费。
- 字幕样式、位置、透明度可调。
- 面向 ML/AI/RL 和技术公开课优化。

### 4.5 适用人群

- 学习英文公开课的中文用户。
- 看 ML、AI、RL、编程、数学课程的学生和工程师。
- 希望保留英文术语，同时理解中文解释的学习者。
- 已有 Gemini、DeepSeek 或 OpenRouter API key，想自主控制模型和费用的用户。

### 4.6 FAQ

**Q：这是免费的吗？**  
A：扩展本身免费，无订阅费。但翻译请求会使用你自己的 API key，相关费用由对应 API provider 收取。

**Q：为什么要自备 API key？**  
A：这样你可以自己选择模型、控制用量和账单，也不需要把 key 交给开发者服务器。本扩展只在本机保存 key，并直接向你选择的 provider 发起请求。

**Q：支持哪些 API？**  
A：当前支持 Gemini、DeepSeek 和 OpenRouter。OpenRouter 可以进一步选择它支持的模型。

**Q：会上传我的 YouTube 账号信息吗？**  
A：不会主动读取或上传 YouTube 账号、评论、订阅、付款等信息。扩展只处理字幕翻译所需的字幕文本、相邻上下文和必要视频元数据。

**Q：会收集浏览历史吗？**  
A：扩展仅在 YouTube 页面运行，为当前视频的字幕翻译读取必要 URL/视频信息，不追踪你在其他网站的浏览历史，也不做广告画像。

**Q：为什么有些视频没有翻译？**  
A：本扩展依赖 YouTube 页面可读取的字幕或 Transcript。如果视频没有英文字幕、字幕被禁用、页面结构变动或 API key/网络异常，可能无法翻译。

**Q：它能像高级/Pro 级双语字幕工具一样用吗？**  
A：定位上提供常见高级视频双语字幕能力，例如同步字幕、上下文修正、术语偏好和多模型选择。但它不声称与任何第三方商业插件有关，也不保证所有视频都可用。

## 5. BYOK 商业模式说明

### 5.1 对用户的优点

- 无扩展订阅费：开发者不按月收取字幕翻译费用。
- 账单透明：翻译 token 成本直接发生在用户自己的 API provider 账户中。
- 模型自由：用户可按课程类型、速度、价格、网络环境选择 provider 和模型。
- 隐私边界清晰：没有开发者中转服务器，减少 API key 和字幕内容被开发者服务端保存的风险。
- 可持续维护：插件不需要承担集中式 API 成本，适合开源/低成本维护。

### 5.2 对用户的限制

- 使用门槛高于订阅制产品：用户需要自己申请 API key。
- 可用性取决于 provider：网络、地区、余额、模型下线、限流都会影响翻译。
- 成本不可由插件统一承诺：不同模型价格差异大，字幕密度和上下文条数会影响 token 用量。
- API key 安全由用户共同负责：共享电脑、同步配置、恶意扩展环境都可能增加风险。

### 5.3 商店文案中应避免

- 不写“永久免费翻译”，因为第三方 API 可能收费。
- 不写“无成本”，应写“扩展不收费，无订阅；API 调用成本由用户自己的 provider 账户承担”。
- 不写“官方 Gemini/DeepSeek/OpenRouter 插件”。
- 不写“替代沉浸式翻译”或直接比较竞品商标。

## 6. 最终上架 checklist

### 6.1 代码与包

- [ ] `manifest.json` 添加 `icons` 字段。
- [ ] 新增 `assets/icons/icon16.png`、`icon32.png`、`icon48.png`、`icon128.png`。
- [ ] 确认 zip 根目录直接包含 `manifest.json`，不要把整个父目录包进去。
- [ ] 排除 `.git`、测试截图源文件、开发临时文件、无关文档。
- [ ] 发布前运行：

```bash
npm test
node --check src/core.js
node --check src/background.js
node --check src/content_script.js
node --check src/popup.js
node --check src/options.js
```

- [ ] 在 Chrome `chrome://extensions/` 加载 zip 同源代码目录，验证：
  - 设置页可保存 Gemini/DeepSeek/OpenRouter key。
  - YouTube 有英文字幕视频能显示双语字幕。
  - Transcript 模式正常。
  - 字幕框拖动和样式设置可保存。
  - 关闭扩展开关后不再翻译。

### 6.2 商店素材

- [ ] 商店图标 `128x128` PNG，透明背景。
- [ ] 截图 `1280x800`，至少 1 张，建议 5 张。
- [ ] 小宣传图 `440x280` PNG/JPEG。
- [ ] Marquee 图 `1400x560` PNG/JPEG。
- [ ] 可选：30-60 秒 YouTube 演示视频。
- [ ] 所有素材不使用 YouTube 官方 logo、Google logo 或第三方 provider logo。

### 6.3 Developer Dashboard

- [ ] 注册 CWS developer，支付一次性注册费。
- [ ] 开启 Google 账号 2FA。
- [ ] 填写 publisher name。
- [ ] 验证联系邮箱。
- [ ] Store Listing：
  - [ ] 标题。
  - [ ] 短描述。
  - [ ] 详细描述。
  - [ ] 分类：`Education`。
  - [ ] 语言：`Chinese (Simplified)`。
  - [ ] Homepage URL：建议 GitHub repo 或项目主页。
  - [ ] Support URL：建议 GitHub Issues 或专门支持页。
- [ ] Privacy：
  - [ ] Single purpose。
  - [ ] Data usage disclosure。
  - [ ] Limited Use certification。
  - [ ] Remote code：选择不使用 remote code。注意 API 返回的是翻译文本，不应执行为代码。
  - [ ] Privacy policy URL。
- [ ] Distribution：
  - [ ] Visibility：建议先 `Private` 给 trusted testers，稳定后 `Public`。
  - [ ] Region：建议 `All regions`，除非第三方 API 可用性或合规原因需要限制。
  - [ ] Pricing：免费。
- [ ] Test instructions：
  - [ ] 提供测试步骤。
  - [ ] 如不愿提供真实 API key，可说明 reviewer 可使用自备 key；但为了降低审核摩擦，建议准备一个低额度测试 key，并在提交后轮换。

### 6.4 Test instructions 建议文本

```text
This extension translates YouTube English captions into Simplified Chinese using the user's own API key.

Test steps:
1. Install the extension.
2. Open the extension options page.
3. Choose Gemini, DeepSeek, or OpenRouter.
4. Enter a valid API key for the selected provider and save.
5. Open a YouTube video with English captions enabled.
6. Turn on captions in the YouTube player.
7. The extension should display a bilingual overlay with English source text and Simplified Chinese translation.
8. In options, adjust font size/opacity or reset overlay position to verify settings are saved locally.

Notes:
- The extension does not use a developer-operated backend.
- The API key is stored locally in Chrome storage.
- Caption text and nearby context are sent only to the selected provider over HTTPS to generate the translation.
- The extension does not execute remote code.
```

## 7. 风险点与规避建议

### 7.1 隐私披露不足

风险：插件读取字幕和页面内容，并发送给第三方 API。若商店描述和隐私政策没有清楚说明，可能被判定披露不足。

规避：

- 在详细描述和隐私政策都写明发送给 Gemini/DeepSeek/OpenRouter 的数据类型。
- Privacy tab 如实勾选 Website content / Web browsing activity 等相关项。
- 明确“开发者不运营服务器、不保存、不出售、不用于广告”。

### 7.2 API key 存储风险

风险：API key 保存在本机 Chrome storage；官方隐私建议避免在客户端保存敏感用户数据，虽然扩展 BYOK 常见，但必须清楚提示。

规避：

- 隐私政策和设置页都提示“不要在共享电脑保存个人 key”。
- 后续可考虑增加“一键清除所有 API key”按钮。
- 若未来实现，可选用 `chrome.storage.local` 加本机提示，不建议 sync。

### 7.3 第三方商标和误导性比较

风险：YouTube、Google、Gemini 等商标不可让用户误解为官方产品；也不要碰瓷竞品。

规避：

- 图标不使用官方 logo。
- 文案保留免责声明。
- 可以描述“具备常见高级/Pro 级视频双语字幕能力”，但不要写“官方”“同款”“替代某某”。

### 7.4 YouTube 页面结构变化

风险：YouTube DOM、Transcript API 或 caption track 结构变动会影响功能。

规避：

- 商店描述写明“依赖 YouTube 可读取字幕，不做音频识别”。
- 上架前准备 3-5 个测试视频覆盖普通字幕、ASR 字幕、Transcript 面板。
- 发布后监控 GitHub Issues。

### 7.5 审核时间延长

风险：2026-04 官方提示 submission 激增；新扩展和 host permissions 可能增加审核时间。

规避：

- 首次提交前一次性补齐 listing、隐私、图标、截图和测试说明。
- 不要频繁在审核中取消重提。
- 若审核超过 3 周，根据官方建议联系 developer support。

## 8. 建议分类、关键词与发布节奏

### 8.1 分类

首选：`Education`

理由：官方分类说明 Education 包含语言学习、教学辅助、笔记等；本插件面向课程学习和英文字幕理解，匹配度高。

备选：`Productivity`

理由：如果后续定位扩大到日常 YouTube 双语字幕效率工具，可考虑 Productivity。但当前“课程学习”定位更清晰。

### 8.2 关键词

中文关键词：

- YouTube 字幕翻译
- YouTube 双语字幕
- 英文课程翻译
- AI 字幕翻译
- 机器学习课程
- 强化学习课程
- Gemini 字幕翻译
- DeepSeek 字幕翻译
- OpenRouter 字幕翻译
- 自备 API key

英文关键词：

- YouTube captions
- bilingual subtitles
- Chinese translation
- AI translation
- context-aware translation
- lecture subtitles
- machine learning course
- reinforcement learning
- BYOK
- Gemini
- DeepSeek
- OpenRouter

注意：关键词应自然出现在描述中，不要堆砌。

### 8.3 推荐发布节奏

1. 先补图标、隐私政策、截图和 zip 打包脚本。
2. 用 `Private` visibility 提交一次，让 1-3 个 trusted testers 安装测试。
3. 解决测试反馈后，改为 `Public` 再提交审核。
4. 首版版本号建议 `0.1.0` 或 `0.2.0`；若上架前补图标和隐私但不改功能，可继续 `0.1.0`。如果已经上传过 draft 后又换包，递增版本号。
5. 发布后 1-2 周内只做小修，避免频繁增加权限。

## 9. 最小可执行材料清单

必须有：

- [ ] 发布 zip。
- [ ] `manifest.json` 图标字段和 PNG 图标。
- [ ] 商店图标 `128x128`。
- [ ] 至少 1 张 `1280x800` 截图。
- [ ] 小宣传图 `440x280`。
- [ ] 隐私政策 URL。
- [ ] Single purpose。
- [ ] 权限说明。
- [ ] 数据使用披露。
- [ ] 中文标题、短描述、详细描述。
- [ ] Reviewer test instructions。

强烈建议有：

- [ ] 5 张截图。
- [ ] Marquee `1400x560`。
- [ ] GitHub Pages 项目主页。
- [ ] GitHub Issues 支持链接。
- [ ] 一段演示视频。
- [ ] 低额度 reviewer 测试 API key，审核后轮换。

## 10. 建议下一步

1. 新增 `assets/` 图标目录和 `manifest.json` icons。
2. 新增 `docs/privacy-policy.md`，并发布到 GitHub Pages。
3. 新增 `scripts/package-extension.sh` 或 npm script，固定打包输出。
4. 本地录制/截图 5 张 `1280x800` 商店图。
5. 先以 Private trusted testers 提交，确认审核反馈后再 Public。
