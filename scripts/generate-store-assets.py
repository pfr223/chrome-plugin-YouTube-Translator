#!/usr/bin/env python3
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
ICON_DIR = ROOT / "assets" / "icons"
STORE_DIR = ROOT / "assets" / "store"
SCREENSHOT_DIR = STORE_DIR / "screenshots"

COLORS = {
    "navy": (16, 32, 51, 255),
    "navy2": (21, 43, 69, 255),
    "coral": (232, 72, 85, 255),
    "coral2": (255, 111, 97, 255),
    "teal": (13, 179, 158, 255),
    "teal2": (79, 209, 197, 255),
    "white": (246, 250, 255, 255),
    "muted": (174, 191, 214, 255),
    "gold": (255, 209, 102, 255),
}


def font(size, bold=False):
    candidates = [
        "/System/Library/Fonts/STHeiti Medium.ttc",
        "/System/Library/Fonts/Supplemental/Arial Unicode.ttf",
        "/Library/Fonts/Arial Unicode.ttf",
        "/System/Library/Fonts/Helvetica.ttc",
    ]
    for path in candidates:
        if Path(path).exists():
            return ImageFont.truetype(path, size=size)
    return ImageFont.load_default()


def text_size(draw, xy, text, font_obj):
    box = draw.textbbox(xy, text, font=font_obj)
    return box[2] - box[0], box[3] - box[1]


def centered_text(draw, box, text, font_obj, fill):
    x1, y1, x2, y2 = box
    w, h = text_size(draw, (0, 0), text, font_obj)
    draw.text((x1 + (x2 - x1 - w) / 2, y1 + (y2 - y1 - h) / 2 - 2), text, font=font_obj, fill=fill)


def draw_lines(draw, xy, lines, font_obj, fill, line_gap):
    x, y = xy
    for line in lines:
        draw.text((x, y), line, font=font_obj, fill=fill)
        _, line_h = text_size(draw, (0, 0), line, font_obj)
        y += line_h + line_gap
    return y


def draw_icon(size):
    scale = size / 128
    image = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)

    def s(value):
        return round(value * scale)

    draw.rounded_rectangle([s(14), s(16), s(114), s(112)], radius=s(24), fill=COLORS["navy"])
    draw.polygon([(s(45), s(34)), (s(45), s(71)), (s(79), s(52.5))], fill=COLORS["coral2"])
    draw.rounded_rectangle([s(30), s(72), s(98), s(84)], radius=s(6), fill=COLORS["white"])
    draw.rounded_rectangle([s(30), s(88), s(98), s(106)], radius=s(9), fill=COLORS["teal"])
    if size >= 32:
        centered_text(draw, [s(30), s(70), s(98), s(85)], "EN", font(max(7, s(10)), True), COLORS["navy"])
    centered_text(draw, [s(30), s(87), s(98), s(107)], "中", font(max(10, s(16)), True), COLORS["white"])
    draw.line([s(91), s(22), s(91), s(40)], fill=(158, 231, 255, 255), width=max(1, s(3)))
    draw.line([s(82), s(31), s(100), s(31)], fill=(158, 231, 255, 255), width=max(1, s(3)))
    draw.ellipse([s(88), s(28), s(94), s(34)], fill=(158, 231, 255, 255))
    draw.ellipse([s(98), s(44), s(104), s(50)], fill=COLORS["gold"])
    return image


def save_icons():
    ICON_DIR.mkdir(parents=True, exist_ok=True)
    STORE_DIR.mkdir(parents=True, exist_ok=True)
    for size in (16, 32, 48, 128):
        draw_icon(size).save(ICON_DIR / f"icon{size}.png")
    draw_icon(128).save(STORE_DIR / "icon128.png")


def draw_browser_frame(draw, box):
    x1, y1, x2, y2 = box
    draw.rounded_rectangle(box, radius=14, fill=(245, 248, 252, 255))
    draw.rectangle([x1, y1 + 42, x2, y2], fill=(12, 18, 28, 255))
    for i, color in enumerate([(255, 95, 87, 255), (255, 189, 46, 255), (40, 201, 64, 255)]):
        cx = x1 + 24 + i * 20
        draw.ellipse([cx - 6, y1 + 15, cx + 6, y1 + 27], fill=color)
    draw.rounded_rectangle([x1 + 110, y1 + 12, x2 - 26, y1 + 30], radius=9, fill=(225, 232, 240, 255))


