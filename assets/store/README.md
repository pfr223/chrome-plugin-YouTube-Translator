# Chrome Web Store 素材

运行以下命令生成图标、宣传图和草稿截图：

```bash
npm run assets
```

生成文件：

- `assets/store/icon128.png`：Chrome Web Store 商店图标，128x128，透明背景。
- `assets/store/small-promo-440x280.jpg`：小宣传图。
- `assets/store/marquee-1400x560.jpg`：Marquee 宣传图。
- `assets/store/screenshots/*.jpg`：1280x800 草稿截图。

注意：`screenshots/` 内的图片是可替换的上架草稿图。正式提交前，建议用真实 YouTube 使用画面替换，至少包含：

1. YouTube 视频播放页，英文字幕 + 中文字幕 overlay 同步显示。
2. 设置页 provider 选择：Gemini / DeepSeek / OpenRouter。
3. 自定义术语/课程偏好：ML/AI/RL 术语一致性。
4. 字幕样式和位置：透明度、字号、拖动字幕框。
5. Transcript 时间轴模式。
