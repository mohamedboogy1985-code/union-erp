# -*- coding: utf-8 -*-
"""
إنشاء فيديو إعلان محاسبك AI باستخدام ملف موسيقى من جهازك + التعليق الصوتي الحالي.

أمثلة تشغيل:
python promo/create-video-with-music.py --music "C:\\Users\\HP\\Desktop\\music.mp3" --mode wide
python promo/create-video-with-music.py --music "C:\\Users\\HP\\Desktop\\music.mp3" --mode reels
python promo/create-video-with-music.py --music "C:\\Users\\HP\\Desktop\\music.mp3" --mode both

المخرجات:
promo/mohasbak-ai-video-with-your-music.mp4
promo/mohasbak-ai-reels-with-your-music.mp4
"""

from pathlib import Path
import argparse
import math

from PIL import Image, ImageDraw, ImageFont
import arabic_reshaper
from bidi.algorithm import get_display
from moviepy import ImageClip, AudioFileClip, CompositeAudioClip, concatenate_audioclips, concatenate_videoclips

ROOT = Path(__file__).resolve().parents[1]
PROMO = ROOT / "promo"

WIDE_SCENES = [
    (PROMO / "generated-scenes" / "scene-01-problem.png", 8, "تعبت من الحسابات اليدوية؟"),
    (PROMO / "generated-scenes" / "scene-02-solution.png", 8, "مرحبًا بك في محاسبك AI"),
    (PROMO / "generated-scenes" / "scene-03-voice-ai.png", 12, "إدخال صوتي وقيد مزدوج فوري"),
    (PROMO / "generated-scenes" / "scene-04-allocation-qr.png", 12, "توزيع تلقائي للحصص + QR"),
    (PROMO / "generated-scenes" / "scene-05-offline-sync.png", 10, "يعمل بدون إنترنت ثم يتزامن"),
    (PROMO / "generated-scenes" / "scene-06-end-card.png", 10, "محاسبك AI — Web & Desktop"),
]

REELS_SCENES = [
    (PROMO / "generated-scenes" / "scene-01-problem.png", 3, "لسه بتحسب يدوي؟"),
    (PROMO / "generated-scenes" / "scene-02-solution.png", 4, "محاسبك AI"),
    (PROMO / "generated-scenes" / "scene-03-voice-ai.png", 5, "اتكلم فقط 🎙️"),
    (PROMO / "generated-scenes" / "scene-04-allocation-qr.png", 5, "قيد متوازن وتوزيع تلقائي"),
    (PROMO / "generated-scenes" / "scene-06-end-card.png", 5, "Web & Desktop"),
]

VOICEOVER_WIDE = PROMO / "mohasbak-ai-voiceover.mp3"
VOICEOVER_REELS = PROMO / "mohasbak-ai-reels-voiceover.mp3"


def ar(text: str) -> str:
    return get_display(arabic_reshaper.reshape(text))


