# YouTube Context Translator 隐私政策

生效日期：2026-06-09

YouTube Context Translator 是一个 Chrome 扩展，用于在 YouTube 视频页面读取英文字幕和字幕时间轴，并生成同步的简体中文字幕覆盖层，帮助中文用户学习英文课程视频。

## 我们处理哪些数据

扩展会在本机处理以下数据：

- YouTube 当前视频的字幕文本、相邻字幕上下文和 Transcript/字幕时间轴。
- 当前视频的必要元数据，例如视频标题、频道名、URL 或 video id。
- 用户设置，包括 API provider、模型名称、上下文字幕条数、字幕样式、字幕框位置和自定义翻译偏好。
- 用户填写的 Gemini、DeepSeek 或 OpenRouter API key。

扩展不会主动收集用户姓名、邮箱、电话、付款信息、精确位置、健康信息、YouTube 账号凭据、评论、订阅或私密消息。

## 数据如何使用

扩展仅将上述数据用于以下用户可见功能：

- 生成 YouTube 字幕的简体中文翻译。
- 结合相邻字幕上下文改善术语、代词、省略主语和短句歧义。
- 保存用户选择的模型、字幕显示样式和翻译偏好。
- 使用用户选择的第三方 API provider 发起翻译请求。

## 数据如何存储

- API key 和设置保存在用户本机 Chrome storage 中。
- 开发者不运营翻译中转服务器。
- 开发者不接收、不保存、不出售用户 API key、字幕文本或浏览数据。
- 扩展可能在本机内存中临时缓存翻译结果，用于减少重复请求；该缓存不会上传到开发者服务器。

请不要在共享电脑或不可信设备上保存个人 API key。

## 数据如何传输给第三方

当用户启用扩展并配置 API key 后，扩展会通过 HTTPS 将当前字幕文本、相邻字幕上下文、必要视频元数据和用户自定义翻译偏好发送给用户选择的 API provider：

- Gemini API：<https://ai.google.dev/>
- DeepSeek API：<https://api-docs.deepseek.com/>
- OpenRouter：<https://openrouter.ai/>

第三方 API provider 对数据的处理受其各自服务条款和隐私政策约束。用户应自行确认所选 provider 的数据保留、训练使用、地区可用性和计费规则。

## 数据共享与出售

开发者不会：

- 将用户数据出售给第三方。
- 将用户数据用于广告、个性化广告或重定向广告。
- 将用户数据转交给数据经纪商。
- 将用户数据用于信用评估、贷款资格或类似用途。
- 将用户数据用于与字幕翻译无关的目的。

## Limited Use 声明

本扩展对用户数据的使用仅限于提供和改进插件的单一用途：在 YouTube 视频页面生成同步简体中文字幕。除法律、安全、用户明确授权的支持请求或 Chrome Web Store 政策允许的情形外，开发者不会人工读取用户数据。当前扩展没有开发者服务器侧数据可读。

## 用户控制

用户可以：

- 在扩展设置中删除或替换 API key。
- 关闭扩展开关，停止字幕翻译。
- 在 Chrome 扩展管理页面停用或移除扩展。
- 移除扩展后，通过 Chrome 清除该扩展保存在本机的相关数据。

## 联系方式

如有隐私或支持问题，请通过 GitHub Issues 联系：

<https://github.com/pfr223/chrome-plugin/issues>

## 免责声明

YouTube Context Translator 不是 YouTube、Google、Gemini、DeepSeek、OpenRouter 或任何其他第三方服务的官方产品，也未获得这些服务的官方背书。YouTube 及相关名称是其各自所有者的商标。
