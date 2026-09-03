# -*- coding: utf-8 -*-
"""
إعادة توليد بوستات السوشيال ميديا بنص عربي صحيح RTL.
يعتمد على Pillow مع دعم libraqm بدل قلب النص يدويًا.
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'promo' / 'social'
OUT.mkdir(parents=True, exist_ok=True)

FONT_REGULAR_CANDIDATES = [
    'C:/Windows/Fonts/tahoma.ttf',
    'C:/Windows/Fonts/arial.ttf',
    '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
]
FONT_BOLD_CANDIDATES = [
    'C:/Windows/Fonts/tahomabd.ttf',
    'C:/Windows/Fonts/arialbd.ttf',
    '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
]


def font(size: int, bold: bool = False):
    candidates = FONT_BOLD_CANDIDATES if bold else FONT_REGULAR_CANDIDATES
    for candidate in candidates:
        try:
            return ImageFont.truetype(candidate, size)
        except Exception:
            pass
    return ImageFont.load_default()


def text_width(draw: ImageDraw.ImageDraw, text: str, fnt: ImageFont.FreeTypeFont) -> int:
    if not text:
        return 0
    box = draw.textbbox((0, 0), text, font=fnt, direction='rtl', language='ar')
    return box[2] - box[0]


def wrap_rtl(draw: ImageDraw.ImageDraw, text: str, fnt: ImageFont.FreeTypeFont, max_width: int):
    words = text.split()
    lines = []
    line = ''
    for word in words:
        test = f'{line} {word}'.strip()
        if text_width(draw, test, fnt) <= max_width or not line:
            line = test
        else:
            lines.append(line)
            line = word
    if line:
        lines.append(line)
    return lines


def draw_rtl(draw: ImageDraw.ImageDraw, xy, text: str, fnt, fill, anchor='ra'):
    draw.text(xy, text, font=fnt, fill=fill, direction='rtl', language='ar', anchor=anchor)


def rounded_card(draw, box, radius, fill, outline=None, width=1):
    draw.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=width)


def make_post(filename: str, title: str, subtitle: str, bullets: list[str]):
    W = H = 1080
    img = Image.new('RGB', (W, H), '#F8FAFC').convert('RGBA')
    draw = ImageDraw.Draw(img)

    # خلفية ناعمة
    for y in range(H):
        alpha = int(36 * y / H)
        color = (30, 58, 138, alpha)
        draw.line((0, y, W, y), fill=color)

    # بطاقة رئيسية
    rounded_card(draw, (60, 60, W - 60, H - 60), 46, (255, 255, 255, 245), (226, 232, 240, 255), 2)

    # أيقونة التطبيق
    icon_path = ROOT / 'promo' / 'mohasbak-ai-app-icon.png'
    if icon_path.exists():
        icon = Image.open(icon_path).convert('RGBA')
        icon.thumbnail((135, 135), Image.Resampling.LANCZOS)
        icon_box = Image.new('RGBA', (150, 150), (255, 255, 255, 0))
        icon_box.alpha_composite(icon, ((150 - icon.width) // 2, (150 - icon.height) // 2))
        img.alpha_composite(icon_box, (W - 230, 92))

    f_brand = font(30, True)
    f_title = font(66, True)
    f_sub = font(40, False)
    f_bullet = font(31, True)
    f_cta = font(40, True)

    # البراند
    draw_rtl(draw, (100, 120), 'محاسبك AI', f_brand, '#0D9488', anchor='la')

    # العنوان
    y = 292
    for line in wrap_rtl(draw, title, f_title, 780):
        draw_rtl(draw, (W - 95, y), line, f_title, '#1E3A8A')
        y += 78

    # العنوان الفرعي
    y += 18
    for line in wrap_rtl(draw, subtitle, f_sub, 820):
        draw_rtl(draw, (W - 95, y), line, f_sub, '#64748B')
        y += 52

    y += 20
    for bullet in bullets:
        rounded_card(draw, (90, y, W - 90, y + 66), 22, (239, 246, 255, 255), (191, 219, 254, 255), 1)
        draw_rtl(draw, (W - 125, y + 34), '✓ ' + bullet, f_bullet, '#0F172A')
        y += 82

    # زر الدعوة
    rounded_card(draw, (90, H - 178, W - 90, H - 104), 30, '#1E3A8A')
    draw.text((W // 2, H - 140), 'اطلب النسخة التجريبية الآن', font=f_cta, fill='white', direction='rtl', language='ar', anchor='mm')

    img.convert('RGB').save(OUT / filename, quality=95)


POSTS = [
    ('post-01-problem-solution.png', 'تعبت من الحسابات اليدوية؟', 'حوّل منظومتك لإدارة ذكية', ['شهادات وإيصالات', 'عهد وتسويات', 'ترحيل محاسبي تلقائي']),
    ('post-02-voice-ai.png', 'اتكلم والنظام يسجل القيد', 'أوامر صوتية + JSON + تأكيد صوتي', ['استخراج البيانات بالصوت', 'قيد مدين ودائن', 'تأكيد قبل الترحيل']),
    ('post-03-committees.png', 'توزيع الحصص تلقائيًا', 'وفق قواعد النقابة واللجان', ['30% للنقابة العامة', '10% مطبوعات و10% اتحاد', '50% نصيب اللجنة']),
    ('post-04-desktop.png', 'ويب وديسك توب', 'تشغيل آمن مع SQLite', ['نسخ احتياطي يومي', 'استيراد Excel', 'تقارير وتحليل']),
    ('post-05-ocr.png', 'ماسح ذكي OCR', 'استخرج بيانات المستندات بسرعة', ['صور وفواتير', 'اقتراح قيد تلقائي', 'مراجعة واعتماد']),
    ('post-06-demo.png', 'محاسبك AI جاهز للتجربة', 'إدارة مالية ونقابية في منصة واحدة', ['بوابات متعددة', 'ذكاء صناعي', 'تصميم عربي RTL']),
]

for post in POSTS:
    make_post(*post)

print(f'تم إنشاء {len(POSTS)} بوستات عربية سليمة داخل {OUT}')
