import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Database, FileSpreadsheet, LockKeyhole, RefreshCw } from 'lucide-react';
import { statutoryApi } from '../../services/statutory-api.js';
import type {
  StatutoryDistributionModel,
  StatutoryDistributionModelRow,
  StatutoryDistributionModelsResponse,
} from '../../types/erp.distribution.js';

interface StatutoryDistributionModelsBoardProps {
  organizationId: string;
  onShowToast: (type: 'success' | 'error' | 'warning' | 'info', msg: string) => void;
}

const number = (value: number | null | undefined) =>
  value === null || value === undefined ? '—' : new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(value);

const money = (value: number | null | undefined) => value === null || value === undefined ? '—' : `${number(value)} ج.م`;

const SourceBadge: React.FC<{ model: StatutoryDistributionModel; backend: 'postgres' | 'memory' }> = ({ model, backend }) => (
  <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] ${
    model.isActive
      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
      : 'border-slate-700 bg-slate-900 text-slate-400'
  }`}>
    {backend === 'postgres' ? <Database className="h-3 w-3" /> : <FileSpreadsheet className="h-3 w-3" />}
    {backend === 'postgres'
      ? (model.isActive ? 'مفعّل ومسجل في PostgreSQL' : 'مسجل وغير مفعّل في PostgreSQL')
      : (model.isActive ? 'مفعّل في النموذج المرجعي — SQL غير متاح' : 'غير مفعّل')}
  </span>
);

const DistributionModelTable: React.FC<{ model: StatutoryDistributionModel }> = ({ model }) => {
  const companyModel = model.modelKind === 'COMPANY_COMMITTEES';
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-800">
      <table className="min-w-full border-collapse text-right text-[11px]">
        <thead className="sticky top-0 bg-slate-950 text-slate-300">
          {companyModel ? (
            <tr>
              <th className="whitespace-nowrap px-2.5 py-2">م</th>
              <th className="min-w-64 px-2.5 py-2">اللجنة</th>
              <th className="whitespace-nowrap px-2.5 py-2">المحافظة</th>
              <th className="whitespace-nowrap px-2.5 py-2">الأعضاء</th>
              <th className="whitespace-nowrap px-2.5 py-2">الاشتراك/عضو</th>
              <th className="whitespace-nowrap px-2.5 py-2">الإجمالي</th>
              <th className="whitespace-nowrap px-2.5 py-2 text-sky-300">النقابة العامة 30%</th>
              <th className="whitespace-nowrap px-2.5 py-2 text-violet-300">اللجنة 60%</th>
              <th className="whitespace-nowrap px-2.5 py-2 text-amber-300">الاتحاد العام 10%</th>
            </tr>
          ) : (
            <tr>
              <th className="whitespace-nowrap px-2.5 py-2">م</th>
              <th className="min-w-64 px-2.5 py-2">اللجنة المهنية</th>
              <th className="whitespace-nowrap px-2.5 py-2">المحافظة</th>
              <th className="whitespace-nowrap px-2.5 py-2">الأعضاء</th>
              <th className="whitespace-nowrap px-2.5 py-2">فئة الإيصال</th>
              <th className="whitespace-nowrap px-2.5 py-2">أرقام الإيصالات</th>
              <th className="whitespace-nowrap px-2.5 py-2">المحصل</th>
              <th className="whitespace-nowrap px-2.5 py-2">دعم التثقيف</th>
              <th className="whitespace-nowrap px-2.5 py-2">أساس 30/60/10</th>
              <th className="whitespace-nowrap px-2.5 py-2 text-sky-300">النقابة العامة 30%</th>
              <th className="whitespace-nowrap px-2.5 py-2 text-violet-300">اللجنة 60%</th>
              <th className="whitespace-nowrap px-2.5 py-2 text-amber-300">الاتحاد العام 10%</th>
              <th className="whitespace-nowrap px-2.5 py-2">إجمالي النقابة العامة</th>
            </tr>
          )}
        </thead>
        <tbody className="divide-y divide-slate-800/80">
          {model.rows.map((row: StatutoryDistributionModelRow) => (
            <tr key={row.id} className="text-slate-300 odd:bg-slate-950/40 hover:bg-slate-800/50">
              <td className="px-2.5 py-2 font-mono text-slate-500">{row.sequence}</td>
              <td className="min-w-64 px-2.5 py-2 text-slate-200">{row.nameAr}</td>
              <td className="whitespace-nowrap px-2.5 py-2">{row.governorateAr || '—'}</td>
              <td className="whitespace-nowrap px-2.5 py-2 font-mono">{number(row.memberCount)}</td>
              {companyModel ? (
                <>
                  <td className="whitespace-nowrap px-2.5 py-2">{money(row.membershipFeePerMember)}</td>
                  <td className="whitespace-nowrap px-2.5 py-2 font-mono">{money(row.grossCollected)}</td>
                  <td className="whitespace-nowrap px-2.5 py-2 font-mono text-sky-200">{money(row.generalShare)}</td>
                  <td className="whitespace-nowrap px-2.5 py-2 font-mono text-violet-200">{money(row.committeeShare)}</td>
                  <td className="whitespace-nowrap px-2.5 py-2 font-mono text-amber-200">{money(row.federationShare)}</td>
                </>
              ) : (
                <>
                  <td className="whitespace-nowrap px-2.5 py-2">{money(row.receiptFee)}</td>
                  <td className="whitespace-nowrap px-2.5 py-2 font-mono">{row.receiptRangeAr || '—'}</td>
                  <td className="whitespace-nowrap px-2.5 py-2 font-mono">{money(row.grossCollected)}</td>
                  <td className="whitespace-nowrap px-2.5 py-2 font-mono">{money(row.educationSupport)}</td>
                  <td className="whitespace-nowrap px-2.5 py-2 font-mono">{money(row.distributionBase)}</td>
                  <td className="whitespace-nowrap px-2.5 py-2 font-mono text-sky-200">{money(row.generalShare)}</td>
                  <td className="whitespace-nowrap px-2.5 py-2 font-mono text-violet-200">{money(row.committeeShare)}</td>
                  <td className="whitespace-nowrap px-2.5 py-2 font-mono text-amber-200">{money(row.federationShare)}</td>
                  <td className="whitespace-nowrap px-2.5 py-2 font-mono">{money(row.generalCollected)}</td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

const ModelCard: React.FC<{ model: StatutoryDistributionModel; backend: 'postgres' | 'memory' }> = ({ model, backend }) => {
  const companyModel = model.modelKind === 'COMPANY_COMMITTEES';
  const calculatedRows = model.rows.filter((row) => row.calculated).length;
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/60">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-800 p-4">
        <div className="min-w-0">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-bold text-slate-100">{model.titleAr}</h3>
            <SourceBadge model={model} backend={backend} />
          </div>
          <p className="text-[11px] leading-6 text-slate-400">{model.basisAr}</p>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-slate-500">
            <span>المصدر: {model.sourceFile}</span>
            <span>الورقة: {model.sourceSheetAr}</span>
            <span>commit: <span dir="ltr" className="font-mono">{model.sourceCommit.slice(0, 7)}</span></span>
            <span>SHA-256: <span dir="ltr" className="font-mono">{model.sourceSha256.slice(0, 12)}…</span></span>
          </div>
        </div>
        <div className="rounded-lg border border-slate-700 bg-slate-950/70 px-3 py-2 text-center">
          <div className="text-[10px] text-slate-500">صفوف المصدر</div>
          <div className="font-mono text-lg font-bold text-slate-200">{number(model.sourceRowCount)}</div>
        </div>
      </div>

      <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-sky-500/20 bg-sky-500/5 p-3">
          <div className="text-[10px] text-slate-400">النقابة العامة</div>
          <div className="mt-1 font-mono text-lg font-bold text-sky-200">{number(model.shareConfig.generalPercent)}%</div>
          <div className="text-[10px] text-slate-500">{model.shareConfig.generalBeneficiaryAr}</div>
        </div>
        <div className="rounded-xl border border-violet-500/20 bg-violet-500/5 p-3">
          <div className="text-[10px] text-slate-400">اللجنة النقابية</div>
          <div className="mt-1 font-mono text-lg font-bold text-violet-200">{number(model.shareConfig.committeePercent)}%</div>
          <div className="text-[10px] text-slate-500">{model.shareConfig.committeeBeneficiaryAr}</div>
        </div>
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3">
          <div className="text-[10px] text-slate-400">الاتحاد العام حسب ملف Excel</div>
          <div className="mt-1 font-mono text-lg font-bold text-amber-200">{number(model.shareConfig.federationPercent)}%</div>
          <div className="text-[10px] text-slate-500">إن وجد وفق شرط المادة (2)</div>
        </div>
        <div className="rounded-xl border border-slate-700 bg-slate-950/50 p-3">
          <div className="text-[10px] text-slate-400">صفوف بها مبالغ ومعادلات</div>
          <div className="mt-1 font-mono text-lg font-bold text-slate-200">{number(calculatedRows)} / {number(model.sourceRowCount)}</div>
          <div className="text-[10px] text-slate-500">لا تُستنتج مبالغ للصفوف غير المحسوبة</div>
        </div>
      </div>

      {model.totals ? (
        <div className="mx-4 mb-4 grid grid-cols-2 gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 md:grid-cols-3 xl:grid-cols-6">
          <div><div className="text-[10px] text-slate-500">إجمالي الأعضاء</div><div className="font-mono text-sm font-semibold text-slate-100">{number(model.totals.memberCount)}</div></div>
          <div><div className="text-[10px] text-slate-500">إجمالي الاشتراكات</div><div className="font-mono text-sm font-semibold text-slate-100">{money(model.totals.grossCollected)}</div></div>
          <div><div className="text-[10px] text-slate-500">النقابة العامة 30%</div><div className="font-mono text-sm font-semibold text-sky-200">{money(model.totals.generalShare)}</div></div>
          <div><div className="text-[10px] text-slate-500">اللجان 60%</div><div className="font-mono text-sm font-semibold text-violet-200">{money(model.totals.committeeShare)}</div></div>
          <div><div className="text-[10px] text-slate-500">الاتحاد العام 10%</div><div className="font-mono text-sm font-semibold text-amber-200">{money(model.totals.federationShare)}</div></div>
          <div><div className="text-[10px] text-slate-500">فرق التوزيع في الملف</div><div className="font-mono text-sm font-semibold text-emerald-200">{money(model.totals.grossCollected - model.totals.generalShare - model.totals.committeeShare - model.totals.federationShare)}</div></div>
        </div>
      ) : (
        <div className="mx-4 mb-4 flex items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 text-[11px] text-amber-100">
          <AlertTriangle className="h-4 w-4 shrink-0 text-amber-300" />
          لا يعرض ملف اللجان المهنية إجمالياً مالياً؛ الظاهر هنا هو الصف الوحيد الذي يحتوي مبالغ ومعادلات في المصدر.
        </div>
      )}

      {model.shareConfig.educationSupportPerReceipt !== null && (
        <div className="mx-4 mb-4 rounded-lg border border-cyan-500/20 bg-cyan-500/5 p-3 text-[11px] leading-6 text-cyan-100">
          دعم التثقيف: <strong>{money(model.shareConfig.educationSupportPerReceipt)}</strong> لكل إيصال، كاملاً إلى {model.shareConfig.educationSupportBeneficiaryAr}، ثم تُحسب نسب 30/60/10 من الباقي.
        </div>
      )}

      {model.shareConfig.extraPercentages.map((extra) => (
        <div key={extra.id} className="mx-4 mb-4 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-[11px] leading-6 text-amber-100">
          <AlertTriangle className="mt-1 h-4 w-4 shrink-0 text-amber-300" />
          <div><strong>{extra.nameAr} {number(extra.percent)}% — {extra.statusAr}.</strong> {extra.detailAr}</div>
        </div>
      ))}

      <div className="border-t border-slate-800 p-4">
        <div className="mb-2 text-[11px] font-semibold text-slate-300">تفاصيل المصدر — القيم غير الموجودة بالملف تظهر بشرطة</div>
        <div className="max-h-[34rem] overflow-auto">
          <DistributionModelTable model={model} />
        </div>
      </div>

      {model.openItemsAr.length > 0 && (
        <div className="border-t border-slate-800 bg-slate-950/40 p-4">
          <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold text-amber-200">
            <AlertTriangle className="h-4 w-4" /> بنود معلّقة / حدود الاستخدام
          </div>
          <ul className="list-disc space-y-1 pr-5 text-[10px] leading-5 text-slate-400">
            {model.openItemsAr.map((item, index) => <li key={`${model.id}-open-${index}`}>{item}</li>)}
          </ul>
        </div>
      )}

      <div className="flex items-start gap-2 border-t border-rose-500/20 bg-rose-500/5 p-4 text-[10px] leading-5 text-rose-100">
        <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0 text-rose-300" />
        <div><strong>{model.postingEnabled ? 'مسموح بالترحيل' : 'غير مفعّل للترحيل المحاسبي'}.</strong> {model.postingBlockReasonAr}</div>
      </div>
    </section>
  );
};

export const StatutoryDistributionModelsBoard: React.FC<StatutoryDistributionModelsBoardProps> = ({ organizationId, onShowToast }) => {
  const [data, setData] = useState<StatutoryDistributionModelsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await statutoryApi.getDistributionModels());
    } catch (err) {
      const message = (err as Error).message || 'تعذر تحميل نماذج التوزيع';
      setError(message);
      onShowToast('error', message);
    } finally {
      setLoading(false);
    }
  }, [onShowToast]);

  useEffect(() => { void load(); }, [load, organizationId]);

  if (loading) {
    return <div className="flex items-center justify-center gap-2 p-12 text-sm text-slate-400"><RefreshCw className="h-4 w-4 animate-spin" /> جارٍ تحميل نماذج التوزيع…</div>;
  }

  if (error || !data) {
    return (
      <div className="rounded-xl border border-rose-500/30 bg-rose-500/5 p-5 text-sm text-rose-200">
        <div>{error || 'لا توجد بيانات.'}</div>
        <button onClick={() => void load()} className="mt-3 inline-flex items-center gap-2 rounded-lg border border-rose-500/30 px-3 py-2 text-xs hover:bg-rose-500/10"><RefreshCw className="h-3.5 w-3.5" /> إعادة المحاولة</button>
      </div>
    );
  }

  return (
    <div className="space-y-4" dir="rtl">
      <div className="rounded-2xl border border-sky-500/25 bg-slate-900/70 p-4">
        <div className="mb-2 flex items-center gap-2 text-sm font-bold text-sky-200"><CheckCircle2 className="h-4 w-4" /> نماذج المادة (2) من ملفي Excel المحدّثين</div>
        <p className="text-[11px] leading-6 text-slate-300">النص الرسمي: <strong>10% للاتحاد النقابي إن وجد + 60% للجنة النقابية + 30% للنقابة العامة.</strong> نموذج لجان الشركات يحسب 30/60/10 من كامل الاشتراك، ونموذج اللجان المهنية يخصم دعم التثقيف المبيّن في الملف قبل توزيع الباقي.</p>
        <div className="mt-3 grid gap-2 text-[10px] leading-5 text-slate-400 md:grid-cols-2">
          <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-3">هذا التفعيل مرجعي/حسابي فقط؛ لا يغيّر قاعدة الإيصالات التشغيلية <b className="text-slate-200">50/30/20</b> ولا يستبدل مرجع CSV المستقل <b className="text-slate-200">30/10/10/50</b>.</div>
          <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 text-amber-100">حصة الاتحاد مرتبطة بشرط وجوده في نص المادة. عمود المطبوعات 10% في ملف اللجان المهنية غير محسوب ويبقى معلّقاً ولا يدخل حصص المادة (2).</div>
        </div>
        <div className={`mt-3 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[10px] ${data.storageBackend === 'postgres' ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200' : 'border-amber-500/30 bg-amber-500/10 text-amber-100'}`}>
          <Database className="h-3 w-3" />
          {data.storageBackend === 'postgres' ? 'البيانات محمّلة من PostgreSQL' : 'PostgreSQL غير متاح — عرض البيانات المرجعية المضمّنة'}
        </div>
      </div>

      {data.models.map((model) => <ModelCard key={model.id} model={model} backend={data.storageBackend} />)}
    </div>
  );
};

export default StatutoryDistributionModelsBoard;
