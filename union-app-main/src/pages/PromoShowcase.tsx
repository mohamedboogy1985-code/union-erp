import React, { useCallback, useEffect, useState } from 'react';
import { ExternalLink, Film, LoaderCircle, RefreshCw, Terminal } from 'lucide-react';

const VIDEO_URL = '/assets/promo/video/union-promo-wide.mp4';
const ANIMATED_PROMO_URL = '/assets/promo/index.html';

type VideoStatus = 'checking' | 'available' | 'missing';

export const PromoShowcase: React.FC = () => {
  const [videoStatus, setVideoStatus] = useState<VideoStatus>('checking');
  const [checkNumber, setCheckNumber] = useState(0);

  const checkVideo = useCallback(() => {
    setVideoStatus('checking');
    setCheckNumber((current) => current + 1);
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    fetch(VIDEO_URL, {
      method: 'HEAD',
      cache: 'no-store',
      signal: controller.signal,
    })
      .then((response) => setVideoStatus(response.ok ? 'available' : 'missing'))
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setVideoStatus('missing');
      });

    return () => controller.abort();
  }, [checkNumber]);

  return (
    <div className="space-y-4" dir="rtl">
      <section className="rounded border border-[#334155] bg-[#1e293b] p-4 shadow-xs">
        <div className="mb-4 flex flex-col gap-3 border-b border-[#334155] pb-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded border border-sky-500/40 bg-sky-500/10 text-sky-400">
              <Film className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-100">الفيديو الترويجي — Union Financial ERP</h2>
              <p className="mt-0.5 text-xs text-slate-400">نسخة MP4 عريضة بدقة Full HD مع التعليق الصوتي</p>
            </div>
          </div>

          <button
            type="button"
            onClick={checkVideo}
            disabled={videoStatus === 'checking'}
            className="inline-flex items-center justify-center gap-1.5 rounded border border-[#334155] bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-300 transition-colors hover:border-sky-500/50 hover:text-sky-300 disabled:cursor-wait disabled:opacity-60"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${videoStatus === 'checking' ? 'animate-spin' : ''}`} />
            إعادة فحص الفيديو
          </button>
        </div>

        {videoStatus === 'checking' && (
          <div className="flex min-h-64 items-center justify-center rounded border border-[#334155] bg-slate-950/70 text-slate-400">
            <div className="flex items-center gap-2 text-sm">
              <LoaderCircle className="h-5 w-5 animate-spin text-sky-400" />
              جارٍ التحقق من ملف الفيديو...
            </div>
          </div>
        )}

        {videoStatus === 'available' && (
          <div className="overflow-hidden rounded border border-[#334155] bg-black shadow-lg">
            <video
              className="aspect-video w-full"
              controls
              playsInline
              preload="metadata"
              onError={() => setVideoStatus('missing')}
            >
              <source src={VIDEO_URL} type="video/mp4" />
              متصفحك لا يدعم تشغيل فيديو MP4.
            </video>
          </div>
        )}

        {videoStatus === 'missing' && (
          <div className="rounded border border-amber-700/50 bg-amber-950/20 p-4">
            <div className="mb-3 flex items-center gap-2 text-amber-300">
              <Terminal className="h-5 w-5" />
              <h3 className="text-sm font-bold">ملف MP4 غير موجود — أنشئه محلياً</h3>
            </div>
            <p className="mb-3 text-xs leading-6 text-slate-300">
              ضع التعليق الصوتي في <code className="text-sky-300">promo/voice.mp3</code> ثم شغّل مولّد الفيديو من جذر المشروع:
            </p>
            <pre className="overflow-x-auto rounded border border-[#334155] bg-slate-950 p-3 text-left font-mono text-xs leading-6 text-emerald-300" dir="ltr">
              <code>{`python -m pip install moviepy pillow numpy\npython promo/create_union_video.py\n\n# مع موسيقى خلفية اختيارية:\npython promo/create_union_video.py --music /path/to/music.mp3`}</code>
            </pre>
            <p className="mt-3 text-[11px] leading-5 text-slate-400">
              يحفظ السكربت النسختين العريضة وReels داخل <code className="text-sky-300">assets/promo/video/</code>.
            </p>
          </div>
        )}
      </section>

      <section className="rounded border border-[#334155] bg-[#1e293b] p-4 shadow-xs">
        <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-100">العرض الترويجي المتحرك</h3>
            <p className="mt-0.5 text-xs text-slate-400">نسخة HTML تفاعلية متعددة المشاهد</p>
          </div>
          <a
            href={ANIMATED_PROMO_URL}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-sky-400 hover:text-sky-300"
          >
            فتح في نافذة مستقلة
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>

        <div className="overflow-hidden rounded border border-[#334155] bg-black shadow-lg">
          <iframe
            src={ANIMATED_PROMO_URL}
            title="العرض الترويجي المتحرك لنظام Union Financial ERP"
            className="aspect-video w-full"
            allow="autoplay"
          />
        </div>
      </section>
    </div>
  );
};

export default PromoShowcase;
