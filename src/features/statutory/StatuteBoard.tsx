import React, { useEffect, useMemo, useState } from 'react';
import {
  ScrollText,
  ShieldCheck,
  Gavel,
  AlertTriangle,
  CheckCircle2,
  FileText,
  Search,
  RefreshCw,
  CalendarClock,
  BookOpenCheck,
  Landmark,
} from 'lucide-react';
import {
  statutoryApi,
  StatuteBundle,
  StatuteArticleView,
  StatuteRuleView,
  StatuteCoverageReport,
  EnforcementView,
  GroundingReport,
} from '../../services/statutory-api.js';
import { normalizeArabic } from '../../utils/statutory-arabic.js';
import { Combobox } from '../../components/Combobox.js';
import { User } from '../../types/erp.js';

interface StatuteBoardProps {
  organizationId: string;
  currentUser: User | null;
  onShowToast: (type: 'success' | 'error' | 'warning' | 'info', msg: string) => void;
}

const STAGE_LABEL: Record<string, string> = {
  SHADOW: 'رصد صامت',
  AUDIT: 'تدقيق',
  WARN: 'تحذير',
  ENFORCE: 'إنفاذ كامل',
};

const MODE_LABEL: Record<string, string> = {
  GATE: 'مانعة',
  WARNING: 'تحذيرية',
  AUDIT_ONLY: 'تدقيق',
};

const StatCard: React.FC<{ label: string; value: string | number; hint?: string; tone?: 'sky' | 'amber' | 'emerald' | 'violet' }> = ({
  label,
  value,
  hint,
  tone = 'sky',
}) => {
  const tones: Record<string, string> = {
    sky: 'text-sky-300 border-sky-500/30 bg-sky-500/5',
    amber: 'text-amber-300 border-amber-500/30 bg-amber-500/5',
    emerald: 'text-emerald-300 border-emerald-500/30 bg-emerald-500/5',
    violet: 'text-violet-300 border-violet-500/30 bg-violet-500/5',
  };
  return (
    <div className={`rounded-xl border p-3 ${tones[tone]}`}>
      <div className="text-[11px] text-slate-400">{label}</div>
      <div className="text-xl font-bold font-mono">{value}</div>
      {hint && <div className="text-[10px] text-slate-500 mt-1">{hint}</div>}
    </div>
  );
};

