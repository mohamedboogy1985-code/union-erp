# -*- coding: utf-8 -*-
"""Generate Union Financial ERP promotional videos from ``promo/voice.mp3``.

The script creates its own branded scenes, so no screenshots or scene artwork are
required. It exports a 1080p landscape video and a 9:16 Reels video. An optional
music track can be mixed quietly beneath the voice-over.

Examples:
    python promo/create_union_video.py
    python promo/create_union_video.py --music promo/music.mp3
    python promo/create_union_video.py --mode reels --music /path/to/music.mp3

Outputs:
    assets/promo/video/union-promo-wide.mp4
    assets/promo/video/union-promo-reels.mp4

Requirements:
    python -m pip install moviepy pillow numpy
"""

from __future__ import annotations

import argparse
import math
from pathlib import Path
from typing import Callable, Sequence

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

try:  # MoviePy 2.x
    from moviepy import (
        AudioFileClip,
        CompositeAudioClip,
        ImageClip,
        concatenate_audioclips,
        concatenate_videoclips,
    )
except ImportError:  # MoviePy 1.x
    from moviepy.editor import (  # type: ignore
        AudioFileClip,
        CompositeAudioClip,
        ImageClip,
        concatenate_audioclips,
        concatenate_videoclips,
    )


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_VOICE = ROOT / "promo" / "voice.mp3"
OUTPUT_DIR = ROOT / "assets" / "promo" / "video"
WIDE_OUTPUT = OUTPUT_DIR / "union-promo-wide.mp4"
REELS_OUTPUT = OUTPUT_DIR / "union-promo-reels.mp4"

NAVY = (7, 18, 36)
NAVY_LIGHT = (15, 35, 62)
BLUE = (30, 122, 255)
CYAN = (45, 212, 191)
GOLD = (217, 174, 115)
WHITE = (245, 249, 255)
MUTED = (164, 183, 207)
GREEN = (31, 201, 139)
RED = (248, 113, 113)

SCENE_WEIGHTS = (4.0, 5.0, 5.0, 5.0, 5.0, 6.0)


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    """Load an Arabic-capable font on Windows, macOS, or Linux."""
    bold_candidates = [
        "C:/Windows/Fonts/tahomabd.ttf",
        "C:/Windows/Fonts/arialbd.ttf",
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/truetype/noto/NotoSansArabic-Bold.ttf",
    ]
    regular_candidates = [
        "C:/Windows/Fonts/tahoma.ttf",
        "C:/Windows/Fonts/arial.ttf",
        "/System/Library/Fonts/Supplemental/Arial.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/noto/NotoSansArabic-Regular.ttf",
    ]
    for candidate in bold_candidates if bold else regular_candidates:
        try:
            return ImageFont.truetype(candidate, size)
        except OSError:
            continue
    return ImageFont.load_default()


def draw_text(
    draw: ImageDraw.ImageDraw,
    xy: tuple[float, float],
    text: str,
    size: int,
    fill: tuple[int, int, int] = WHITE,
    *,
    bold: bool = False,
    anchor: str = "mm",
    rtl: bool = False,
) -> None:
    """Draw text with RTL layout when Pillow was compiled with libraqm."""
    kwargs = {"font": font(size, bold), "fill": fill, "anchor": anchor}
    if rtl:
        kwargs.update({"direction": "rtl", "language": "ar"})
    try:
        draw.text(xy, text, **kwargs)
    except (KeyError, TypeError):
        kwargs.pop("direction", None)
        kwargs.pop("language", None)
        draw.text(xy, text, **kwargs)


def rounded_panel(
    draw: ImageDraw.ImageDraw,
    box: tuple[int, int, int, int],
    *,
    radius: int,
    fill: tuple[int, int, int, int] | tuple[int, int, int],
    outline: tuple[int, int, int, int] | tuple[int, int, int] | None = None,
    width: int = 1,
) -> None:
    draw.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=width)


