import React, { useCallback, useEffect, useState } from 'react';
import {
  BookOpenCheck,
  CalendarClock,
  Coins,
  FileSpreadsheet,
  GitBranch,
  Loader2,
  Percent,
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
  fmtInt,
  LegalNote,
  NumberInput,
  StatBox,
  Toast,
  type TaxViewProps,
} from './shared.js';
import type { TaxOverview, TaxRegister } from '../../types/erp.tax.js';

const LAW_ARTICLES = [
  {
    refAr: 'المادة (1) و(8)',
    titleAr: 'سعر الضريبة وشرائح الأشخاص الطبيعيين',
    textAr:
      'شرائح تصاعدية على صافي الدخل السنوي: 0% حتى 40,000 — 10% حتى 55,000 — 15% حتى 70,000 — 20% حتى 200,000 — 22.5% حتى 400,000 — 25% حتى 1,200,000 — 27.5% لما يزيد.',
  },
  {
    refAr: 'المادة (13)',
    titleAr: 'الإعفاء الشخصي',
    textAr:
      'إعفاء شخصي سنوي 20,000 ج يُخصم من صافي الدخل قبل تطبيق الشرائح (إجمالي معفى 60,000 ج مع الشريحة الصفرية).',
  },
  {
    refAr: 'المادة (59)',
    titleAr: 'الخصم تحت حساب الضريبة',
    textAr:
      '1% مشتريات وتوريدات ومقاولات، 3% خدمات وإيجارات — على ما يزيد على 300 ج من قيمة الفاتورة.',
  },
  {
    refAr: 'المادة (70)',
    titleAr: 'المهن غير التجارية',
    textAr:
      '5% على كل مبلغ يزيد على 100 ج يُدفع لصاحب مهنة حرة (محاسب، مهندس، استشاري) أو عمولة وسمسرة.',
  },
  {
    refAr: 'الباب الرابع',
    titleAr: 'الأرباح التجارية والصناعية',
    textAr:
      'تُعدَّل نتيجة النشاط بالتعديلات الضريبية ثم تُطبَّق الشرائح على الطبيعيين، و22.5% على الأشخاص الاعتباريين.',
  },
];

