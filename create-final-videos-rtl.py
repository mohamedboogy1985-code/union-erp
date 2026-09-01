# -*- coding: utf-8 -*-
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
from moviepy import ImageClip, AudioFileClip, concatenate_videoclips

ROOT = Path(__file__).resolve().parents[1]
PROMO = ROOT / 'promo'

def font(size, bold=True):
    candidates = ['C:/Windows/Fonts/tahomabd.ttf','C:/Windows/Fonts/arialbd.ttf','/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'] if bold else ['C:/Windows/Fonts/tahoma.ttf','C:/Windows/Fonts/arial.ttf','/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf']
    for c in candidates:
        try: return ImageFont.truetype(c,size)
        except: pass
    return ImageFont.load_default()

def draw_rtl(draw, xy, text, fnt, fill, anchor='ra'):
    draw.text(xy, text, font=fnt, fill=fill, direction='rtl', language='ar', anchor=anchor)

def resize_cover(img,W,H):
    scale=max(W/img.width,H/img.height)
    nw,nh=int(img.width*scale),int(img.height*scale)
    img=img.resize((nw,nh),Image.Resampling.LANCZOS)
    return img.crop(((nw-W)//2,(nh-H)//2,(nw+W)//2,(nh+H)//2))

def frame(src,title,index,W,H,outdir,vertical=False):
    img=resize_cover(Image.open(src).convert('RGB'),W,H).convert('RGBA')
    ov=Image.new('RGBA',(W,H),(0,0,0,0)); d=ImageDraw.Draw(ov)
    if vertical:
        d.rounded_rectangle((50,70,W-50,160),radius=36,fill=(30,58,138,215))
        d.text((W//2,112),'محاسبك AI',font=font(34),fill='white',anchor='mm',direction='rtl',language='ar')
        d.rounded_rectangle((50,H-390,W-50,H-220),radius=44,fill=(15,23,42,220))
        draw_rtl(d,(W-90,H-335),title,font(58),'#FFFFFF')
        draw_rtl(d,(W-90,H-265),'إدارة نقابية أذكى',font(32,False),'#5EEAD4')
    else:
        d.rectangle((0,H-210,W,H),fill=(15,23,42,175))
        draw_rtl(d,(W-120,H-140),title,font(62),'#FFFFFF')
        d.rounded_rectangle((W-450,40,W-40,100),radius=22,fill=(30,58,138,210))
        draw_rtl(d,(W-70,68),f'محاسبك AI  |  مشهد {index}',font(30),'#DBEAFE')
    final=Image.alpha_composite(img,ov).convert('RGB')
    out=outdir/f'frame-{index:02d}.jpg'; final.save(out,quality=92); return out

def make_video(mode):
    if mode=='wide':
        specs=[('scene-01-problem.png',8,'تعبت من الحسابات اليدوية؟'),('scene-02-solution.png',8,'مرحبًا بك في محاسبك AI'),('scene-03-voice-ai.png',12,'إدخال صوتي وقيد مزدوج فوري'),('scene-04-allocation-qr.png',12,'توزيع تلقائي للحصص + QR'),('scene-05-offline-sync.png',10,'يعمل بدون إنترنت ثم يتزامن'),('scene-06-end-card.png',10,'محاسبك AI — Web & Desktop')]
        W,H=1920,1080; outdir=PROMO/'video-frames-rtl'; audio=PROMO/'mohasbak-ai-voiceover.mp3'; out=PROMO/'mohasbak-ai-promo-video-rtl.mp4'; vertical=False
    else:
        specs=[('scene-01-problem.png',3,'لسه بتحسب يدوي؟'),('scene-02-solution.png',4,'محاسبك AI'),('scene-03-voice-ai.png',5,'اتكلم فقط'),('scene-04-allocation-qr.png',5,'قيد متوازن وتوزيع تلقائي'),('scene-06-end-card.png',5,'Web & Desktop')]
        W,H=1080,1920; outdir=PROMO/'reels-frames-rtl'; audio=PROMO/'mohasbak-ai-reels-voiceover.mp3'; out=PROMO/'mohasbak-ai-reels-video-rtl-9x16.mp4'; vertical=True
    outdir.mkdir(parents=True,exist_ok=True)
    clips=[]
    for i,(name,dur,title) in enumerate(specs,1):
        f=frame(PROMO/'generated-scenes'/name,title,i,W,H,outdir,vertical)
        clips.append(ImageClip(str(f)).with_duration(dur))
    video=concatenate_videoclips(clips,method='compose').with_audio(AudioFileClip(str(audio)))
    video.write_videofile(str(out),fps=24,codec='libx264',audio_codec='aac',preset='medium')
    print(out)

make_video('wide')
make_video('reels')
