import React, { useCallback, useEffect, useState } from 'react';
import {
  Briefcase,
  Calculator,
  FileSpreadsheet,
  Loader2,
  Receipt,
  RefreshCw,
  Scale,
} from 'lucide-react';
import { api } from '../../services/api.js';
import {
  BracketTable,
  Card,
  Field,
  fmt,
  LegalNote,
  NumberInput,
  StatBox,
  Toast,
  type TaxViewProps,
} from './shared.js';
import type { BusinessTaxResult, TaxRegister } from '../../types/erp.tax.js';

/** التبويب (ب): ضريبة الأرباح التجارية والصناعية والمهن الحرة — أشخاص طبيعيون بالشرائح واعتباريون بسعر موحّد. */
export const BusinessTaxView: React.FC<TaxViewProps> = ({
  organizationId,
  currentUser,
  onShowToast,
}) => {
  const [netProfit, setNetProfit] = useState(500000);
  const [adjustments, setAdjustments] = useState(0);
  const [entityType, setEntityType] = useState<'NATURAL' | 'CORPORATE'>(
    'NATURAL',
  );
  const [useExemption, setUseExemption] = useState(true);
  const [result, setResult] = useState<BusinessTaxResult | null>(null);
  const [register, setRegister] = useState<TaxRegister | null>(null);
  const [busy, setBusy] = useState(false);
  const [steps, setSteps] = useState<string[]>([]);
  const year = new Date().getFullYear();

  const loadRegister = useCallback(async () => {
    try {
      setRegister(await api.getTaxRegister(year));
    } catch (err: any) {
      onShowToast('error', err.message || 'تعذر تحميل سجل الضرائب.');
    }
  }, [year, onShowToast]);

  useEffect(() => {
    void loadRegister();
  }, [loadRegister]);

  const calculate = async () => {
    setBusy(true);
    try {
      const computed = await api.calculateBusinessTax({
        netProfit,
        entityType,
        personalExemption: useExemption,
        adjustments,
      });
      setResult(computed);
      setSteps([]);
    } catch (err: any) {
      onShowToast('error', err.message || 'تعذر حساب ضريبة الأرباح.');
    } finally {
      setBusy(false);
    }
  };

  const postEntry = async () => {
    if (!result) return;
    setBusy(true);
    try {
      const recorded = await api.recordTaxEntry({
        kind: 'BUSINESS_TAX',
        amount: result.tax,
        description: `ضريبة أرباح تجارية وصناعية ومهن حرة (${result.entityType === 'CORPORATE' ? 'اعتباري' : 'طبيعي'}) — ${year}`,
        organizationId,
        post: true,
      });
      setSteps(recorded.steps);
      onShowToast(
        recorded.posted ? 'success' : 'warning',
        recorded.posted
          ? 'رُحّل قيد الضريبة ورُبط بالنموذج الضريبي.'
          : recorded.steps.slice(-1)[0],
      );
      await loadRegister();
    } catch (err: any) {
      onShowToast('error', err.message || 'تعذر تسجيل القيد.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4" data-assistant-screen="business-tax">
      <LegalNote>
        يُعدَّل الربح المحاسبي بالتعديلات الضريبية (المصاريف غير المقبولة،
        الإهلاك الضريبي، فروق المخزون). الأشخاص الطبيعيون يخضعون للشرائح
        التصاعدية بعد الإعفاء الشخصي، والأشخاص الاعتباريون لسعر موحّد 22.5%
        (وتُزاد على البنوك وشركات البترول والتأمين).
      </LegalNote>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card title="مدخلات إقرار الأرباح" icon={Calculator} tone="sky">
          <div className="grid grid-cols-2 gap-3">
            <Field label="نوع الممول">
              <select
                value={entityType}
                onChange={(event) =>
                  setEntityType(event.target.value as 'NATURAL' | 'CORPORATE')
                }
                className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-[12px] text-slate-200"
              >
                <option value="NATURAL">
                  شخص طبيعي / منشأة فردية / مهنة حرة
                </option>
                <option value="CORPORATE">شخص اعتباري (شركة أموال)</option>
              </select>
            </Field>
            <Field label="صافي الربح المحاسبي (ج)">
              <NumberInput value={netProfit} onChange={setNetProfit} />
            </Field>
            <Field
              label="التعديلات الضريبية (ج)"
              hint="مصاريف غير مقبولة (+) أو إعفاءات (−)"
            >
              <NumberInput value={adjustments} onChange={setAdjustments} />
            </Field>
            <Field label="تطبيق الإعفاء الشخصي">
              <label className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-[11px] text-slate-300">
                <input
                  type="checkbox"
                  checked={useExemption}
                  disabled={entityType === 'CORPORATE'}
                  onChange={(event) => setUseExemption(event.target.checked)}
                />
                يُخصم 20,000 ج (للأشخاص الطبيعيين فقط)
              </label>
            </Field>
          </div>
          <button
            type="button"
            data-action="calc-business-tax"
            onClick={calculate}
            disabled={busy}
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-teal-700 px-3 py-2 text-[11px] font-bold text-white hover:bg-teal-600 disabled:opacity-50"
          >
            {busy ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Scale className="w-3.5 h-3.5" />
            )}
            احسب ضريبة الأرباح
          </button>
          <div className="grid grid-cols-2 gap-2">
            <StatBox
              label="الربح المحاسبي"
              value={`${fmt(result?.netProfit ?? netProfit)} ج`}
            />
            <StatBox
              label="التعديلات"
              value={`${fmt(result?.adjustments ?? adjustments)} ج`}
            />
            <StatBox
              label="الإعفاء المطبَّق"
              value={`${fmt(result?.appliedExemption ?? 0)} ج`}
              tone="sky"
            />
            <StatBox
              label="الوعاء الخاضع"
              value={`${fmt(result?.taxableBase ?? 0)} ج`}
              tone="amber"
            />
            <StatBox
              label="الضريبة المستحقة"
              value={`${fmt(result?.tax ?? 0)} ج`}
              tone="emerald"
            />
            <StatBox
              label="السعر"
              value={result?.rate ? `${result.rate}%` : 'شرائح تصاعدية'}
              hint={`المتوسط الفعلي ${result?.effectiveRate ?? 0}%`}
            />
          </div>
        </Card>

        <Card title="توزيع الأرباح على الشرائح" icon={FileSpreadsheet}>
          {result && result.brackets.length > 0 ? (
            <BracketTable rows={result.brackets} />
          ) : result ? (
            <div className="space-y-2 text-[11px] text-slate-300">
              <p>
                شخص اعتباري — سعر موحّد 22.5% على الوعاء{' '}
                {fmt(result.taxableBase)} ج.
              </p>
              <p className="text-slate-400">
                الضريبة:{' '}
                <span className="font-mono text-emerald-300">
                  {fmt(result.tax)} ج
                </span>
              </p>
            </div>
          ) : (
            <p className="text-[11px] text-slate-500">
              اضغط «احسب ضريبة الأرباح» لعرض جدول الشرائح أو السعر الموحّد.
            </p>
          )}
        </Card>

        <Card
          title="ترحيل قيد الضريبة إلى النماذج"
          icon={Receipt}
          tone="emerald"
        >
          <div className="space-y-2 text-[11px] text-slate-300">
            <div className="rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-[10px] leading-5 text-slate-400">
              يُسجَّل القيد على حساب الضريبة المستحقة مقابل مصروف الضريبة/البنك،
              ثم يُعتمد ويُرحّل ليتغذّى منه إقرار ضريبة الدخل ونموذج (41) للخصم
              والإضافة.
            </div>
            <div className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950 px-3 py-2">
              <span>المبلغ المُرحَّل</span>
              <span className="font-mono text-emerald-300">
                {fmt(result?.tax ?? 0)} ج
              </span>
            </div>
            <button
              type="button"
              data-action="post-business-tax-entry"
              onClick={postEntry}
              disabled={!result || busy || (result?.tax ?? 0) <= 0}
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-emerald-700 px-3 py-2 text-[11px] font-bold text-white hover:bg-emerald-600 disabled:opacity-50"
            >
              {busy ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Briefcase className="w-3.5 h-3.5" />
              )}
              تسجيل القيد واعتماده وترحيله
            </button>
            {steps.length > 0 && (
              <Toast tone="success">خطوات التنفيذ: {steps.join(' ← ')}</Toast>
            )}
            <div className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-[10px] text-slate-400">
              <span>حركات السنة على حسابات الضرائب</span>
              <span className="font-mono text-slate-300">
                {register?.lines.length ?? 0} حركة
              </span>
            </div>
            <button
              type="button"
              onClick={() => void loadRegister()}
              className="flex items-center gap-1 text-[10px] text-slate-400 hover:text-slate-200"
            >
              <RefreshCw className="w-3 h-3" /> تحديث السجل الضريبي
            </button>
          </div>
        </Card>
      </div>
    </div>
  );
};

export default BusinessTaxView;
