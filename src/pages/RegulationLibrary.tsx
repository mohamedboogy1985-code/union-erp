import React, { useEffect, useMemo, useState } from 'react';
import {
  BookOpen,
  Search,
  MessageCircleQuestion,
  FileText,
  Loader2,
  Layers,
  ShieldAlert,
  CheckCircle2,
  Image as ImageIcon,
  ExternalLink,
  Download,
  Copy,
  Check,
  Scale,
  X,
  Landmark,
} from 'lucide-react';
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

export const OFFICIAL_LABOR_LAW_2025 = {
  lawNo: '14 لسنة 2025',
  titleAr: 'قانون رقم 14 لسنة 2025 بإصدار قانون العمل',
  subtitleAr: 'المنشور في الجريدة الرسمية — العدد 18 (تابع) الصادر في 5 ذي القعدة 1446هـ (الموافق 3 مايو 2025م)',
  authorityAr: 'جمهورية مصر العربية — رئاسة الجمهورية / وزارة العمل',
  issueDateAr: '3 مايو 2025 (5 ذي القعدة 1446هـ)',
  officialUrl: 'https://www.labour.gov.eg/media/0iedik3q/%D8%A7%D9%84%D9%82%D8%A7%D9%86%D9%88%D9%86-%D8%B1%D9%82%D9%85-14-%D9%84%D8%B3%D9%86%D8%A9-2025-%D8%A8%D8%A5%D8%B5%D8%AF%D8%A7%D8%B1-%D9%82%D8%A7%D9%86%D9%88%D9%86-%D8%A7%D9%84%D8%B9%D9%85%D9%84.pdf',
  localDownloadUrl: '/assets/docs/labor-law-14-2025.pdf',
  articlesCount: 13,
};

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
  const [showLawModal, setShowLawModal] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

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
      {/* ===== بطاقة مرجعية قانون العمل الجديد رقم 14 لسنة 2025 ===== */}
      <section
        className="rounded-2xl border border-emerald-500/40 bg-gradient-to-r from-emerald-950/40 via-slate-900 to-slate-900 p-5 shadow-lg space-y-3"
        aria-label="قانون العمل رقم 14 لسنة 2025"
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1.5 max-w-2xl">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                <Scale className="w-3.5 h-3.5 text-emerald-400" />
                مرجعية تشريعية رسمية جديدة (2025)
              </span>
              <span className="text-[11px] font-mono text-slate-400">الجريدة الرسمية — العدد 18 (تابع)</span>
              <span className="text-[10px] text-slate-400 font-mono">تاريخ الصدور: 3 مايو 2025</span>
            </div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              قانون رقم 14 لسنة 2025 بإصدار قانون العمل
            </h3>
            <p className="text-xs text-slate-300 leading-relaxed">
              التشريع العام المنظم لعلاقات العمل والأجور والتدريب والتأهيل (1%) وصندوق الخدمات الاجتماعية والعمالة غير المنتظمة والمحاكم العمالية المتخصصة. صدر برئاسة الجمهورية بتاريخ 5 ذي القعدة 1446هـ (3 مايو 2025م) ويلغي القانون رقم 12 لسنة 2003 وقانون مرتبة امتياز حقوق العمال رقم 125 لسنة 2010.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Direct Official Link from Ministry of Labour */}
            <a
              href={OFFICIAL_LABOR_LAW_2025.officialUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-colors shadow-sm"
              title="فتح ملف PDF الأصلي المنشور على البوابة الرسمية لوزارة العمل"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>فتح الرابط الرسمي (وزارة العمل PDF)</span>
            </a>

            {/* Offline Local Download */}
            <a
              href={OFFICIAL_LABOR_LAW_2025.localDownloadUrl}
              download="قانون-العمل-رقم-14-لسنة-2025.pdf"
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-medium transition-colors"
              title="تحميل النسخة المحفوظة في النظام للعمل دون إنترنت"
            >
              <Download className="w-3.5 h-3.5 text-slate-400" />
              <span>نسخة النظام (Offline)</span>
            </a>

            {/* View Details Modal */}
            <button
              type="button"
              onClick={() => setShowLawModal(true)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-teal-950/60 hover:bg-teal-900/80 border border-teal-700/60 text-teal-300 text-xs font-semibold transition-colors"
            >
              <FileText className="w-3.5 h-3.5 text-teal-400" />
              <span>استعراض مواد الإصدار والملخص</span>
            </button>

            {/* Copy Link Button */}
            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(OFFICIAL_LABOR_LAW_2025.officialUrl);
                setCopiedLink(true);
                onShowToast('success', 'تم نسخ رابط قانون العمل الرسمي إلى الحافظة.');
                setTimeout(() => setCopiedLink(false), 2500);
              }}
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 transition-colors"
              title="نسخ الرابط الرسمي"
            >
              {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>

        {/* Quick Highlights Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-slate-800/80 text-[11px]">
          <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800/60 text-slate-300">
            <span className="text-slate-500 block text-[9.5px]">صندوق تمويل التدريب (مادة 2):</span>
            <strong className="text-emerald-400">تحصيل 1% وانقضاء الخصومات</strong>
          </div>
          <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800/60 text-slate-300">
            <span className="text-slate-500 block text-[9.5px]">الرعاية والأجور (مادة 3):</span>
            <strong className="text-sky-400">الخدمات الاجتماعية والمجلس القومي</strong>
          </div>
          <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800/60 text-slate-300">
            <span className="text-slate-500 block text-[9.5px]">العمالة غير المنتظمة (مادة 7):</span>
            <strong className="text-amber-400">صندوق إعانات الطوارئ والرعاية</strong>
          </div>
          <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800/60 text-slate-300">
            <span className="text-slate-500 block text-[9.5px]">المحاكم العمالية (مادة 9 و13):</span>
            <strong className="text-indigo-400">محاكم عمالية متخصصة وإلغاء ق 12</strong>
          </div>
        </div>
      </section>

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

      {/* ===== نافذة استعراض مواد قانون العمل الجديد رقم 14 لسنة 2025 ===== */}
      {showLawModal && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5"
          onClick={() => setShowLawModal(false)}
        >
          <div
            className="bg-slate-900 border border-slate-700 rounded-2xl max-w-4xl w-full max-h-[92vh] flex flex-col shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="p-4 border-b border-slate-800 flex items-center justify-between gap-3 bg-slate-950/80">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center">
                  <Scale className="w-5 h-5 text-emerald-400" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    قانون رقم 14 لسنة 2025 بإصدار قانون العمل
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    الجريدة الرسمية — العدد 18 (تابع) الصادر في 3 مايو 2025م (5 ذي القعدة 1446هـ)
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowLawModal(false)}
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
                title="إغلاق النافذة"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Sub-header Actions */}
            <div className="px-4 py-2.5 bg-slate-950/50 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex flex-wrap items-center gap-2">
                <a
                  href={OFFICIAL_LABOR_LAW_2025.officialUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-[11px] transition-colors"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>فتح الرابط الرسمي (وزارة العمل PDF)</span>
                </a>
                <a
                  href={OFFICIAL_LABOR_LAW_2025.localDownloadUrl}
                  download="قانون-العمل-رقم-14-لسنة-2025.pdf"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-[11px] transition-colors"
                >
                  <Download className="w-3.5 h-3.5 text-slate-400" />
                  <span>تنزيل النسخة المحلية (Offline)</span>
                </a>
              </div>
              {onAskAssistant && (
                <button
                  onClick={() => {
                    setShowLawModal(false);
                    onAskAssistant('إيه أهم أحكام ومواد الإصدار في قانون العمل الجديد رقم 14 لسنة 2025؟');
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-teal-950/70 border border-teal-700/60 text-teal-300 hover:bg-teal-900/80 text-[11px] transition-colors"
                >
                  <MessageCircleQuestion className="w-3.5 h-3.5" />
                  <span>اسأل مساعد اللوائح عن قانون العمل 2025</span>
                </button>
              )}
            </div>

            {/* Body */}
            <div className="p-4 sm:p-6 overflow-y-auto space-y-6 text-slate-200 text-xs leading-relaxed">
              {/* بطاقة التعريف والملخص */}
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                <div className="text-[11px] font-bold text-emerald-400">نطاق القانون والأثر التشريعي:</div>
                <p className="text-slate-300 leading-relaxed text-[11.5px]">
                  أصدر السيد رئيس الجمهورية القانون رقم 14 لسنة 2025 بعد موافقة مجلس النواب. يلغي هذا القانون صراحة القانون رقم 12 لسنة 2003، والقانون رقم 125 لسنة 2010 بشأن مرتبة امتياز حقوق العمال. ويمثل الإطار التشريعي العام لكافة المنشآت والعمال ومنظمات العمل في جمهورية مصر العربية.
                </p>
              </div>

              {/* مواد الإصدار الكاملة */}
              <div className="space-y-3">
                <h4 className="text-sm font-bold text-white flex items-center gap-2 border-b border-slate-800 pb-2">
                  <FileText className="w-4 h-4 text-emerald-400" />
                  مواد إصدار القانون (المواد 1 إلى 13 كاملة)
                </h4>

                <div className="space-y-3">
                  <div className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800 space-y-1">
                    <span className="font-bold text-emerald-400 block text-[11px]">المادة الأولى — نطاق السريان والاستثناءات:</span>
                    <p className="text-slate-300">
                      يُعمل بأحكام هذا القانون والقانون المرافق في شأن العمل. كما تسري أحكامهما فيما لم يرد بشأنه نص خاص في عقود العمل الفردية أو اتفاقيات العمل الجماعية على العاملين الأجانب داخل جمهورية مصر العربية. ولا تسري أحكامه على العاملين بأجهزة الدولة (بما في ذلك الإدارة المحلية والهيئات العامة) وعمال الخدمة المنزلية ومن في حكمهم.
                    </p>
                  </div>

                  <div className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800 space-y-1">
                    <span className="font-bold text-emerald-400 block text-[11px]">المادة الثانية — صندوق تمويل التدريب والتأهيل (1%):</span>
                    <p className="text-slate-300">
                      يستمر صندوق تمويل التدريب والتأهيل المنشأ وفقاً لقانون العمل رقم 12 لسنة 2003 متمتعاً بالشخصية الاعتبارية العامة ويتبع الوزير المعني بشئون العمل. وتنقضي الخصومة في جميع الدعاوى غير الباتة المقيدة أو المنظورة لدى جميع المحاكم بين الصندوق والمنشآت التي موضوعها تحصيل نسبة (1%) لصالح الصندوق، وتمتنع المطالبة بما لم يسدد منها (ما لم تتمسك المنشأة باستمرار الخصومة خلال 6 أشهر).
                    </p>
                  </div>

                  <div className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800 space-y-1">
                    <span className="font-bold text-emerald-400 block text-[11px]">المادة الثالثة — صندوق الخدمات الاجتماعية والمجلس القومي للأجور:</span>
                    <p className="text-slate-300">
                      يستمر صندوق الخدمات الاجتماعية والصحية والثقافية ويتبع الوزير المعني بشئون العمل، كما يستمر المجلس القومي للأجور في ممارسة اختصاصاته على النحو المبين بالقانون.
                    </p>
                  </div>

                  <div className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800 space-y-1">
                    <span className="font-bold text-emerald-400 block text-[11px]">المادة الرابعة — صيانة حقوق ومزايا العمال السابقة:</span>
                    <p className="text-slate-300">
                      لا تخل أحكام هذا القانون بحقوق العمال السابق لهم الحصول عليها من أجور ومزايا مستمدة من القوانين واللوائح والاتفاقيات والقرارات الداخلية السابقة، وتعتبر المزايا الواردة بالتشريعات الخاصة الحد الأدنى الذي يتم التفاوض على أساسه.
                    </p>
                  </div>

                  <div className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800 space-y-1">
                    <span className="font-bold text-emerald-400 block text-[11px]">المادة الخامسة — تراخيص المنشآت الصناعية:</span>
                    <p className="text-slate-300">
                      لا تخل أحكام القانون بأحكام قانون تيسير إجراءات منح تراخيص المنشآت الصناعية الصادر بالقانون رقم 15 لسنة 2017.
                    </p>
                  </div>

                  <div className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800 space-y-1">
                    <span className="font-bold text-emerald-400 block text-[11px]">المادة السادسة — تراخيص مزاولة المهن والحرف وتوفيق الأوضاع:</span>
                    <p className="text-slate-300">
                      جواز تشغيل العمال دون التقيد بترخيص مزاولة المهنة (مادة 27) بشرط توفيق الأوضاع خلال 3 سنوات من صدور القرارات المنظمة، ويُعفى من الترخيص العمال المشتغلون لدى صاحب العمل لمدة تزيد على سنة قبل صدور القانون.
                    </p>
                  </div>

                  <div className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800 space-y-1">
                    <span className="font-bold text-emerald-400 block text-[11px]">المادة السابعة — صندوق إعانات الطوارئ والعمالة غير المنتظمة:</span>
                    <p className="text-slate-300">
                      تؤول جميع الأموال والحقوق والالتزامات الخاصة بحسابات الرعاية الاجتماعية والصحية للعمالة غير المنتظمة بوزارة العمل ومديرياتها إلى صندوق إعانات الطوارئ والخدمات الاجتماعية والصحية للعمالة غير المنتظمة.
                    </p>
                  </div>

                  <div className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800 space-y-1">
                    <span className="font-bold text-emerald-400 block text-[11px]">المادة الثامنة — التزام المنشآت بحصر العمال والأجور:</span>
                    <p className="text-slate-300">
                      تلتزم المنشآت الخاضعة بإرسال بيان مفصل بعدد العمال ومؤهلاتهم ومهنهم وأعمارهم وجنسياتهم والأجور التي يتقاضونها إلى الوزارة خلال 30 يوماً من تاريخ العمل به.
                    </p>
                  </div>

                  <div className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800 space-y-1">
                    <span className="font-bold text-emerald-400 block text-[11px]">المادتان التاسعة والعاشرة — إنشاء المحاكم العمالية المتخصصة:</span>
                    <p className="text-slate-300">
                      تحيل المحاكم تلقائياً الدعاوى والمنازعات المتداولة إلى المحاكم العمالية المتخصصة دون رسوم، وتستمر محكمة النقض ومحاكم الاستئناف في نظر الطعون القائمة قبل بدء عمل المحاكم العمالية.
                    </p>
                  </div>

                  <div className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800 space-y-1">
                    <span className="font-bold text-emerald-400 block text-[11px]">المادة الحادية عشرة — القرارات المنفذة للقانون:</span>
                    <p className="text-slate-300">
                      يصدر الوزير المعني بشئون العمل القرارات المنفذة خلال مدة لا تجاوز 90 يوماً، ويستمر العمل بالقرارات السارية مؤقتاً بما لا يتعارض مع نصوص القانون.
                    </p>
                  </div>

                  <div className="p-3.5 rounded-xl bg-slate-950/70 border border-rose-900/50 space-y-1">
                    <span className="font-bold text-rose-400 block text-[11px]">المادة الثانية عشرة — الإلغاءات الصريحة:</span>
                    <p className="text-slate-300">
                      يُلغى القانون رقم 12 لسنة 2003 بإصدار قانون العمل، والقانون رقم 125 لسنة 2010 بشأن مرتبة امتياز حقوق العمال، وكل حكم يخالف أحكام هذا القانون.
                    </p>
                  </div>

                  <div className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800 space-y-1">
                    <span className="font-bold text-emerald-400 block text-[11px]">المادة الثالثة عشرة — تاريخ النشر والنفاذ:</span>
                    <p className="text-slate-300">
                      نُشر في الجريدة الرسمية بتاريخ 3 مايو 2025، ويُعمل به من أول الشهر التالي لانقضاء 90 يوماً من تاريخ نشره، وفي شأن المحاكم العمالية اعتباراً من أول أكتوبر التالي.
                    </p>
                  </div>
                </div>
              </div>

              {/* قسم التعريفات والأحكام العامة */}
              <div className="space-y-3">
                <h4 className="text-sm font-bold text-white flex items-center gap-2 border-b border-slate-800 pb-2">
                  <Landmark className="w-4 h-4 text-sky-400" />
                  أهم التعريفات والضوابط العمالية والمالية (مادة 1 وما بعدها)
                </h4>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-[11px]">
                  <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800 space-y-1">
                    <strong className="text-sky-300 block">عناصر الأجر (الأساسي والمتغير):</strong>
                    <p className="text-slate-400 leading-relaxed">
                      يشمل الأجر الأساسي المحدد بالعقد وما يطرأ عليه من علاوات. ويشمل الأجر المتغير: العمولات والنسب المئوية، العلاوات الاجتماعية والاقتصادية، المنح المقررة، المكافآت، البدلات مقابل المخاطر، نصيب الأرباح، والمزايا العينية.
                    </p>
                  </div>
                  <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800 space-y-1">
                    <strong className="text-sky-300 block">مجالس المهارات القطاعية:</strong>
                    <p className="text-slate-400 leading-relaxed">
                      كيانات قطاعية تعزز التعاون بين الحكومة والقطاع الخاص لاستيفاء منظومة التعليم الفني والتقني والتدريب المهني لاحتياجات سوق العمل.
                    </p>
                  </div>
                  <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800 space-y-1">
                    <strong className="text-sky-300 block">اتفاقيات العمل الجماعية والتفاوض:</strong>
                    <p className="text-slate-400 leading-relaxed">
                      تنظيم المفاوضة الجماعية بين المنظمات النقابية العمالية وأصحاب الأعمال، ووضع أطر التوفيق والوساطة والتحكيم وحق الإضراب وفق الضوابط القانونية.
                    </p>
                  </div>
                  <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800 space-y-1">
                    <strong className="text-sky-300 block">حظر السخرة والتحرش والتنمر والتمييز (مواد 4 و5):</strong>
                    <p className="text-slate-400 leading-relaxed">
                      حظر قاطع لتشغيل العمال سخرة أو جبراً، وحظر التحرش أو التنمر في بيئة العمل، وحظر أي تمييز بسبب الجنس أو الدين أو الأصل أو الانتماء النقابي مع كفالة تكافؤ الفرص.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-slate-800 bg-slate-950 flex flex-wrap items-center justify-between gap-3 text-xs">
              <span className="text-slate-400 font-mono text-[11px]">
                رابط الوثيقة: labour.gov.eg/media/0iedik3q/...pdf
              </span>
              <div className="flex items-center gap-2">
                <a
                  href={OFFICIAL_LABOR_LAW_2025.officialUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold transition-colors"
                >
                  فتح المستند الأصلي الكامل
                </a>
                <button
                  type="button"
                  onClick={() => setShowLawModal(false)}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors"
                >
                  إغلاق
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RegulationLibrary;
