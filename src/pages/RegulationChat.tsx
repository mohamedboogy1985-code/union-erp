import React, { useEffect, useMemo, useRef, useState } from 'react';
import { BookOpen, Send, Sparkles, FileText, Image as ImageIcon, ExternalLink, ShieldAlert, CheckCircle2, Loader2 } from 'lucide-react';
import { api, downloadAuthenticatedFile } from '../services/api.js';
import { AuthenticatedApiImage } from '../components/AuthenticatedApiImage.js';
import type { RegulationAskResult, RegulationCitation, RegulationLibraryView } from '../types/erp.regulations.js';
import { User } from '../types/erp.js';

interface RegulationChatProps {
  organizationId: string;
  currentUser: User | null;
  onShowToast: (type: 'success' | 'error' | 'warning' | 'info', msg: string) => void;
  /** سؤال يصل من شاشة اللوائح لبدء المحادثة به */
  seedQuestion?: string | null;
  /** يزداد مع كل سؤال جديد حتى لو تكرر نصه */
  seedNonce?: number;
  onOpenDocument?: (documentId: string) => void;
}

interface ChatTurn {
  id: string;
  role: 'user' | 'bot';
  text: string;
  citations?: RegulationCitation[];
  origin?: RegulationAskResult['origin'];
  limitationAr?: string;
}

const ORIGIN_LABEL: Record<string, string> = {
  ARTICLE_EXACT: 'نص مادة من قاعدة اللوائح',
  TOPIC_SEARCH: 'بحث في نصوص اللوائح',
  SOURCE_LIST: 'قائمة المصادر',
  OVERVIEW: 'نظرة عامة على القاعدة',
  GREETING: 'ترحيب',
  NO_MATCH: 'لا يوجد نص مطابق',
};

