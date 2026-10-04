import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BadgeCheck,
  Calculator,
  FileSpreadsheet,
  Loader2,
  Receipt,
  RefreshCw,
  TrendingUp,
  Users,
} from 'lucide-react';
import { api } from '../../services/api.js';
import {
  BracketTable,
  Card,
  Field,
  fmt,
  fmtInt,
  LegalNote,
  NumberInput,
  StatBox,
  Toast,
  type TaxViewProps,
} from './shared.js';
import type {
  PayrollTaxResult,
  TaxEntryDraft,
  TaxRegister,
} from '../../types/erp.tax.js';

/** التبويب (أ): ضريبة كسب العمل وفق القانون + توزيعات الشرائح + ربطها بالنماذج. */
export const PayrollTaxView: React.FC<TaxViewProps> = ({
  organizationId,
  currentUser,
  onShowToast,
}) => {
  const [monthlyGross, setMonthlyGross] = useState(20000);
  const [monthlyInsurance, setMonthlyInsurance] = useState(2200);
  const [otherExemptions, setOtherExemptions] = useState(0);
  const [result, setResult] = useState<PayrollTaxResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [posting, setPosting] = useState(false);
  const [register, setRegister] = useState<TaxRegister | null>(null);
  const [lastSteps, setLastSteps] = useState<string[]>([]);
  const [draftPreview, setDraftPreview] = useState<TaxEntryDraft | null>(null);

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
      const computed = await api.calculatePayrollTax({
        monthlyGross,
        monthlyInsurance,
        otherExemptions,
      });
      setResult(computed);
      setLastSteps([]);
      const preview = await api.getTaxEntryDraft(
        'PAYROLL_TAX',
        computed.monthlyTax,
      );
      setDraftPreview(preview);
    } catch (err: any) {
      onShowToast('error', err.message || 'تعذر حساب ضريبة كسب العمل.');
    } finally {
      setBusy(false);
    }
  };

  const postEntry = async () => {
    if (!result) return;
    setPosting(true);
    try {
      const recorded = await api.recordTaxEntry({
        kind: 'PAYROLL_TAX',
        amount: result.monthlyTax,
        description: `ضريبة كسب العمل — استقطاع شهري (${year})`,
        organizationId,
        post: true,
      });
      setLastSteps(recorded.steps);
      onShowToast(
        recorded.posted ? 'success' : 'warning',
        recorded.posted
          ? `سُجّل القيد واعتُمد ورُحّل، ورُبط بنموذج (4) على حساب ${recorded.draft.credit?.code}.`
          : `سُجّل القيد لكن الاعتماد/الترحيل يحتاج خطوة: ${recorded.steps.slice(-1)[0]}`,
      );
      await loadRegister();
    } catch (err: any) {
      onShowToast('error', err.message || 'تعذر تسجيل القيد الضريبي.');
    } finally {
      setPosting(false);
    }
  };

  const activeBrackets = useMemo(
    () => (result?.brackets ?? []).filter((row) => row.amountInBracket > 0),
    [result],
  );

  return (
    <div className="space-y-4" data-assistant-screen="payroll-tax">
      <LegalNote>
        الوعاء السنوي = إجمالي الدخل − الإعفاء الشخصي − حصة العامل في التأمينات.
        الشرائح مطبَّقة على الصافي السنوي الأخير المعمول به (قانون 91 لسنة 2005
        وتعديله بالقانون 7 لسنة 2024: شريحة معفاة 40,000 ج + إعفاء شخصي 20,000
        ج).
      </LegalNote>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card title="مدخلات الاستقطاع" icon={Calculator} tone="sky">
          <div className="grid grid-cols-2 gap-3">
            <Field label="إجمالي الراتب الشهري (ج)">
              <NumberInput value={monthlyGross} onChange={setMonthlyGross} />
            </Field>
            <Field
              label="حصة العامل في التأمينات شهرياً (ج)"
              hint="تُخصم قبل حساب الوعاء"
            >
              <NumberInput
                value={monthlyInsurance}
                onChange={setMonthlyInsurance}
              />
            </Field>
            <Field
              label="إعفاءات أخرى سنوية (ج)"
              hint="مثال: إعفاء وتأمين حياة"
            >
              <NumberInput
                value={otherExemptions}
                onChange={setOtherExemptions}
              />
            </Field>
            <div className="flex items-end">
              <button
                type="button"
                data-action="calc-payroll-tax"
                onClick={calculate}
                disabled={busy}
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-teal-700 px-3 py-2 text-[11px] font-bold text-white hover:bg-teal-600 disabled:opacity-50"
              >
                {busy ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <TrendingUp className="w-3.5 h-3.5" />
                )}
                احسب ضريبة كسب العمل
              </button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <StatBox
              label="الإجمالي السنوي"
              value={`${fmt(result?.annualGross ?? monthlyGross * 12)} ج`}
            />
            <StatBox
              label="التأمينات السنوية"
              value={`${fmt(result?.insuranceDeduction ?? monthlyInsurance * 12)} ج`}
            />
            <StatBox
              label="الإعفاء الشخصي"
              value={`${fmt(result?.personalExemption ?? 20000)} ج`}
              tone="sky"
            />
            <StatBox
              label="الوعاء الخاضع"
              value={`${fmt(result?.taxableBase ?? 0)} ج`}
              tone="amber"
            />
            <StatBox
              label="الضريبة السنوية"
              value={`${fmt(result?.annualTax ?? 0)} ج`}
              tone="emerald"
            />
            <StatBox
              label="الاستقطاع الشهري"
              value={`${fmt(result?.monthlyTax ?? 0)} ج`}
              tone="emerald"
              hint="يُورَّد خلال أول 15 يوماً من الشهر التالي"
            />
            <StatBox
              label="الصافي بعد الضريبة (شهري)"
              value={`${fmt(result?.netMonthly ?? 0)} ج`}
            />
            <StatBox
              label="السعر الفعلي"
              value={`${result?.effectiveRate ?? 0}%`}
            />
          </div>
        </Card>

        <Card title="توزيع المبلغ على شرائح القانون" icon={FileSpreadsheet}>
          {result ? (
            <>
              <BracketTable
                rows={result.brackets}
                grossLabel="الخاضع في الشريحة"
              />
              <div className="flex flex-wrap items-center gap-2 text-[10px] text-slate-400">
                <BadgeCheck className="w-3.5 h-3.5 text-emerald-400" />
                الشرائح المستخدمة في الحساب:{' '}
                {activeBrackets.map((row) => row.labelAr).join(' • ') ||
                  'الشريحة المعفاة فقط'}
                <span className="font-mono text-slate-500">
                  إصدار المعاملات: {result.parametersVersion}
                </span>
              </div>
            </>
          ) : (
            <p className="text-[11px] text-slate-500">
              اضغط «احسب ضريبة كسب العمل» لإظهار جدول توزيع الشرائح بالجنيه.
            </p>
          )}
        </Card>

        <Card
          title="الربط بالنماذج — تسجيل الق  د وترحيله"
          icon={Receipt}
          tone="emerald"
        >
          <div className="space-y-2 text-[11px] text-slate-300">
            <div className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950 px-3 py-2">
              <span>الطرف المدين</span>
              <span className="text-slate-400">
                {draftPreview?.debit
                  ? `${draftPreview.debit.code} — ${draftPreview.debit.name}`
                  : 'يُحدَّد آلياً (مرتبات / أعباء العاملين)'}
              </span>
            </div>
            <div className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950 px-3 py-2">
              <span>الطرف الدائن</span>
              <span className="text-slate-400">
                {draftPreview?.credit
                  ? `${draftPreview.credit.code} — ${draftPreview.credit.name}`
                  : 'حساب ضريبة كسب العمل 2201'}
              </span>
            </div>
            <div className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950 px-3 py-2">
              <span>المبلغ</span>
              <span className="font-mono text-emerald-300">
                {fmt(result?.monthlyTax ?? 0)} ج
              </span>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-[10px] text-slate-400">
              النموذج المرتبط: نموذج (4) شهري + تسوية سنوية — التوريد خلال أول
              15 يوماً من الشهر التالي.
            </div>
            <button
              type="button"
              data-action="post-payroll-tax-entry"
              onClick={postEntry}
              disabled={!result || posting || (result?.monthlyTax ?? 0) <= 0}
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-emerald-700 px-3 py-2 text-[11px] font-bold text-white hover:bg-emerald-600 disabled:opacity-50"
            >
              {posting ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Receipt className="w-3.5 h-3.5" />
              )}
              تسجيل القيد واعتماده وترحيله
            </button>
            {lastSteps.length > 0 && (
              <Toast tone="success">
                خطوات التنفيذ: {lastSteps.join(' ← ')}
              </Toast>
            )}
          </div>
        </Card>
      </div>

      <Card
        title={`سجل ضريبة كسب العمل ${year} — حركات الحساب 2201`}
        icon={Users}
      >
        <div className="flex flex-wrap items-end gap-3">
          <StatBox
            label="إجمالي الدائن (المستحق للمصلحة)"
            value={`${fmt(register?.totalCredit ?? 0)} ج`}
            tone="emerald"
          />
          <StatBox
            label="إجمالي المدين (المُورَّد)"
            value={`${fmt(register?.totalDebit ?? 0)} ج`}
            tone="sky"
          />
          <button
            type="button"
            onClick={() => void loadRegister()}
            className="flex items-center gap-1 rounded-lg border border-slate-700 px-2 py-1.5 text-[10px] text-slate-300 hover:bg-slate-800"
          >
            <RefreshCw className="w-3 h-3" /> تحديث السجل
          </button>
        </div>
        <div className="overflow-auto rounded-xl border border-slate-800 max-h-72">
          <table className="w-full text-[11px]">
            <thead className="bg-slate-950 text-slate-400 sticky top-0">
              <tr>
                <th className="text-right py-2 px-2 font-medium">التاريخ</th>
                <th className="text-right py-2 px-2 font-medium">البيان</th>
                <th className="text-right py-2 px-2 font-medium">الحساب</th>
                <th className="text-right py-2 px-2 font-medium">مدين</th>
                <th className="text-right py-2 px-2 font-medium">دائن</th>
                <th className="text-right py-2 px-2 font-medium">النموذج</th>
              </tr>
            </thead>
            <tbody>
              {(register?.lines ?? [])
                .filter((line) => line.accountCode.startsWith('22'))
                .map((line, index) => (
                  <tr
                    key={`${line.entryId}-${index}`}
                    className="border-t border-slate-800/70"
                  >
                    <td className="py-1.5 px-2 font-mono text-slate-400">
                      {line.date}
                    </td>
                    <td className="py-1.5 px-2 text-slate-300">
                      {line.description}
                    </td>
                    <td className="py-1.5 px-2 text-slate-400 font-mono">
                      {line.accountCode}
                    </td>
                    <td className="py-1.5 px-2 font-mono text-sky-300">
                      {line.debit ? fmt(line.debit) : '—'}
                    </td>
                    <td className="py-1.5 px-2 font-mono text-emerald-300">
                      {line.credit ? fmt(line.credit) : '—'}
                    </td>
                    <td className="py-1.5 px-2 text-slate-500">
                      {line.formId ?? '—'}
                    </td>
                  </tr>
                ))}
              {(register?.lines ?? []).filter((line) =>
                line.accountCode.startsWith('22'),
              ).length === 0 && (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-slate-500">
                    لا حركات مرحّلة على حسابات الضريبة بعد — سجّل قيداً من الزر
                    أعلاه وسيظهر هنا فوراً.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
};

export default PayrollTaxView;