/** التبويب (ج): قانون الضريبة على الدخل — النصوص والشرائح والأدوات الحسابية والنماذج. */
export const IncomeTaxLawView: React.FC<TaxViewProps> = ({
  organizationId,
  currentUser,
  onShowToast,
}) => {
  const [overview, setOverview] = useState<TaxOverview | null>(null);
  const [amount, setAmount] = useState(120000);
  const [kind, setKind] = useState('SERVICES');
  const [income, setIncome] = useState(600000);
  const [withholding, setWithholding] = useState<{
    tax: number;
    netPayable: number;
    titleAr: string;
    rate: number;
    legalRefAr: string;
    applicable: boolean;
  } | null>(null);
  const [incomeTax, setIncomeTax] = useState<{
    tax: number;
    taxableBase: number;
    effectiveRate: number;
    brackets: {
      labelAr: string;
      from: number;
      to: number | null;
      rate: number;
      amountInBracket: number;
      taxAmount: number;
    }[];
  } | null>(null);
  const [register, setRegister] = useState<TaxRegister | null>(null);
  const [busy, setBusy] = useState(false);
  const [steps, setSteps] = useState<string[]>([]);
  const [withholdingDraft, setWithholdingDraft] = useState<{
    debit: { code: string; name: string } | null;
    credit: { code: string; name: string } | null;
  } | null>(null);
  const year = new Date().getFullYear();

  const load = useCallback(async () => {
    try {
      setOverview(await api.getTaxOverview());
      setRegister(await api.getTaxRegister(year));
    } catch (err: any) {
      onShowToast('error', err.message || 'تعذر تحميل معاملات الضرائب.');
    }
  }, [year, onShowToast]);

  useEffect(() => {
    void load();
    (async () => {
      try {
        const draft = await api.getTaxEntryDraft('WITHHOLDING', 1000);
        setWithholdingDraft({
          debit: draft.debit
            ? { code: draft.debit.code, name: draft.debit.name }
            : null,
          credit: draft.credit
            ? { code: draft.credit.code, name: draft.credit.name }
            : null,
        });
      } catch {}
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const calcWithholding = async () => {
    setBusy(true);
    try {
      setWithholding(await api.calculateWithholding({ amount, kind }));
    } catch (err: any) {
      onShowToast('error', err.message || 'تعذر حساب الخصم والإضافة.');
    } finally {
      setBusy(false);
    }
  };

  const calcIncome = async () => {
    setBusy(true);
    try {
      const result = await api.calculateBusinessTax({
        netProfit: income,
        entityType: 'NATURAL',
      });
      setIncomeTax(result);
    } catch (err: any) {
      onShowToast('error', err.message || 'تعذر حساب ضريبة الدخل.');
    } finally {
      setBusy(false);
    }
  };

  const postWithholding = async () => {
    if (!withholding) return;
    setBusy(true);
    try {
      const recorded = await api.recordTaxEntry({
        kind: 'WITHHOLDING',
        amount: withholding.tax,
        description: `${withholding.titleAr} — خصم تحت حساب الضريبة (${withholding.rate}%) سنة ${year}`,
        organizationId,
        post: true,
      });
      setSteps(recorded.steps);
      onShowToast(
        recorded.posted ? 'success' : 'warning',
        recorded.posted
          ? 'رُحّل قيد الخصم والإضافة على الحساب 2202.'
          : recorded.steps.slice(-1)[0],
      );
      await load();
    } catch (err: any) {
      onShowToast('error', err.message || 'تعذر تسجيل القيد.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4" data-assistant-screen="income-tax-law">
      <LegalNote>
        مرجع الشاشة: قانون الضريبة على الدخل رقم 91 لسنة 2005 وتعديلاته (وأحدثها
        القانون 7 لسنة 2024)، ولائحته التنفيذية. النصوص أدناه ملخّصة بالعربية من
        مواد القانون، وأي رقم غير مؤكد يُعرض في بطاقة «بنود مفتوحة» ويمكن تعديله
        من إعدادات الضرائب.
      </LegalNote>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card
          title="مواد القانون المُعملة في البرنامج"
          icon={BookOpenCheck}
          tone="sky"
        >
          <div className="space-y-2 max-h-96 overflow-auto">
            {LAW_ARTICLES.map((article) => (
              <div
                key={article.refAr}
                className="rounded-xl border border-slate-800 bg-slate-950 px-3 py-2"
              >
                <p className="text-[11px] font-bold text-slate-100">
                  {article.refAr} — {article.titleAr}
                </p>
                <p className="text-[10px] leading-5 text-slate-400 mt-1">
                  {article.textAr}
                </p>
              </div>
            ))}
          </div>
        </Card>

        <Card title="جدول الشرائح المعمول به" icon={Percent}>
          {overview ? (
            <>
              <BracketTable
                rows={overview.payrollBrackets.map((row) => ({
                  ...row,
                  amountInBracket: 0,
                  taxAmount: 0,
                }))}
                grossLabel="الخاضع (يُحسب في التبويب الأول)"
              />
              <div className="grid grid-cols-2 gap-2">
                <StatBox
                  label="الشريحة المعفاة"
                  value={`${fmtInt(overview.payrollBrackets[0]?.to ?? 0)} ج`}
                  tone="sky"
                />
                <StatBox
                  label="الإعفاء الشخصي"
                  value={`${fmtInt(overview.personalExemption)} ج`}
                  tone="sky"
                />
                <StatBox
                  label="الإجمالي المعفى"
                  value={`${fmtInt(overview.totalExempt)} ج`}
                  tone="emerald"
                />
                <StatBox
                  label="القيمة المضافة"
                  value={`${overview.vatRate}%`}
                />
                <StatBox
                  label="ضريبة الشركات"
                  value={`${overview.corporateRate}%`}
                />
                <StatBox
                  label="إصدار المعاملات"
                  value={overview.parametersVersion}
                  hint="سجل تدقيق لكل تعديل"
                />
              </div>
              <div className="rounded-xl border border-amber-800/50 bg-slate-950 px-3 py-2 text-[10px] leading-5 text-amber-200/90">
                <span className="font-bold">
                  بند مفتوح ({overview.openItem.id}):
                </span>{' '}
                {overview.openItem.detailAr}
              </div>
            </>
          ) : (
            <p className="text-[11px] text-slate-500">
              جارٍ تحميل معاملات الضرائب…
            </p>
          )}
        </Card>

        <Card title="أدوات حساب سريعة" icon={Scale} tone="emerald">
          <div className="space-y-3">
            <div className="rounded-xl border border-slate-800 p-3 space-y-2">
              <p className="text-[11px] font-bold text-slate-200 flex items-center gap-1">
                <Coins className="w-3.5 h-3.5 text-emerald-300" /> ضريبة الدخل
                على مبلغ
              </p>
              <Field label="صافي الدخل السنوي (ج)">
                <NumberInput value={income} onChange={setIncome} />
              </Field>
              <button
                type="button"
                onClick={calcIncome}
                disabled={busy}
                className="w-full rounded-lg border border-emerald-700/50 px-3 py-1.5 text-[10px] font-bold text-emerald-300 hover:bg-slate-800 disabled:opacity-50"
              >
                {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : 'احسب'}
              </button>
              {incomeTax && (
                <div className="space-y-1 text-[10px] text-slate-400">
                  <p>
                    الوعاء بعد الإعفاء:{' '}
                    <span className="font-mono text-slate-200">
                      {fmt(incomeTax.taxableBase)} ج
                    </span>
                  </p>
                  <p>
                    الضريبة:{' '}
                    <span className="font-mono text-emerald-300">
                      {fmt(incomeTax.tax)} ج
                    </span>{' '}
                    — المتوسط {incomeTax.effectiveRate}%
                  </p>
                </div>
              )}
            </div>

            <div className="rounded-xl border border-slate-800 p-3 space-y-2">
              <p className="text-[11px] font-bold text-slate-200 flex items-center gap-1">
                <GitBranch className="w-3.5 h-3.5 text-sky-300" /> الخصم
                والإضافة (المادة 59/70)
              </p>
              <div className="grid grid-cols-2 gap-2">
                <Field label="نوع المعاملة">
                  <select
                    value={kind}
                    onChange={(event) => setKind(event.target.value)}
                    className="w-full rounded-lg border border-slate-800 bg-slate-950 px-2 py-2 text-[11px] text-slate-200"
                  >
                    {(overview?.withholding ?? []).map((row) => (
                      <option key={row.id} value={row.id}>
                        {row.titleAr} ({row.rate}%)
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="قيمة الفاتورة (ج)">
                  <NumberInput value={amount} onChange={setAmount} />
                </Field>
              </div>
              <button
                type="button"
                onClick={calcWithholding}
                disabled={busy}
                className="w-full rounded-lg border border-sky-700/50 px-3 py-1.5 text-[10px] font-bold text-sky-300 hover:bg-slate-800 disabled:opacity-50"
              >
                {busy ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  'احسب الخصم'
                )}
              </button>
              {withholding && (
                <div className="space-y-1 text-[10px] text-slate-400">
                  <p>
                    {withholding.titleAr} — النسبة {withholding.rate}% — سندها{' '}
                    {withholding.legalRefAr}
                  </p>
                  <p>
                    الخصم:{' '}
                    <span className="font-mono text-emerald-300">
                      {fmt(withholding.tax)} ج
                    </span>{' '}
                    • الصافي للمورد:{' '}
                    <span className="font-mono text-slate-200">
                      {fmt(withholding.netPayable)} ج
                    </span>
                  </p>
                  {!withholding.applicable && (
                    <p className="text-amber-300/90">
                      قيمة الفاتورة أقل من الحد الأدنى المقرر — لا خصم.
                    </p>
                  )}
                  <button
                    type="button"
                    data-action="post-withholding-entry"
                    onClick={postWithholding}
                    disabled={busy || withholding.tax <= 0}
                    className="mt-1 w-full rounded-lg bg-emerald-700 px-3 py-1.5 text-[10px] font-bold text-white hover:bg-emerald-600 disabled:opacity-50"
                  >
                    تسجيل القيد واعتماده وترحيله
                  </button>
                  {withholdingDraft && (
                    <p className="text-[9px] text-slate-500">
                      القيد:{' '}
                      {withholdingDraft.debit
                        ? `${withholdingDraft.debit.code} ${withholdingDraft.debit.name}`
                        : '—'}{' '}
                      (مدين) ←{' '}
                      {withholdingDraft.credit
                        ? `${withholdingDraft.credit.code} ${withholdingDraft.credit.name}`
                        : '—'}{' '}
                      (دائن)
                    </p>
                  )}
                </div>
              )}
            </div>
            {steps.length > 0 && (
              <Toast tone="success">خطوات التنفيذ: {steps.join(' ← ')}</Toast>
            )}
          </div>
        </Card>
      </div>

      <Card
        title={`النماذج والمواعيد والربط بالحسابات — حركات ${year}`}
        icon={CalendarClock}
      >
        <div className="overflow-auto rounded-xl border border-slate-800">
          <table className="w-full text-[11px]">
            <thead className="bg-slate-950 text-slate-400">
              <tr>
                <th className="text-right py-2 px-2 font-medium">النموذج</th>
                <th className="text-right py-2 px-2 font-medium">الموعد</th>
                <th className="text-right py-2 px-2 font-medium">
                  الشاشة المرتبطة
                </th>
                <th className="text-right py-2 px-2 font-medium">الحسابات</th>
                <th className="text-right py-2 px-2 font-medium">
                  حركات مُرحّلة
                </th>
              </tr>
            </thead>
            <tbody>
              {(overview?.forms ?? []).map((form) => {
                const accounts =
                  register?.byAccount.filter((row) =>
                    form.accountCodes.includes(row.accountCode),
                  ) ?? [];
                const movements = accounts.reduce(
                  (sum, row) => sum + row.movements,
                  0,
                );
                return (
                  <tr key={form.id} className="border-t border-slate-800/70">
                    <td className="py-1.5 px-2 text-slate-200">
                      {form.titleAr}
                    </td>
                    <td className="py-1.5 px-2 text-slate-400">{form.dueAr}</td>
                    <td className="py-1.5 px-2 text-slate-400">
                      {form.relatedScreenAr}
                    </td>
                    <td className="py-1.5 px-2 font-mono text-slate-400">
                      {form.accountCodes.join(' • ') || '—'}
                    </td>
                    <td className="py-1.5 px-2 font-mono text-emerald-300">
                      {movements}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatBox
            label="الإقرارات المرتبطة بالنماذج"
            value={`${overview?.forms.length ?? 0}`}
          />
          <StatBox
            label="حركات مُرحّلة هذا العام"
            value={`${register?.lines.length ?? 0}`}
            tone="sky"
          />
          <StatBox
            label="رصيد حسابات الضرائب (دائن)"
            value={`${fmt(register?.totalCredit ?? 0)} ج`}
            tone="emerald"
          />
          <button
            type="button"
            onClick={() => void load()}
            className="flex items-center gap-1 rounded-lg border border-slate-700 px-2 py-1.5 text-[10px] text-slate-300 hover:bg-slate-800"
          >
            <RefreshCw className="w-3 h-3" /> تحديث
          </button>
        </div>
      </Card>
    </div>
  );
};

export default IncomeTaxLawView;
