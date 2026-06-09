# Chrome Web Store Reviewer Test Instructions

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

## 中文备注

如果希望降低审核摩擦，可以准备一个低额度测试 API key，在 Dashboard 的 reviewer notes 中提供给审核员。审核通过后应立即轮换或删除该 key。
