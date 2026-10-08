import React, { useEffect, useMemo, useState } from 'react';
import { BookOpen, Search, MessageCircleQuestion, FileText, Loader2, Layers, ShieldAlert, CheckCircle2, Image as ImageIcon } from 'lucide-react';
import { api } from '../services/api.js';
import { AuthenticatedApiImage } from '../components/AuthenticatedApiImage.js';
import type { RegulationDocumentRecord, RegulationLibraryView } from '../types/erp.regulations.js';
import { User } from '../types/erp.js';

interface RegulationLibraryProps {
  organizationId: string;
  currentUser: User | null;
  onShowToast: (type: 'success' | 'error' | 'warning' | 'info', msg: string) => void;
  /** فتح مساعد اللوائح على مادة محددة */
  onAskAssistant?: (question: string) => void;
  /** مادة مطلوب عرضها عند الوصول من ال  ات أو من تنقل آخر */
  initialDocumentId?: string | null;
}

const MAX_ROWS = 60;

/**
 * مكتبة اللوائح: المصادر الثلاثة المُدرجة في قاعدة البيانات، وتُعرض بنودها ببحث فوري،
 * مع إمكانية سؤال مساعد اللوائح عن أي بند مباشرة.
 */
export const RegulationLibrary: React.FC<RegulationLibraryProps> = ({
  organizationId,
  currentUser,
  onShowToast,
  onAskAssistant,
  initialDocumentId,
}) => {
  const [library, setLibrary] = useState<RegulationLibraryView | null>(null);
  const [sourceId, setSourceId] = useState<string>('all');
  const [query, setQuery] = useState('');
  const [documents, setDocuments] = useState<RegulationDocumentRecord[]>([]);
  const [selected, setSelected] = useState<RegulationDocumentRecord | null>(null);
  const [loading, setLoading] = useState(false);
  const [pageImage, setPageImage] = useState<number | null>(null);

  useEffect(() => {
    (async () => {
      try {
        setLibrary(await api.getRegulationsOverview());
      } catch (err: any) {
        onShowToast('error', err.message || 'تعذر تحميل مكتبة اللوائح.');
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId]);

  useEffect(() => {
    if (!initialDocumentId) return;
    (async () => {
      try {
        const doc = await api.getRegulationLibraryDocument(initialDocumentId);
        setSelected(doc);
      } catch {
        /* البند غير متاح — نتجاهل بهدوء */
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialDocumentId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const result = await api.searchRegulations(query, sourceId === 'all' ? null : sourceId, MAX_ROWS);
        if (!cancelled) setDocuments(result.documents ?? []);
      } catch (err: any) {
        if (!cancelled) onShowToast('error', err.message || 'تعذر البحث في قاعدة اللوائح.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, sourceId]);

  const activeSource = useMemo(
    () => library?.sources.find((s) => s.id === sourceId) ?? null,
    [library, sourceId],
  );

  return (
    <div className="space-y-4" data-assistant-screen="regulation-library">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-md space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-teal-400" />
            <h3 className="text-sm font-bold text-slate-100">مكتبة اللوائح — مُدرجة في قاعدة بيانات البرنامج</h3>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-[10px]">
            <span className="px-2 py-1 rounded-lg bg-slate-950 border border-slate-800 text-slate-300">
              {library?.stats.sources ?? 0} مصادر
            </span>
            <span className="px-2 py-1 rounded-lg bg-slate-950 border border-slate-800 text-slate-300">
              {library?.stats.documents ?? 0} بنداً
            </span>
            <span className="px-2 py-1 rounded-lg bg-slate-950 border border-slate-800 text-amber-300">
              {library?.stats.ocrDocuments ?? 0} بنداً من OCR
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {(library?.sources ?? []).map((source) => (
            <button
              key={source.id}
              onClick={() => setSourceId(sourceId === source.id ? 'all' : source.id)}
              className={`text-right rounded-xl border p-3 space-y-1.5 transition-colors ${
                sourceId === source.id ? 'border-teal-600 bg-teal-950/30' : 'border-slate-800 bg-slate-950 hover:border-slate-700'
              }`}
            >
              <div className="text-[11px] font-bold text-slate-100 leading-5">{source.titleAr}</div>
              <div className="text-[10px] text-slate-500 leading-4">{source.subtitleAr}</div>
              <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
                <span className="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-300">
                  {source.docsCount} {source.unitLabelAr}
                </span>
                {source.hasTextLayer ? (
                  <span className="flex items-center gap-1 text-emerald-300">
                    <CheckCircle2 className="w-3 h-3" /> نص رسمي
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-amber-300">
                    <ShieldAlert className="w-3 h-3" /> صورة + OCR
                  </span>
                )}
              </div>
              <div className="text-[10px] text-slate-500">{source.issueRefAr}</div>
              <div className="text-[10px] text-slate-400">{source.statusAr}</div>
            </button>
          ))}
        </div>

        {library?.law35LimitationAr && (
          <div className="text-[10px] text-amber-300/90 border-t border-slate-800 pt-3 leading-5">
            ⚠︎ {library.law35LimitationAr}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
          <div className="flex flex-wrap items-center justify-between gap-3 p-4 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-teal-400" />
              <h4 className="text-xs font-bold text-slate-200">
                {activeSource ? `${activeSource.titleAr} — ${documents.length} نتيجة` : `بحث في كل البنود${documents.length ? ` (${documents.length} نتيجة)` : ''}`}
              </h4>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-500 absolute right-2.5 top-2.5" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="ابحث في نصوص اللوائح… مثال: الاشتراكات • الهدايا • الخزينة"
                  className="w-72 pr-8 pl-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-[11px] text-slate-200 outline-hidden focus:border-teal-700"
                />
              </div>
              <select
                value={sourceId}
                onChange={(e) => setSourceId(e.target.value)}
                className="px-2 py-2 bg-slate-950 border border-slate-800 rounded-xl text-[11px] text-slate-200 outline-hidden"
              >
                <option value="all">كل المصادر</option>
                {(library?.sources ?? []).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.kindAr} — {s.docsCount} {s.unitLabelAr}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {loading ? (
            <div className="flex items-center gap-2 p-6 text-[11px] text-slate-400">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> بجمع البنود...
            </div>
          ) : (
            <div className="overflow-auto max-h-[30rem]">
              <table className="w-full text-[11px]">
                <thead className="bg-slate-950 text-slate-400 sticky top-0">
                  <tr>
                    <th className="text-right py-2 px-2 font-medium">المرجع</th>
                    <th className="text-right py-2 px-2 font-medium">المصدر</th>
                    <th className="text-right py-2 px-2 font-medium">الموضوع</th>
                    <th className="text-right py-2 px-2 font-medium">النص</th>
                  </tr>
                </thead>
                <tbody>
                  {documents.map((doc) => (
                    <tr
                      key={doc.id}
                      onClick={() => setSelected(doc)}
                      className={`border-t border-slate-800/70 cursor-pointer hover:bg-slate-800/40 ${
                        selected?.id === doc.id ? 'bg-teal-500/10' : ''
                      }`}
                    >
                      <td className="py-1.5 px-2 whitespace-nowrap text-slate-300">
                        {doc.refCode}
                        {doc.ocrDerived ? <span className="ml-1 text-[9px] text-amber-300">OCR</span> : null}
                      </td>
                      <td className="py-1.5 px-2 whitespace-nowrap text-slate-500">{doc.sourceTitleAr.slice(0, 28)}…</td>
                      <td className="py-1.5 px-2 text-slate-300">{doc.titleAr.slice(0, 60)}</td>
                      <td className="py-1.5 px-2 text-slate-500">{doc.textAr.replace(/\s+/g, ' ').slice(0, 70)}…</td>
                    </tr>
                  ))}
                  {documents.length === 0 && (
                    <tr>
                      <td colSpan={4} className="py-6 text-center text-slate-500">
                        مفيش نتائج مطابقة — جرّب كلمة أخرى أو اختر مصدراً مختلفاً.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-teal-400" />
            <h4 className="text-xs font-bold text-slate-200">{selected ? selected.refCode : 'اختر بنداً من الجدول'}</h4>
          </div>
          {selected ? (
            <div className="space-y-3">
              <div className="text-[10px] text-slate-500">{selected.sourceTitleAr}</div>
              <div className="text-[11px] font-bold text-slate-200">{selected.titleAr}</div>
              {selected.chapterAr && <div className="text-[10px] text-slate-400">{selected.chapterAr}</div>}
              <p className="text-[11px] text-slate-300 leading-6 whitespace-pre-wrap">{selected.textAr}</p>
              {selected.tagsAr?.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {selected.tagsAr.slice(0, 8).map((tag) => (
                    <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded bg-slate-950 border border-slate-800 text-slate-400">
                      {tag}
                    </span>
                  ))}
                </div>
              )}
              {selected.enforcementRuleIdsAr && selected.enforcementRuleIdsAr.length > 0 && (
                <div className="text-[10px] text-slate-400">
                  قواعد الإنفاذ المرتبطة: <span className="font-mono text-slate-300">{selected.enforcementRuleIdsAr.join(' • ')}</span>
                </div>
              )}
              {selected.ocrDerived && (
                <div className="text-[10px] text-amber-300 leading-5">
                  ⚠︎ هذا النص من صورة مصوّرة (OCR) — راجعه على صورة الصفحة قبل الاقتباس الرسمي.
                </div>
              )}
              <div className="flex flex-wrap gap-2 pt-1">
                {onAskAssistant && (
                  <button
                    data-action="ask-assistant"
                    onClick={() =>
                      onAskAssistant(
                        selected.articleNumber
                          ? `إيه نص المادة (${selected.articleNumber}) من ${selected.sourceTitleAr}؟`
                          : `إيه اللي في ${selected.refCode} من ${selected.sourceTitleAr}؟`,
                      )
                    }
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-[11px] font-bold"
                  >
                    <MessageCircleQuestion className="w-3.5 h-3.5" /> اسأل المساعد عن هذا البند
                  </button>
                )}
                {selected.ocrDerived && (
                  <button
                    data-action="open-page-image"
                    onClick={() => setPageImage(selected.pageNumber ?? 1)}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-300 text-[11px]"
                  >
                    <ImageIcon className="w-3.5 h-3.5" /> صورة الصفحة
                  </button>
                )}
              </div>
            </div>
          ) : (
            <p className="text-[11px] text-slate-500">
              اضغط أي بند في الجدول لعرض نصه كاملاً، وسنده، وقواعد الإنفاذ المرتبطة به، ثم اسأل المساعد عنه مباشرة.
            </p>
          )}
        </div>
      </div>

      {pageImage !== null && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => setPageImage(null)}>
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-3xl w-full max-h-[90vh] overflow-auto p-3" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between gap-3 mb-2">
              <div className="text-xs font-bold text-slate-200">الملف المرفق — صفحة {pageImage} من 17</div>
              <button
                data-action="close-page-image"
                onClick={() => setPageImage(null)}
                className="text-[10px] px-2 py-1 rounded bg-slate-950 border border-slate-700 text-slate-300"
              >
                إغلاق
              </button>
            </div>
            <AuthenticatedApiImage src={`/api/regulations/law35/pages/${pageImage}`} alt={`صفحة ${pageImage}`} className="w-full rounded-xl border border-slate-800" />
          </div>
        </div>
      )}
    </div>
  );
};

export default RegulationLibrary;