def load_font(size: int):
    candidates = [
        "C:/Windows/Fonts/arial.ttf",
        "C:/Windows/Fonts/tahoma.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    ]
    for c in candidates:
        try:
            return ImageFont.truetype(c, size)
        except Exception:
            pass
    return ImageFont.load_default()


def resize_cover(img: Image.Image, width: int, height: int) -> Image.Image:
    scale = max(width / img.width, height / img.height)
    nw, nh = int(img.width * scale), int(img.height * scale)
    img = img.resize((nw, nh), Image.Resampling.LANCZOS)
    left = (nw - width) // 2
    top = (nh - height) // 2
    return img.crop((left, top, left + width, top + height))


def make_wide_frame(scene_path: Path, title: str, index: int, frames_dir: Path) -> Path:
    W, H = 1920, 1080
    frames_dir.mkdir(parents=True, exist_ok=True)
    img = resize_cover(Image.open(scene_path).convert("RGB"), W, H).convert("RGBA")
    overlay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    title_font = load_font(64)
    small_font = load_font(34)
    draw.rectangle((0, H - 210, W, H), fill=(15, 23, 42, 175))
    text = ar(title)
    bbox = draw.textbbox((0, 0), text, font=title_font)
    draw.text(((W - (bbox[2] - bbox[0])) // 2, H - 160), text, font=title_font, fill=(255, 255, 255, 255))
    label = ar(f"محاسبك AI  |  مشهد {index}")
    bbox2 = draw.textbbox((0, 0), label, font=small_font)
    draw.rounded_rectangle((W - (bbox2[2] - bbox2[0]) - 90, 40, W - 40, 100), radius=22, fill=(30, 58, 138, 210))
    draw.text((W - (bbox2[2] - bbox2[0]) - 65, 54), label, font=small_font, fill=(219, 234, 254, 255))
    final = Image.alpha_composite(img, overlay).convert("RGB")
    out = frames_dir / f"wide-frame-{index:02d}.jpg"
    final.save(out, quality=92)
    return out


def make_reels_frame(scene_path: Path, title: str, index: int, frames_dir: Path) -> Path:
    W, H = 1080, 1920
    frames_dir.mkdir(parents=True, exist_ok=True)
    img = resize_cover(Image.open(scene_path).convert("RGB"), W, H).convert("RGBA")
    overlay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    title_font = load_font(70)
    small_font = load_font(34)
    draw.rounded_rectangle((50, 70, W - 50, 160), radius=36, fill=(30, 58, 138, 215))
    brand = ar("محاسبك AI")
    bb = draw.textbbox((0, 0), brand, font=small_font)
    draw.text(((W - (bb[2] - bb[0])) // 2, 94), brand, font=small_font, fill=(255, 255, 255, 255))
    draw.rounded_rectangle((50, H - 390, W - 50, H - 220), radius=44, fill=(15, 23, 42, 220))
    display = ar(title)
    bbox = draw.textbbox((0, 0), display, font=title_font)
    draw.text(((W - (bbox[2] - bbox[0])) // 2, H - 345), display, font=title_font, fill=(255, 255, 255, 255))
    cta = ar("إدارة نقابية أذكى")
    bb2 = draw.textbbox((0, 0), cta, font=small_font)
    draw.text(((W - (bb2[2] - bb2[0])) // 2, H - 265), cta, font=small_font, fill=(94, 234, 212, 255))
    final = Image.alpha_composite(img, overlay).convert("RGB")
    out = frames_dir / f"reels-frame-{index:02d}.jpg"
    final.save(out, quality=92)
    return out


def volume(clip, factor: float):
    if hasattr(clip, "with_volume_scaled"):
        return clip.with_volume_scaled(factor)
    if hasattr(clip, "volumex"):
        return clip.volumex(factor)
    return clip


def subclip(clip, start, end):
    return clip.subclipped(start, end) if hasattr(clip, "subclipped") else clip.subclip(start, end)


def loop_audio_to_duration(audio, duration: float):
    if audio.duration >= duration:
        return subclip(audio, 0, duration)
    reps = math.ceil(duration / audio.duration)
    looped = concatenate_audioclips([audio] * reps)
    return subclip(looped, 0, duration)


def clean_music_input(raw: str) -> str:
    text = (raw or '').strip().strip('"').strip("'").strip()
    # If text was pasted from Markdown like [file](url), keep visible label.
    if text.startswith('[') and '](' in text:
        text = text[1:].split('](', 1)[0]
    # Remove file:// prefix if present.
    if text.lower().startswith('file:///'):
        text = text[8:]
    return text.strip().strip('"').strip("'").strip()


def resolve_music_path(raw: str) -> Path:
    cleaned = clean_music_input(raw)
    candidate = Path(cleaned)
    if candidate.exists():
        return candidate

    # Try current project folder relative path
    candidate = (ROOT / cleaned)
    if candidate.exists():
        return candidate

    # Try adding common audio extensions if user typed name without extension
    common_ext = ['.mp3', '.wav', '.m4a', '.aac', '.ogg', '.flac']
    base_candidates = [Path(cleaned), ROOT / cleaned]
    for base in base_candidates:
        if not base.suffix:
            for ext in common_ext:
                test = base.with_suffix(ext)
                if test.exists():
                    return test

    # Search common Windows user folders by exact name or stem match
    search_dirs = [Path.home() / 'Downloads', Path.home() / 'Desktop', Path.home() / 'Music', ROOT]
    cleaned_lower = cleaned.lower()
    cleaned_stem = Path(cleaned).stem.lower()
    for folder in search_dirs:
        if not folder.exists():
            continue
        try:
            for file in folder.rglob('*'):
                if not file.is_file() or file.suffix.lower() not in common_ext:
                    continue
                name_lower = file.name.lower()
                stem_lower = file.stem.lower()
                if name_lower == cleaned_lower or stem_lower == cleaned_stem or cleaned_lower in name_lower:
                    return file
        except Exception:
            continue

    raise FileNotFoundError(
        'ملف الموسيقى غير موجود. أدخل المسار الكامل للملف أو اسحب الملف داخل نافذة CMD. مثال: C:\\Users\\HP\\Downloads\\music.mp3'
    )


def build_video(mode: str, music_path: Path, music_volume: float, voice_volume: float, output: Path | None = None):
    if mode == "wide":
        scenes = WIDE_SCENES
        voice_path = VOICEOVER_WIDE
        frames_dir = PROMO / "video-frames-music"
        output = output or PROMO / "mohasbak-ai-video-with-your-music.mp4"
        frame_maker = make_wide_frame
    elif mode == "reels":
        scenes = REELS_SCENES
        voice_path = VOICEOVER_REELS
        frames_dir = PROMO / "reels-frames-music"
        output = output or PROMO / "mohasbak-ai-reels-with-your-music.mp4"
        frame_maker = make_reels_frame
    else:
        raise ValueError("mode must be wide or reels")

    if not voice_path.exists():
        raise FileNotFoundError(f"ملف التعليق الصوتي غير موجود: {voice_path}")

    print(f"إنشاء فيديو {mode}...")
    frames = []
    for i, (scene, dur, title) in enumerate(scenes, 1):
        if not scene.exists():
            raise FileNotFoundError(f"مشهد غير موجود: {scene}")
        frames.append((frame_maker(scene, title, i, frames_dir), dur))

    clips = [ImageClip(str(frame)).with_duration(duration) for frame, duration in frames]
    video = concatenate_videoclips(clips, method="compose")
    duration = video.duration
    voice = volume(AudioFileClip(str(voice_path)), voice_volume)
    music = volume(AudioFileClip(str(music_path)), music_volume)
    music_loop = loop_audio_to_duration(music, duration)
    audio = CompositeAudioClip([music_loop, voice])
    video = video.with_audio(audio)
    output.parent.mkdir(parents=True, exist_ok=True)
    video.write_videofile(str(output), fps=24, codec="libx264", audio_codec="aac", preset="medium")
    print(f"تم إنشاء الفيديو: {output}")


def main():
    parser = argparse.ArgumentParser(description="إنشاء فيديو محاسبك AI بموسيقى مخصصة")
    parser.add_argument("--music", required=True, help="مسار ملف الموسيقى MP3/WAV/M4A")
    parser.add_argument("--mode", choices=["wide", "reels", "both"], default="wide", help="نوع الفيديو المطلوب")
    parser.add_argument("--output", default="", help="مسار ملف الفيديو الناتج عند اختيار wide أو reels")
    parser.add_argument("--music-volume", type=float, default=0.18, help="مستوى صوت الموسيقى بين 0 و 1")
    parser.add_argument("--voice-volume", type=float, default=1.0, help="مستوى صوت التعليق الصوتي")
    args = parser.parse_args()

    music_path = resolve_music_path(args.music)
    print(f"تم العثور على ملف الموسيقى: {music_path}")

    if args.mode == "both":
        build_video("wide", music_path, args.music_volume, args.voice_volume)
        build_video("reels", music_path, args.music_volume, args.voice_volume)
    else:
        out = Path(args.output) if args.output else None
        build_video(args.mode, music_path, args.music_volume, args.voice_volume, out)


if __name__ == "__main__":
    main()