export const RegulationChat: React.FC<RegulationChatProps> = ({
  organizationId,
  currentUser,
  onShowToast,
  seedQuestion,
  seedNonce = 0,
  onOpenDocument,
}) => {
  const [library, setLibrary] = useState<RegulationLibraryView | null>(null);
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [pageImage, setPageImage] = useState<number | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [view, intro] = await Promise.all([api.getRegulationsOverview(), api.askRegulations('')]);
        setLibrary(view);
        setSuggestions(intro.suggestions ?? []);
        setTurns([
          {
            id: 'welcome',
            role: 'bot',
            text:
              intro.answerAr ||
              'أهلاً بك 👋 أنا مساعد اللوائح — اسألني عن أي مادة أو موضوع وأنا أجيبك بالنص وسنده من قاعدة اللوائح.',
            citations: intro.citations,
            origin: intro.origin,
            limitationAr: intro.limitationAr,
          },
        ]);
      } catch (err: any) {
        onShowToast('error', err.message || 'تعذر تحميل مكتبة اللوائح.');
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId]);

  useEffect(() => {
    if (seedQuestion) void send(seedQuestion);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seedQuestion, seedNonce]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [turns.length, busy]);

  const stats = useMemo(() => library?.stats, [library]);

  const send = async (question: string) => {
    const text = question.trim();
    if (!text || busy) return;
    setInput('');
    setTurns((prev) => [...prev, { id: `u-${Date.now()}`, role: 'user', text }]);
    setBusy(true);
    try {
      const result = await api.askRegulations(text);
      setSuggestions(result.suggestions ?? []);
      setTurns((prev) => [
        ...prev,
        {
          id: `b-${Date.now()}`,
          role: 'bot',
          text: result.answerAr,
          citations: result.citations,
          origin: result.origin,
          limitationAr: result.limitationAr,
        },
      ]);
    } catch (err: any) {
      onShowToast('error', err.message || 'تعذر الوصول لمساعد اللوائح.');
      setTurns((prev) => [
        ...prev,
        { id: `e-${Date.now()}`, role: 'bot', text: `معلش، حصلت مشكلة في الوصول لقاعدة اللوائح: ${err.message || 'خطأ غير معروف'}.` },
      ]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-4" data-assistant-screen="regulation-chat">
      <div className="lg:col-span-3 bg-slate-900 border border-slate-800 rounded-2xl flex flex-col shadow-xl min-h-[36rem]">
        <div className="flex items-center justify-between gap-3 p-4 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-teal-400" />
            <div>
              <h3 className="text-xs font-bold text-slate-200">مساعد اللوائح — شات بوت داخل البرنامج</h3>
              <p className="text-[10px] text-slate-500 mt-0.5">
                يجيب من نصوص لوائحك المُدرجة في قاعدة البيانات فقط، وكل إجابة معها سندها
                {stats ? ` — ${stats.documents} بنداً من ${stats.sources} مصادر` : ''}
              </p>
            </div>
          </div>
          <span className="text-[10px] px-2 py-1 rounded-lg bg-slate-950 border border-slate-800 text-slate-400">
            {currentUser?.fullName ?? 'مستخدم'}
          </span>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {turns.map((turn) => (
            <div key={turn.id} className={turn.role === 'user' ? 'flex justify-start' : 'flex justify-end'}>
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-3 text-[12px] leading-6 whitespace-pre-wrap ${
                  turn.role === 'user'
                    ? 'bg-teal-600/90 text-white'
                    : 'bg-slate-950 border border-slate-800 text-slate-200'
                }`}
              >
                {turn.role === 'bot' && turn.origin && (
                  <div className="mb-1.5 flex items-center gap-1.5 text-[10px] text-teal-300">
                    <FileText className="w-3 h-3" />
                    {ORIGIN_LABEL[turn.origin] ?? turn.origin}
                  </div>
                )}
                {turn.text}

                {turn.citations && turn.citations.length > 0 && (
                  <div className="mt-3 space-y-2 border-t border-slate-800 pt-2">
                    {turn.citations.map((cite, index) => (
                      <div key={`${turn.id}-c${index}`} className="rounded-xl bg-slate-900 border border-slate-800 p-2">
                        <div className="flex flex-wrap items-center gap-2 text-[10px]">
                          <span className="font-bold text-slate-300">{cite.refCode}</span>
                          <span className="text-slate-500">{cite.kindAr}</span>
                          <span className="text-slate-400">{cite.sourceTitleAr}</span>
                          <span className="font-mono text-slate-500">{cite.sourceCode}</span>
                          {cite.ocrDerived ? (
                            <span className="flex items-center gap-1 text-amber-300">
                              <ShieldAlert className="w-3 h-3" /> من صورة (OCR)
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 text-emerald-300">
                              <CheckCircle2 className="w-3 h-3" /> نص رسمي
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-[11px] text-slate-400 leading-5">{cite.snippetAr}</p>
                        {cite.pageImageUrl && (
                          <button
                            onClick={() => setPageImage(Number(cite.pageImageUrl?.split('/').pop() ?? 1))}
                            className="mt-1.5 flex items-center gap-1 text-[10px] text-teal-300 hover:text-teal-200"
                          >
                            <ImageIcon className="w-3 h-3" /> عرض صورة الصفحة الأصلية من الملف المرفق
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {turn.limitationAr && (
                  <div className="mt-2 text-[10px] text-amber-300/90 leading-5">⚠︎ {turn.limitationAr}</div>
                )}
              </div>
            </div>
          ))}
          {busy && (
            <div className="flex items-center gap-2 text-[11px] text-slate-400">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> بدور في نصوص اللوائح...
            </div>
          )}
          <div ref={endRef} />
        </div>

        <div className="p-3 border-t border-slate-800 space-y-2">
          {suggestions.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {suggestions.map((s) => (
                <button
                  key={s}
                  onClick={() => void send(s)}
                  className="text-[10px] px-2 py-1 rounded-lg bg-slate-950 border border-slate-800 text-slate-300 hover:border-teal-700"
                >
                  {s}
                </button>
              ))}
            </div>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void send(input);
            }}
            className="flex items-center gap-2"
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="اكتب سؤالك عن اللوائح… مثال: إيه نص المادة (2)؟ أو سقف الصرف النقدي كام؟"
              className="flex-1 px-3 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 outline-hidden focus:border-teal-700"
            />
            <button
              type="submit"
              disabled={busy || !input.trim()}
              className="flex items-center gap-2 px-4 py-2.5 bg-teal-600 hover:bg-teal-500 disabled:opacity-50 text-white text-xs font-bold rounded-xl"
            >
              <Send className="w-3.5 h-3.5" /> اسأل
            </button>
          </form>
        </div>
      </div>

      <div className="space-y-3">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-2">
          <div className="flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-teal-400" />
            <h4 className="text-xs font-bold text-slate-200">مصادر القاعدة ({library?.sources.length ?? 0})</h4>
          </div>
          {(library?.sources ?? []).map((source) => (
            <div key={source.id} className="rounded-xl bg-slate-950 border border-slate-800 p-2.5 space-y-1">
              <div className="text-[11px] font-bold text-slate-200">{source.titleAr}</div>
              <div className="text-[10px] text-slate-500">{source.subtitleAr}</div>
              <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-slate-400">
                <span className="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800">{source.kindAr}</span>
                <span className="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800">
                  {source.docsCount} {source.unitLabelAr}
                </span>
                <span className={`px-1.5 py-0.5 rounded border ${source.hasTextLayer ? 'border-emerald-800/50 text-emerald-300' : 'border-amber-800/50 text-amber-300'}`}>
                  {source.hasTextLayer ? 'نص رسمي' : 'صورة + OCR'}
                </span>
              </div>
              <div className="text-[10px] text-slate-500">{source.issueRefAr}</div>
              {source.sha256 && (
                <div className="font-mono text-[9px] text-slate-600">sha256 {source.sha256.slice(0, 24)}…</div>
              )}
              {!source.hasTextLayer && (
                <button
                  onClick={() => setPageImage(1)}
                  className="flex items-center gap-1 text-[10px] text-teal-300 hover:text-teal-200"
                >
                  <ImageIcon className="w-3 h-3" /> استعراض صفحات الملف المرفق
                </button>
              )}
            </div>
          ))}
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-2 text-[10px] text-slate-400">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-200">
            <ShieldAlert className="w-4 h-4 text-amber-300" /> ضوابط المساعد
          </div>
          <div>• لا يجيب إلا من نصوص اللوائح المُدرجة في قاعدة البيانات، ويذكر المرجع دائماً.</div>
          <div>• الملف المرفق نسخة مصوّرة: نصوصه موسومة بـ«OCR» وتحتاج مراجعة على الصورة قبل الاقتباس الرسمي.</div>
          <div>• لو مفيش نص مطابق، يقول ذلك صريحاً ولا يخترع حكماً.</div>
          {library?.law35LimitationAr && <div className="text-amber-300/80">⚠︎ {library.law35LimitationAr}</div>}
          {onOpenDocument && (
            <button
              onClick={() => onOpenDocument('doc-financial-2')}
              className="flex items-center gap-1 text-teal-300 hover:text-teal-200 pt-1"
            >
              <ExternalLink className="w-3 h-3" /> افتح المادة (2) في مكتبة اللوائح
            </button>
          )}
        </div>
      </div>

      {pageImage !== null && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => setPageImage(null)}>
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-3xl w-full max-h-[90vh] overflow-auto p-3" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between gap-3 mb-2">
              <div className="text-xs font-bold text-slate-200">
                الملف المرفق — صفحة {pageImage} من 17 (قرار وزير القوى العاملة رقم 35 لسنة 2018)
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void downloadAuthenticatedFile(
                    '/api/regulations/law35/file',
                    'قرار-35-لسنة-2018-اللائحة-التنفيذية.pdf',
                  ).catch((err: any) => onShowToast('error', err?.message || 'تعذّر تنزيل الملف.'))}
                  className="text-[10px] text-teal-300 hover:text-teal-200 flex items-center gap-1"
                >
                  <ExternalLink className="w-3 h-3" /> تنزيل الـPDF الأصلي
                </button>
                <button
                  data-action="close-page-image"
                  onClick={() => setPageImage(null)}
                  className="text-[10px] px-2 py-1 rounded bg-slate-950 border border-slate-700 text-slate-300"
                >
                  إغلاق
                </button>
              </div>
            </div>
            <AuthenticatedApiImage src={`/api/regulations/law35/pages/${pageImage}`} alt={`صفحة ${pageImage}`} className="w-full rounded-xl border border-slate-800" />
            <div className="mt-2 flex items-center justify-between text-[10px] text-slate-500">
              <button
                onClick={() => setPageImage((p) => Math.max(1, (p ?? 1) - 1))}
                className="px-2 py-1 rounded bg-slate-950 border border-slate-800"
              >
                الصفحة ا  سابقة
              </button>
              <span>{pageImage} / 17</span>
              <button
                onClick={() => setPageImage((p) => Math.min(17, (p ?? 1) + 1))}
                className="px-2 py-1 rounded bg-slate-950 border border-slate-800"
              >
                الصفحة التالية
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RegulationChat;