def make_background(width: int, height: int, accent: tuple[int, int, int] = BLUE) -> Image.Image:
    """Create the shared Union dark-blue gradient, grid, and glow."""
    image = Image.new("RGB", (width, height), NAVY)
    pixels = image.load()
    for y in range(height):
        mix = y / max(height - 1, 1)
        row = tuple(int(NAVY[i] * (1 - mix) + NAVY_LIGHT[i] * mix) for i in range(3))
        for x in range(width):
            pixels[x, y] = row

    glow_size = int(min(width, height) * 0.9)
    glow = Image.new("RGBA", (glow_size, glow_size), (0, 0, 0, 0))
    glow_draw = ImageDraw.Draw(glow)
    glow_draw.ellipse(
        (glow_size * 0.12, glow_size * 0.12, glow_size * 0.88, glow_size * 0.88),
        fill=(*accent, 95),
    )
    glow = glow.filter(ImageFilter.GaussianBlur(glow_size // 5))
    image = image.convert("RGBA")
    image.alpha_composite(glow, (width - glow_size // 2, -glow_size // 3))

    draw = ImageDraw.Draw(image)
    step = max(48, width // 24)
    for x in range(0, width, step):
        draw.line((x, 0, x, height), fill=(87, 132, 183, 18), width=1)
    for y in range(0, height, step):
        draw.line((0, y, width, y), fill=(87, 132, 183, 18), width=1)
    return image


def draw_brand(draw: ImageDraw.ImageDraw, width: int, height: int, vertical: bool) -> None:
    pad = int(width * (0.065 if vertical else 0.045))
    mark = int(min(width, height) * (0.055 if vertical else 0.065))
    x, y = pad, pad
    rounded_panel(draw, (x, y, x + mark, y + mark), radius=mark // 4, fill=(*BLUE, 230))
    draw.line((x + mark * 0.28, y + mark * 0.28, x + mark * 0.5, y + mark * 0.72), fill=WHITE, width=max(4, mark // 12))
    draw.line((x + mark * 0.72, y + mark * 0.28, x + mark * 0.5, y + mark * 0.72), fill=WHITE, width=max(4, mark // 12))
    draw_text(
        draw,
        (x + mark + mark * 0.32, y + mark * 0.47),
        "UNION FINANCIAL ERP",
        max(22, int(mark * 0.38)),
        bold=True,
        anchor="lm",
    )


def draw_footer(draw: ImageDraw.ImageDraw, width: int, height: int, scene_number: int) -> None:
    pad = int(width * 0.05)
    y = height - int(height * 0.05)
    draw_text(draw, (pad, y), "UNION // FINANCIAL_INTELLIGENCE", max(16, width // 75), MUTED, anchor="lm")
    draw_text(draw, (width - pad, y), f"0{scene_number} / 06", max(16, width // 75), CYAN, bold=True, anchor="rm")


def scene_opening(width: int, height: int, vertical: bool) -> Image.Image:
    image = make_background(width, height)
    draw = ImageDraw.Draw(image)
    draw_brand(draw, width, height, vertical)
    center_y = height * (0.47 if vertical else 0.48)
    title_size = int(min(width, height) * (0.096 if vertical else 0.105))
    draw_text(draw, (width / 2, center_y - title_size * 0.55), "Union Financial ERP", title_size, WHITE, bold=True)
    draw_text(
        draw,
        (width / 2, center_y + title_size * 0.65),
        "مستقبل الإدارة المالية للنقابات",
        int(title_size * 0.48),
        CYAN,
        bold=True,
        rtl=True,
    )
    line_width = int(width * (0.38 if vertical else 0.23))
    draw.line((width / 2 - line_width / 2, center_y + title_size * 1.35, width / 2 + line_width / 2, center_y + title_size * 1.35), fill=(*BLUE, 220), width=max(3, width // 500))
    draw_footer(draw, width, height, 1)
    return image.convert("RGB")


def scene_dashboard(width: int, height: int, vertical: bool) -> Image.Image:
    image = make_background(width, height, CYAN)
    draw = ImageDraw.Draw(image)
    draw_brand(draw, width, height, vertical)
    pad = int(width * 0.07)
    top = int(height * (0.19 if vertical else 0.18))
    draw_text(draw, (width - pad, top), "كل أرقامك في لوحة قيادة واحدة", int(min(width, height) * 0.055), WHITE, bold=True, anchor="ra", rtl=True)

    labels = [("الإيرادات", "1,250,000", GREEN), ("المصروفات", "420,000", RED), ("صافي الفائض", "830,000", CYAN)]
    if vertical:
        card_w, card_h, gap = width - 2 * pad, int(height * 0.125), int(height * 0.025)
        start_y = int(height * 0.31)
        boxes = [(pad, start_y + i * (card_h + gap), pad + card_w, start_y + i * (card_h + gap) + card_h) for i in range(3)]
    else:
        gap = int(width * 0.02)
        card_w = int((width - 2 * pad - 2 * gap) / 3)
        card_h = int(height * 0.28)
        start_y = int(height * 0.37)
        boxes = [(pad + i * (card_w + gap), start_y, pad + i * (card_w + gap) + card_w, start_y + card_h) for i in range(3)]

    for (label, amount, color), box in zip(labels, boxes):
        rounded_panel(draw, box, radius=max(20, width // 70), fill=(14, 31, 54, 235), outline=(*color, 150), width=max(2, width // 700))
        x1, y1, x2, y2 = box
        if vertical:
            draw_text(draw, (x2 - card_w * 0.07, y1 + card_h * 0.35), label, int(card_h * 0.18), MUTED, anchor="ra", rtl=True)
            draw_text(draw, (x2 - card_w * 0.07, y1 + card_h * 0.68), amount + " ج.م", int(card_h * 0.23), color, bold=True, anchor="ra", rtl=True)
            draw.ellipse((x1 + card_w * 0.07, y1 + card_h * 0.33, x1 + card_w * 0.18, y1 + card_h * 0.67), fill=(*color, 220))
        else:
            draw_text(draw, ((x1 + x2) / 2, y1 + card_h * 0.3), label, int(card_h * 0.13), MUTED, rtl=True)
            draw_text(draw, ((x1 + x2) / 2, y1 + card_h * 0.58), amount, int(card_h * 0.19), color, bold=True)
            draw_text(draw, ((x1 + x2) / 2, y1 + card_h * 0.78), "جنيه مصري", int(card_h * 0.1), MUTED, rtl=True)
    draw_footer(draw, width, height, 2)
    return image.convert("RGB")


def scene_accounting(width: int, height: int, vertical: bool) -> Image.Image:
    image = make_background(width, height, BLUE)
    draw = ImageDraw.Draw(image)
    draw_brand(draw, width, height, vertical)
    title_y = int(height * 0.20)
    draw_text(draw, (width / 2, title_y), "قيد مزدوج. دقة كاملة. لحظياً.", int(min(width, height) * 0.058), WHITE, bold=True, rtl=True)

    pad = int(width * 0.08)
    panel = (pad, int(height * 0.31), width - pad, int(height * 0.78))
    rounded_panel(draw, panel, radius=max(24, width // 60), fill=(12, 28, 50, 240), outline=(*BLUE, 140), width=max(2, width // 700))
    x1, y1, x2, y2 = panel
    row_count = 4
    row_h = (y2 - y1) / (row_count + 1)
    headers = ["الحساب", "مدين", "دائن"]
    header_x = [x2 - (x2 - x1) * 0.16, x1 + (x2 - x1) * 0.48, x1 + (x2 - x1) * 0.16]
    for text, x in zip(headers, header_x):
        draw_text(draw, (x, y1 + row_h * 0.62), text, int(row_h * 0.25), MUTED, bold=True, rtl=True)
    draw.line((x1 + 30, y1 + row_h, x2 - 30, y1 + row_h), fill=(75, 111, 151, 120), width=2)
    rows = [("البنك", "25,000", "—"), ("إيرادات الاشتراكات", "—", "25,000"), ("الإجمالي", "25,000", "25,000")]
    for index, row in enumerate(rows):
        cy = y1 + row_h * (index + 1.65)
        color = CYAN if index == 2 else WHITE
        for text, x in zip(row, header_x):
            draw_text(draw, (x, cy), text, int(row_h * (0.25 if vertical else 0.23)), color, bold=index == 2, rtl=True)
        if index < 2:
            draw.line((x1 + 30, y1 + row_h * (index + 2), x2 - 30, y1 + row_h * (index + 2)), fill=(75, 111, 151, 70), width=1)
    badge_w = int(width * (0.44 if vertical else 0.22))
    badge_h = int(height * 0.055)
    bx = (width - badge_w) // 2
    by = int(height * 0.82)
    rounded_panel(draw, (bx, by, bx + badge_w, by + badge_h), radius=badge_h // 2, fill=(*GREEN, 45), outline=(*GREEN, 170), width=2)
    draw_text(draw, (width / 2, by + badge_h / 2), "القيد متوازن وجاهز للترحيل", int(badge_h * 0.34), GREEN, bold=True, rtl=True)
    draw_footer(draw, width, height, 3)
    return image.convert("RGB")


def scene_ai(width: int, height: int, vertical: bool) -> Image.Image:
    image = make_background(width, height, (129, 92, 246))
    draw = ImageDraw.Draw(image)
    draw_brand(draw, width, height, vertical)
    draw_text(draw, (width / 2, height * 0.22), "ذكاء اصطناعي يعمل معك", int(min(width, height) * 0.065), WHITE, bold=True, rtl=True)
    features = [("AI", "مساعد محاسبي"), ("OCR", "قراءة المستندات"), ("VOICE", "إدخال القيود صوتياً"), ("LIVE", "تحليلات فورية")]
    pad = int(width * 0.09)
    gap = int(min(width, height) * 0.035)
    if vertical:
        card_w = (width - 2 * pad - gap) // 2
        card_h = int(height * 0.19)
        boxes = []
        for i in range(4):
            col, row = i % 2, i // 2
            x = pad + col * (card_w + gap)
            y = int(height * 0.34) + row * (card_h + gap)
            boxes.append((x, y, x + card_w, y + card_h))
    else:
        card_w = (width - 2 * pad - 3 * gap) // 4
        card_h = int(height * 0.32)
        y = int(height * 0.39)
        boxes = [(pad + i * (card_w + gap), y, pad + i * (card_w + gap) + card_w, y + card_h) for i in range(4)]

    for (code, label), box in zip(features, boxes):
        x1, y1, x2, y2 = box
        rounded_panel(draw, box, radius=max(20, width // 70), fill=(18, 31, 58, 235), outline=(146, 117, 255, 150), width=2)
        circle = int(min(x2 - x1, y2 - y1) * 0.35)
        cx, cy = (x1 + x2) // 2, int(y1 + (y2 - y1) * 0.36)
        draw.ellipse((cx - circle // 2, cy - circle // 2, cx + circle // 2, cy + circle // 2), fill=(111, 77, 219, 150), outline=(180, 160, 255, 220), width=2)
        draw_text(draw, (cx, cy), code, max(17, int(circle * 0.25)), WHITE, bold=True)
        draw_text(draw, (cx, y1 + (y2 - y1) * 0.74), label, max(17, int(min(width, height) * 0.025)), CYAN, bold=True, rtl=True)
    draw_footer(draw, width, height, 4)
    return image.convert("RGB")


def scene_everywhere(width: int, height: int, vertical: bool) -> Image.Image:
    image = make_background(width, height, CYAN)
    draw = ImageDraw.Draw(image)
    draw_brand(draw, width, height, vertical)
    draw_text(draw, (width / 2, height * 0.21), "آمن. متصل. جاهز دائماً.", int(min(width, height) * 0.063), WHITE, bold=True, rtl=True)
    items = [("01", "يعمل دون إنترنت"), ("02", "مزامنة آمنة"), ("03", "عربي وإنجليزي")]
    pad = int(width * 0.10)
    if vertical:
        box_h = int(height * 0.135)
        gap = int(height * 0.035)
        boxes = [(pad, int(height * 0.34) + i * (box_h + gap), width - pad, int(height * 0.34) + i * (box_h + gap) + box_h) for i in range(3)]
    else:
        gap = int(width * 0.025)
        box_w = (width - 2 * pad - 2 * gap) // 3
        box_h = int(height * 0.30)
        y = int(height * 0.40)
        boxes = [(pad + i * (box_w + gap), y, pad + i * (box_w + gap) + box_w, y + box_h) for i in range(3)]
    for (number, label), box in zip(items, boxes):
        x1, y1, x2, y2 = box
        rounded_panel(draw, box, radius=max(20, width // 70), fill=(12, 30, 51, 235), outline=(*CYAN, 130), width=2)
        if vertical:
            draw_text(draw, (x1 + (x2 - x1) * 0.14, (y1 + y2) / 2), number, int((y2 - y1) * 0.28), CYAN, bold=True)
            draw_text(draw, (x2 - (x2 - x1) * 0.08, (y1 + y2) / 2), label, int((y2 - y1) * 0.20), WHITE, bold=True, anchor="rm", rtl=True)
        else:
            draw_text(draw, ((x1 + x2) / 2, y1 + (y2 - y1) * 0.34), number, int((y2 - y1) * 0.22), CYAN, bold=True)
            draw_text(draw, ((x1 + x2) / 2, y1 + (y2 - y1) * 0.68), label, int((y2 - y1) * 0.15), WHITE, bold=True, rtl=True)
    draw_footer(draw, width, height, 5)
    return image.convert("RGB")


def scene_closing(width: int, height: int, vertical: bool) -> Image.Image:
    image = make_background(width, height, GOLD)
    draw = ImageDraw.Draw(image)
    draw_brand(draw, width, height, vertical)
    center = height * 0.47
    draw_text(draw, (width / 2, center - height * 0.09), "Union Financial ERP", int(min(width, height) * 0.095), WHITE, bold=True)
    draw_text(draw, (width / 2, center + height * 0.015), "قرار مالي أسرع. رقابة أدق. أثر أكبر.", int(min(width, height) * 0.043), GOLD, bold=True, rtl=True)
    button_w = int(width * (0.62 if vertical else 0.30))
    button_h = int(height * (0.065 if vertical else 0.075))
    bx, by = (width - button_w) // 2, int(center + height * 0.105)
    rounded_panel(draw, (bx, by, bx + button_w, by + button_h), radius=button_h // 2, fill=(*BLUE, 240), outline=(121, 184, 255, 220), width=2)
    draw_text(draw, (width / 2, by + button_h / 2), "ابدأ التحول الرقمي اليوم", int(button_h * 0.34), WHITE, bold=True, rtl=True)
    draw_text(draw, (width / 2, by + button_h * 1.75), "إنشاء وتنفيذ: محمد عبد الله أحمد", int(button_h * 0.25), MUTED, rtl=True)
    draw_footer(draw, width, height, 6)
    return image.convert("RGB")


SCENE_BUILDERS: Sequence[Callable[[int, int, bool], Image.Image]] = (
    scene_opening,
    scene_dashboard,
    scene_accounting,
    scene_ai,
    scene_everywhere,
    scene_closing,
)


def with_duration(clip, duration: float):
    return clip.with_duration(duration) if hasattr(clip, "with_duration") else clip.set_duration(duration)


def with_audio(video, audio):
    return video.with_audio(audio) if hasattr(video, "with_audio") else video.set_audio(audio)


def with_volume(audio, factor: float):
    return audio.with_volume_scaled(factor) if hasattr(audio, "with_volume_scaled") else audio.volumex(factor)


def subclip(clip, start: float, end: float):
    return clip.subclipped(start, end) if hasattr(clip, "subclipped") else clip.subclip(start, end)


def loop_to_duration(audio, duration: float):
    if audio.duration >= duration:
        return subclip(audio, 0, duration)
    repetitions = math.ceil(duration / audio.duration)
    return subclip(concatenate_audioclips([audio] * repetitions), 0, duration)


def build_video(
    mode: str,
    voice_path: Path,
    music_path: Path | None,
    music_volume: float,
    fps: int,
) -> Path:
    vertical = mode == "reels"
    width, height = (1080, 1920) if vertical else (1920, 1080)
    output = REELS_OUTPUT if vertical else WIDE_OUTPUT
    output.parent.mkdir(parents=True, exist_ok=True)

    voice = AudioFileClip(str(voice_path))
    music = None
    music_loop = None
    audio_mix = None
    clips = []
    video = None
    final_video = None
    try:
        duration_scale = voice.duration / sum(SCENE_WEIGHTS)
        durations = [weight * duration_scale for weight in SCENE_WEIGHTS]
        for builder, duration in zip(SCENE_BUILDERS, durations):
            frame = np.asarray(builder(width, height, vertical))
            clips.append(with_duration(ImageClip(frame), duration))

        video = concatenate_videoclips(clips, method="compose")
        if music_path:
            music = AudioFileClip(str(music_path))
            music_loop = with_volume(loop_to_duration(music, voice.duration), music_volume)
            audio_mix = CompositeAudioClip([music_loop, voice])
        else:
            audio_mix = voice

        final_video = with_audio(video, audio_mix)
        final_video.write_videofile(
            str(output),
            fps=fps,
            codec="libx264",
            audio_codec="aac",
            preset="medium",
            threads=4,
        )
    finally:
        if final_video is not None:
            final_video.close()
        elif video is not None:
            video.close()
        for clip in clips:
            clip.close()
        if audio_mix is not None and audio_mix is not voice:
            audio_mix.close()
        if music_loop is not None:
            music_loop.close()
        if music is not None:
            music.close()
        voice.close()

    print(f"Created: {output}")
    return output


def main():
    parser = argparse.ArgumentParser(description="Generate Union Financial ERP promotional MP4 videos")
    parser.add_argument("--voice", type=Path, default=DEFAULT_VOICE, help="Voice-over file (default: promo/voice.mp3)")
    parser.add_argument("--music", type=Path, help="Optional background music file")
    parser.add_argument("--mode", choices=("wide", "reels", "both"), default="both", help="Video format to render")
    parser.add_argument("--music-volume", type=float, default=0.14, help="Background music volume, from 0 to 1")
    parser.add_argument("--fps", type=int, default=30, help="Output frames per second")
    args = parser.parse_args()

    voice_path = args.voice.expanduser().resolve()
    music_path = args.music.expanduser().resolve() if args.music else None
    if not voice_path.is_file():
        parser.error(f"Voice-over file not found: {voice_path}")
    if music_path and not music_path.is_file():
        parser.error(f"Music file not found: {music_path}")
    if not 0 <= args.music_volume <= 1:
        parser.error("--music-volume must be between 0 and 1")
    if args.fps <= 0:
        parser.error("--fps must be greater than zero")

    modes = ("wide", "reels") if args.mode == "both" else (args.mode,)
    for mode in modes:
        build_video(mode, voice_path, music_path, args.music_volume, args.fps)


if __name__ == "__main__":
    main()