def draw_player(draw, box):
    x1, y1, x2, y2 = box
    width = x2 - x1
    height = y2 - y1
    pad = max(8, round(width * 0.035))
    controls_h = max(22, round(height * 0.11))
    caption_w = width * 0.72
    caption_h = max(34, round(height * 0.16))
    caption_x1 = round(x1 + (width - caption_w) / 2)
    caption_x2 = round(x1 + (width + caption_w) / 2)
    caption_y2 = round(y1 + height * 0.65)
    caption_y1 = caption_y2 - caption_h
    source_font_size = max(8, round(height * 0.045))
    target_font_size = max(9, round(height * 0.052))
    draw.rounded_rectangle(box, radius=10, fill=(8, 12, 18, 255))
    draw.rectangle([x1, y2 - controls_h, x2, y2], fill=(15, 22, 32, 255))
    draw.line([x1 + pad, y2 - controls_h // 2, x2 - pad, y2 - controls_h // 2], fill=COLORS["coral2"], width=max(2, round(height * 0.01)))
    knob_x = x1 + round(width * 0.22)
    draw.ellipse([knob_x - 5, y2 - controls_h // 2 - 5, knob_x + 5, y2 - controls_h // 2 + 5], fill=COLORS["white"])
    play_x = x1 + pad * 2
    play_y = y2 - controls_h // 2
    draw.polygon([(play_x, play_y - 10), (play_x, play_y + 10), (play_x + 16, play_y)], fill=COLORS["white"])
    draw.rounded_rectangle([caption_x1, caption_y1, caption_x2, caption_y2], radius=max(8, round(caption_h * 0.18)), fill=(8, 8, 8, 218))
    centered_text(draw, [caption_x1 + pad, caption_y1 + 4, caption_x2 - pad, caption_y1 + caption_h // 2], "the q value is updated at this point of time", font(source_font_size), COLORS["white"])
    centered_text(draw, [caption_x1 + pad, caption_y1 + caption_h // 2, caption_x2 - pad, caption_y2 - 3], "Q 值会在这个时间点被更新", font(target_font_size, True), (196, 255, 244, 255))


def draw_promo(size, filename, title, subtitle):
    image = Image.new("RGBA", size, COLORS["navy"])
    draw = ImageDraw.Draw(image)
    w, h = size
    draw.rectangle([0, 0, w, h], fill=COLORS["navy"])
    draw.rounded_rectangle([w * 0.52, h * 0.16, w * 0.94, h * 0.84], radius=24, fill=COLORS["navy2"])
    draw_player(draw, [round(w * 0.55), round(h * 0.24), round(w * 0.91), round(h * 0.75)])
    icon_size = round(min(w, h) * (0.2 if w < 600 else 0.22))
    draw_icon(icon_size).save(STORE_DIR / "_tmp_icon.png")
    icon = Image.open(STORE_DIR / "_tmp_icon.png")
    image.alpha_composite(icon, (round(w * 0.08), round(h * (0.16 if w < 600 else 0.18))))
    (STORE_DIR / "_tmp_icon.png").unlink(missing_ok=True)
    text_x = round(w * 0.08)
    if w < 600:
        title_lines = ["YouTube 课程", "双语字幕"]
        y = draw_lines(draw, (text_x, round(h * 0.42)), title_lines, font(30, True), COLORS["white"], 3)
        draw.text((text_x, y + 8), subtitle, font=font(13), fill=(190, 205, 225, 255))
        draw.text((text_x, y + 34), "BYOK · Gemini / DeepSeek / OpenRouter", font=font(12, True), fill=COLORS["teal2"])
    else:
        title_lines = ["把英文课程字幕", "同步翻成中文"] if "同步翻成中文" in title else [title]
        y = draw_lines(draw, (text_x, round(h * 0.36)), title_lines, font(round(h * 0.088), True), COLORS["white"], 10)
        subtitle_lines = ["读取 Transcript 时间轴", "结合上下文生成连贯中文字幕"]
        y = draw_lines(draw, (text_x, y + 18), subtitle_lines, font(round(h * 0.038)), (190, 205, 225, 255), 8)
        draw.text((text_x, y + 20), "BYOK · Gemini / DeepSeek / OpenRouter", font=font(round(h * 0.04), True), fill=COLORS["teal2"])
    image.convert("RGB").save(STORE_DIR / filename, quality=92)


def draw_screenshot(filename, title, subtitle, variant):
    image = Image.new("RGB", (1280, 800), (232, 237, 244))
    draw = ImageDraw.Draw(image)
    draw_browser_frame(draw, [64, 52, 1216, 748])
    if variant == "player":
        draw_player(draw, [124, 140, 1156, 650])
    elif variant == "settings":
        draw.rounded_rectangle([140, 140, 1140, 650], radius=14, fill=(255, 255, 255))
        draw.text((180, 180), "YouTube Context Translator", font=font(32, True), fill=COLORS["navy"])
        tabs = ["Gemini", "DeepSeek", "OpenRouter"]
        for idx, tab in enumerate(tabs):
            x = 180 + idx * 150
            fill = COLORS["teal"] if idx == 0 else (226, 232, 240, 255)
            text_fill = COLORS["white"] if idx == 0 else COLORS["navy"]
            draw.rounded_rectangle([x, 240, x + 126, 282], radius=12, fill=fill)
            centered_text(draw, [x, 240, x + 126, 282], tab, font(18, True), text_fill)
        labels = ["API key 仅保存在本机 Chrome storage", "模型：gemini-2.5-flash-lite", "上下文字幕条数：8", "翻译偏好：保留 RL / MDP / Q value 等术语"]
        for idx, label in enumerate(labels):
            y = 330 + idx * 62
            draw.text((190, y), label, font=font(23), fill=COLORS["navy"])
            draw.rounded_rectangle([610, y - 8, 1060, y + 28], radius=8, fill=(241, 245, 249, 255))
    elif variant == "learning":
        draw.rounded_rectangle([132, 142, 570, 642], radius=14, fill=(255, 255, 255))
        draw.rounded_rectangle([612, 142, 1148, 642], radius=14, fill=(255, 255, 255))
        terms = ["reinforcement learning", "Markov decision process", "Q value", "epsilon-greedy", "SARSA"]
        translations = ["强化学习", "马尔可夫决策过程", "Q 值", "ε-贪心", "SARSA"]
        draw.text((172, 184), "上下文术语", font=font(28, True), fill=COLORS["navy"])
        draw.text((652, 184), "同步翻译", font=font(28, True), fill=COLORS["navy"])
        for idx, term in enumerate(terms):
            y = 250 + idx * 62
            draw.text((172, y), term, font=font(24), fill=COLORS["navy"])
            draw.text((652, y), translations[idx], font=font(24, True), fill=COLORS["teal"])
    draw.text((96, 86), title, font=font(34, True), fill=COLORS["white"])
    draw.text((96, 704), subtitle, font=font(24), fill=(72, 88, 110))
    image.save(SCREENSHOT_DIR / filename, quality=92)


def save_store_assets():
    STORE_DIR.mkdir(parents=True, exist_ok=True)
    SCREENSHOT_DIR.mkdir(parents=True, exist_ok=True)
    draw_promo((440, 280), "small-promo-440x280.jpg", "YouTube 课程双语字幕", "上下文修正术语，适合技术课程学习")
    draw_promo((1400, 560), "marquee-1400x560.jpg", "把英文课程字幕同步翻成中文", "读取 Transcript 时间轴，结合上下文生成更连贯的简体中文字幕")
    draw_screenshot("screenshot-01-player-draft-1280x800.jpg", "同步双语字幕覆盖层", "草稿图：发布前建议替换为真实 YouTube 使用截图。", "player")
    draw_screenshot("screenshot-02-settings-draft-1280x800.jpg", "用户自备 API key", "支持 Gemini、DeepSeek、OpenRouter；API key 保存在本机。", "settings")
    draw_screenshot("screenshot-03-learning-draft-1280x800.jpg", "面向 ML / AI / RL 课程学习", "结合上下文减少术语漂移，适合英文公开课。", "learning")


def main():
    save_icons()
    save_store_assets()
    print(f"Generated assets under {ICON_DIR} and {STORE_DIR}")


if __name__ == "__main__":
    main()