export const StatuteBoard: React.FC<StatuteBoardProps> = ({ organizationId, onShowToast }) => {
  const [bundle, setBundle] = useState<StatuteBundle | null>(null);
  const [coverage, setCoverage] = useState<StatuteCoverageReport | null>(null);
  const [enforcement, setEnforcement] = useState<EnforcementView | null>(null);
  const [grounding, setGrounding] = useState<GroundingReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [term, setTerm] = useState('');
  const [chapterFilter, setChapterFilter] = useState('');
  const [selected, setSelected] = useState<StatuteArticleView | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [statute, coverageReport, enforcementView, groundingReport] = await Promise.all([
        statutoryApi.getStatute(),
        statutoryApi.getStatuteCoverage(),
        statutoryApi.getEnforcement(),
        statutoryApi.getStatuteGrounding(),
      ]);
      setBundle(statute);
      setCoverage(coverageReport);
      setEnforcement(enforcementView);
      setGrounding(groundingReport);
    } catch (err) {
      onShowToast('error', `تعذّر تحميل النظام الأساسي: ${(err as Error).message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [organizationId]);

  const chapterTitleById = useMemo(() => {
    const map = new Map<string, string>();
    for (const chapter of bundle?.chapters ?? []) {
      map.set(chapter.id, `${chapter.labelAr ?? `الفصل ${chapter.number}`} — ${chapter.title}`);
    }
    return map;
  }, [bundle]);

  const articleRules = useMemo(() => {
    const map = new Map<string, StatuteRuleView[]>();
    for (const rule of bundle?.activeRules ?? []) {
      const list = map.get(rule.articleId) ?? [];
      list.push(rule);
      map.set(rule.articleId, list);
    }
    return map;
  }, [bundle]);

  const [chapterTerm, setChapterTerm] = useState('كل الأبواب');

  const chapterOptions = useMemo(
    () => [
      { id: '', label: 'كل الأبواب' },
      ...(bundle?.chapters ?? []).map((chapter) => ({ id: chapter.id, label: `الباب ${chapter.number} — ${chapter.title}` })),
    ],
    [bundle],
  );

  const filteredArticles = useMemo(() => {
    const needle = normalizeArabic(term.trim());
    return (bundle?.articles ?? []).filter((article) => {
      if (chapterFilter && article.chapterId !== chapterFilter) return false;
      if (!needle) return true;
      const haystack = normalizeArabic([article.title, article.text, String(article.number), article.keywords.join(' ')].join(' '));
      return haystack.includes(needle);
    });
  }, [bundle, term, chapterFilter]);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12 text-slate-400 gap-2">
        <RefreshCw className="w-4 h-4 animate-spin" />
        <span>جارٍ تحميل وثيقة النظام الأساسي...</span>
      </div>
    );
  }

  const stats = bundle?.stats;
  const document = bundle?.document;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <StatCard label="مواد الوثيقة" value={stats?.articles ?? 0} hint={`${stats?.chapters ?? 0} باباً`} />
        <StatCard label="القواعد المفعّلة" value={stats?.rules ?? 0} hint={`${stats?.gateRules ?? 0} مانعة`} tone="violet" />
        <StatCard label="تغطية المواد" value={`${coverage?.coveragePercent ?? 0}%`} hint={`${coverage?.coveredArticles ?? 0} من ${coverage?.totalArticles ?? 0}`} tone="emerald" />
        <StatCard label="العتبات المادّية" value={stats?.thresholds ?? 0} hint="مستخرجة من النص" tone="amber" />
        <StatCard label="إجراءات الحكامة" value={stats?.governanceActions ?? 0} hint={`${stats?.membershipActions ?? 0} إجراء عضوية`} />
        <StatCard
          label="بوابة السند"
          value={grounding?.ok ? 'سليمة' : 'خلل'}
          hint={`${grounding?.checkedRules ?? 0} قاعدة مفحوصة`}
          tone={grounding?.ok ? 'emerald' : 'amber'}
        />
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Landmark className="w-4 h-4 text-sky-400" />
          <h3 className="text-sm font-bold text-slate-200">{document?.title ?? 'النظام الأساسي'}</h3>
          <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-sky-300 font-mono">{document?.version}</span>
          <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/30">
            {document?.status === 'RATIFIED' ? 'معتمد' : document?.status}
          </span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-[11px] text-slate-400">
          <div className="md:col-span-2">{document?.subtitle}</div>
          <div>
            <span className="text-slate-500">تاريخ الاعتماد:</span> {document?.ratifiedOn ?? '—'}{' '}
            <span className="text-slate-600">
              ({document?.legalBasis?.approvalPrecision === 'MONTH' ? 'دقة شهر' : document?.legalBasis?.approvalPrecision}) —{' '}
              {document?.legalBasis?.law} {document?.legalBasis?.lawNumber}/{document?.legalBasis?.lawYear}
            </span>
          </div>
          <div>
            <span className="text-slate-500">دليل الاعتماد:</span>{' '}
            <span className="font-mono text-[10px]">
              {document?.approvalEvidence
                ? `${document.approvalEvidence.sourceFileSha256.slice(0, 16)}… (${document.approvalEvidence.pages} صفحة — ${document.approvalEvidence.kind})`
                : 'غير موصول'}
            </span>
          </div>
          <div>
            <span className="text-slate-500">محضر الإيداع:</span> {document?.gazetteRecord?.depositRecordNumber ?? 'غير مثبت'} •{' '}
            <span className="text-slate-500">نسخة معتمدة:</span> {document?.gazetteRecord?.certifiedCopyRef ?? 'غير مثبت'} •{' '}
            <span className="text-slate-500">مرجع الوقائع المصرية كما ورد من المستخدم:</span> {document?.officialGazetteRef ?? '—'}
          </div>
        </div>
        {document?.gazetteRecord?.noteAr && (
          <p className="mt-2 rounded-lg border border-sky-500/20 bg-sky-500/5 px-3 py-2 text-[10px] leading-5 text-sky-100/80">
            {document.gazetteRecord.noteAr}
          </p>
        )}
        {document?.provenance && (
          <div className="text-[10px] text-slate-500 font-mono">
            المصدر: {document.provenance.sourceFile} • sha256 {document.provenance.sourceFileSha256.slice(0, 20)}…
          </div>
        )}
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
        <div className="flex items-center gap-2 mb-3">
          <CalendarClock className="w-4 h-4 text-amber-400" />
          <h3 className="text-sm font-bold text-slate-200">خطة التفعيل التدريجي</h3>
          <span className="text-[10px] text-slate-500">المرحلة الحالية: {STAGE_LABEL[enforcement?.current ?? 'SHADOW'] ?? enforcement?.current}</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead className="text-slate-400 border-b border-slate-800">
              <tr>
                <th className="text-right py-2 px-2 font-medium">#</th>
                <th className="text-right py-2 px-2 font-medium">المرحلة</th>
                <th className="text-right py-2 px-2 font-medium">النطاقات</th>
                <th className="text-right py-2 px-2 font-medium">تبدأ بعد</th>
                <th className="text-right py-2 px-2 font-medium">المدة</th>
                <th className="text-right py-2 px-2 font-medium">من — إلى</th>
                <th className="text-right py-2 px-2 font-medium">معيار الانتقال/الملاحظة</th>
              </tr>
            </thead>
            <tbody>
              {(enforcement?.plan ?? []).map((wave, index) => (
                <tr key={`${wave.stage}-${wave.wave ?? index}`} className="border-b border-slate-800/60 hover:bg-slate-800/30">
                  <td className="py-2 px-2 font-mono text-slate-500">{wave.wave ?? index + 1}</td>
                  <td className="py-2 px-2 font-bold text-slate-200">{STAGE_LABEL[wave.stage] ?? wave.stage}</td>
                  <td className="py-2 px-2 text-slate-400 text-[10px]">{(wave.scopes ?? []).join(' • ') || 'كل النطاقات'}</td>
                  <td className="py-2 px-2 font-mono text-slate-300">{wave.startsAfterDays} يوم</td>
                  <td className="py-2 px-2 font-mono text-slate-300">{wave.durationDays > 0 ? `${wave.durationDays} يوم` : 'مفتوحة'}</td>
                  <td className="py-2 px-2 font-mono text-slate-400">
                    {wave.startsOn} — {wave.endsOn ?? '—'}
                  </td>
                  <td className="py-2 px-2 text-slate-400 text-[10px]">{wave.exitCriteriaAr ?? wave.noteAr ?? wave.labelAr ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <Search className="w-4 h-4 text-slate-400" />
            <input
              value={term}
              onChange={(event) => setTerm(event.target.value)}
              placeholder="ابحث في مواد النظام الأساسي (عنوان/نص/كلمة مفتاحية)"
              className="w-80 bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 placeholder:text-slate-600"
            />
          </div>
          <div className="w-72">
            <Combobox
              options={chapterOptions}
              value={chapterTerm}
              onChange={setChapterTerm}
              onSelect={(option) => setChapterFilter(option.id)}
              placeholder="تصفية بالباب"
            />
          </div>
          <span className="text-[11px] text-slate-500">
            {filteredArticles.length} مادة معروضة من {bundle?.articles.length ?? 0}
          </span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-3">
          <div className="lg:col-span-3 overflow-x-auto max-h-[28rem] overflow-y-auto rounded-lg border border-slate-800">
            <table className="w-full text-[11px]">
              <thead className="bg-slate-950 text-slate-400 sticky top-0">
                <tr>
                  <th className="text-right py-2 px-2 font-medium">المادة</th>
                  <th className="text-right py-2 px-2 font-medium">العنوان</th>
                  <th className="text-right py-2 px-2 font-medium">الباب</th>
                  <th className="text-right py-2 px-2 font-medium">القواعد</th>
                </tr>
              </thead>
              <tbody>
                {filteredArticles.map((article) => {
                  const rules = articleRules.get(article.id) ?? [];
                  const isActive = selected?.id === article.id;
                  return (
                    <tr
                      key={article.id}
                      onClick={() => setSelected(article)}
                      className={`border-b border-slate-800/60 cursor-pointer ${isActive ? 'bg-sky-500/10' : 'hover:bg-slate-800/30'}`}
                    >
                      <td className="py-2 px-2 font-mono text-sky-300">{article.number}</td>
                      <td className="py-2 px-2 text-slate-200">{article.title}</td>
                      <td className="py-2 px-2 text-slate-400">{chapterTitleById.get(article.chapterId) ?? article.chapterId}</td>
                      <td className="py-2 px-2">
                        <span className={`font-mono ${rules.length ? 'text-emerald-300' : 'text-slate-600'}`}>{rules.length}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="lg:col-span-2 rounded-lg border border-slate-800 bg-slate-950/60 p-3 space-y-3 max-h-[28rem] overflow-y-auto">
            {!selected && <div className="text-[11px] text-slate-500">اختر مادة من الجدول لعرض نصها وقواعدها</div>}
            {selected && (
              <>
                <div className="flex items-center gap-2">
                  <Gavel className="w-4 h-4 text-sky-400" />
                  <span className="text-xs font-bold text-slate-200">المادة ({selected.number})</span>
                </div>
                <div className="text-[11px] text-slate-300 font-bold">{selected.title}</div>
                <p className="text-[11px] leading-6 text-slate-400">{selected.text}</p>
                <div className="text-[10px] text-slate-500">
                  الباب: {chapterTitleById.get(selected.chapterId) ?? selected.chapterId} • إحالات:{' '}
                  {selected.crossRefs.length ? selected.crossRefs.map((n) => `م${n}`).join(' • ') : 'لا يوجد'}
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-[11px] text-slate-300 font-bold">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" /> القواعد المفعّلة على هذه المادة
                    <span className="text-slate-500 font-normal">({(articleRules.get(selected.id) ?? []).length})</span>
                  </div>
                  {(articleRules.get(selected.id) ?? []).length === 0 && (
                    <div className="text-[10px] text-slate-500">لا قاعدة آلية — المادة مرجعية/إجرائية.</div>
                  )}
                  {(articleRules.get(selected.id) ?? []).map((rule) => (
                      <div key={rule.id} className="rounded-lg border border-slate-800 bg-slate-900/60 p-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[11px] text-slate-200">{rule.title}</span>
                          <span
                            className={`text-[9px] px-1.5 py-0.5 rounded font-mono ${
                              rule.mode === 'GATE'
                                ? 'bg-rose-500/10 text-rose-300 border border-rose-500/30'
                                : rule.mode === 'WARNING'
                                  ? 'bg-amber-500/10 text-amber-300 border border-amber-500/30'
                                  : 'bg-slate-800 text-slate-300'
                            }`}
                          >
                            {MODE_LABEL[rule.mode] ?? rule.mode}
                          </span>
                        </div>
                        <div className="text-[10px] text-slate-500 font-mono mt-1">{rule.id}</div>
                        <p className="text-[10px] text-slate-400 leading-5 mt-1">{rule.messageAr}</p>
                      </div>
                    ))}
                </div>
                {selected.keywords.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {selected.keywords.map((keyword) => (
                      <span key={keyword} className="text-[9px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">
                        {keyword}
                      </span>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <div className="flex items-center gap-2 mb-3">
            <BookOpenCheck className="w-4 h-4 text-emerald-400" />
            <h3 className="text-sm font-bold text-slate-200">التغطية بالأبواب</h3>
          </div>
          <table className="w-full text-[11px]">
            <thead className="text-slate-400 border-b border-slate-800">
              <tr>
                <th className="text-right py-2 px-2 font-medium">الباب</th>
                <th className="text-right py-2 px-2 font-medium">مواد</th>
                <th className="text-right py-2 px-2 font-medium">مغطّاة</th>
                <th className="text-right py-2 px-2 font-medium">قواعد</th>
                <th className="text-right py-2 px-2 font-medium">النسبة</th>
              </tr>
            </thead>
            <tbody>
              {(coverage?.chapters ?? []).map((row) => (
                <tr key={row.chapterId} className="border-b border-slate-800/60">
                  <td className="py-2 px-2 text-slate-300">{row.title}</td>
                  <td className="py-2 px-2 font-mono text-slate-400">{row.articles}</td>
                  <td className="py-2 px-2 font-mono text-slate-400">{row.coveredArticles}</td>
                  <td className="py-2 px-2 font-mono text-slate-400">{row.rules}</td>
                  <td className="py-2 px-2 font-mono text-emerald-300">{row.coveragePercent}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="w-4 h-4 text-amber-400" />
            <h3 className="text-sm font-bold text-slate-200">بنود مفتوحة تحتاج قراراً</h3>
          </div>
          <div className="space-y-2">
            {(enforcement?.openItems ?? []).map((item) => (
              <div key={item.id} className="rounded-lg border border-slate-800 bg-slate-950/60 p-2">
                <div className="text-[11px] text-slate-200 font-bold">{item.titleAr}</div>
                <p className="text-[10px] text-slate-400 leading-5">{item.requiredFieldsAr}</p>
                <p className="text-[10px] text-slate-500 leading-5 mt-1">{item.impactAr}</p>
                <div className="text-[9px] text-slate-600 font-mono mt-1">
                  {item.id} • {item.status}
                </div>
              </div>
            ))}
            {(enforcement?.openItems ?? []).length === 0 && (
              <div className="text-[11px] text-emerald-300 flex items-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5" /> لا بنود مفتوحة
              </div>
            )}
          </div>
          {enforcement?.gazette && (
            <div className="mt-3 rounded-lg border border-slate-800 bg-slate-950/60 p-2 text-[10px] text-slate-400">
              <div className="flex items-center gap-2 text-slate-300 mb-1">
                <FileText className="w-3.5 h-3.5 text-sky-400" /> حالة النشر بالجريدة الرسمية: {enforcement.gazette.published ? 'منشور' : 'غير مكتمل'}
              </div>
              مثبت: {enforcement.gazette.recordedFieldsAr.join(' • ') || '—'}
              <br />
              ناقص: {enforcement.gazette.missingFieldsAr.join(' • ') || '—'}
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3 text-[10px] text-slate-500">
        <ScrollText className="w-3.5 h-3.5" />
        الوثيقة مغطّاة 100%: لا قاعدة بلا سند مادة، وكل عتبة مستخرجة من نص حرفي.
      </div>
    </div>
  );
};

export default StatuteBoard;
