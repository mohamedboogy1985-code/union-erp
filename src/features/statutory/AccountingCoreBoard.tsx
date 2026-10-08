import React, { useEffect, useMemo, useState } from "react";
import {
  BookOpenCheck,
  RefreshCw,
  Search,
  Link2,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  Users,
  PlusCircle,
  UserPlus,
} from "lucide-react";
import {
  statutoryApi,
  ChartBundle,
  ChartAccountView,
  TrialBalanceView,
  GroundingReport,
  SubledgerPartyView,
} from "../../services/statutory-api.js";
import { normalizeArabic } from "../../utils/statutory-arabic.js";
import { User } from "../../types/erp.js";

interface AccountingCoreBoardProps {
  organizationId: string;
  currentUser: User | null;
  onShowToast: (
    type: "success" | "error" | "warning" | "info",
    msg: string,
  ) => void;
}

const TYPE_LABEL: Record<string, string> = {
  ASSET: "أصول",
  LIABILITY: "التزامات",
  EQUITY: "حقوق ملكية",
  REVENUE: "إيرادات",
  EXPENSE: "مصروفات",
};

const SUBLEDGER_LABEL: Record<string, string> = {
  NONE: "—",
  BANK: "بنوك",
  INVESTMENT: "استثمارات",
  MISC_DEBTOR: "مدينون متنوعون",
  VENDOR: "موردون",
  CUSTODY: "عهد",
  EMPLOYEE: "عاملون",
};

const egp = (value: number) =>
  `${(value ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م`;

export const AccountingCoreBoard: React.FC<AccountingCoreBoardProps> = ({
  organizationId,
  onShowToast,
}) => {
  const [chart, setChart] = useState<ChartBundle | null>(null);
  const [accounts, setAccounts] = useState<ChartAccountView[]>([]);
  const [trial, setTrial] = useState<TrialBalanceView | null>(null);
  const [grounding, setGrounding] = useState<GroundingReport | null>(null);
  const [parties, setParties] = useState<SubledgerPartyView[]>([]);
  const [chain, setChain] = useState<{
    valid: boolean;
    entries: number;
    messageAr: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [term, setTerm] = useState("");
  const [sectionFilter, setSectionFilter] = useState("");
  const [partyAccount, setPartyAccount] = useState("1101");
  const [partyName, setPartyName] = useState("");
  const [view, setView] = useState<"chart" | "trial">("chart");

  const load = async () => {
    setLoading(true);
    try {
      const [
        chartBundle,
        accountsResponse,
        trialBalance,
        groundingReport,
        partiesResponse,
        chainHealth,
      ] = await Promise.all([
        statutoryApi.getChart(),
        statutoryApi.findAccounts(""),
        statutoryApi.getTrialBalance(),
        statutoryApi.getChartGrounding(),
        statutoryApi.listSubledgerParties("1101"),
        statutoryApi.getChainHealth(),
      ]);
      setChart(chartBundle);
      setAccounts(accountsResponse.accounts ?? []);
      setTrial(trialBalance);
      setGrounding(groundingReport);
      setParties(partiesResponse.parties ?? []);
      setChain(chainHealth);
    } catch (err) {
      onShowToast(
        "error",
        `تعذّر تحميل النواة المحاسبية: ${(err as Error).message}`,
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [organizationId]);

  const sections = useMemo(() => chart?.sections ?? [], [chart]);

  const filteredAccounts = useMemo(() => {
    const needle = normalizeArabic(term.trim());
    return accounts.filter((account) => {
      if (sectionFilter && account.sectionCode !== sectionFilter) return false;
      if (!needle) return true;
      return normalizeArabic(
        `${account.code} ${account.name} ${account.oldCode ?? ""} ${account.sectionName}`,
      ).includes(needle);
    });
  }, [accounts, term, sectionFilter]);

  const addParty = async () => {
    if (!partyName.trim()) {
      onShowToast("warning", "اكتب اسم الطرف أولاً.");
      return;
    }
    try {
      const result = await statutoryApi.createSubledgerParty(
        partyAccount,
        partyName.trim(),
      );
      setParties((prev) => {
        const exists = prev.some((party) => party.id === result.party.id);
        return exists ? prev : [...prev, result.party];
      });
      setPartyName("");
      onShowToast(
        "success",
        result.isNew
          ? `أُضيف الطرف على الحساب ${partyAccount}.`
          : "الطرف موجود مسبقاً بنفس التطبيع.",
      );
      if (result.similarPartyWarningAr)
        onShowToast("warning", result.similarPartyWarningAr);
    } catch (err) {
      onShowToast("error", (err as Error).message);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12 text-slate-400 gap-2">
        <RefreshCw className="w-4 h-4 animate-spin" />
        <span>جارٍ تحميل النواة المحاسبية ودليل الحسابات الموحّد...</span>
      </div>
    );
  }

  const stats = chart?.stats;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <div className="rounded-xl border border-sky-500/30 bg-sky-500/5 p-3">
          <div className="text-[11px] text-slate-400">حسابات الدليل</div>
          <div className="text-xl font-bold font-mono text-sky-300">
            {stats?.accounts ?? 0}
          </div>
          <div className="text-[10px] text-slate-500 mt-1">
            من {stats?.sourceRows ?? 0} سطراً
          </div>
        </div>
        <div className="rounded-xl border border-slate-700 bg-slate-900/60 p-3">
          <div className="text-[11px] text-slate-400">الأقسام</div>
          <div className="text-xl font-bold font-mono text-slate-200">
            {stats?.sections ?? 0}
          </div>
          <div className="text-[10px] text-slate-500 mt-1">
            {stats?.accountsWithNotes ?? 0} حساباً بملاحظات
          </div>
        </div>
        <div className="rounded-xl border border-violet-500/30 bg-violet-500/5 p-3">
          <div className="text-[11px] text-slate-400">حسابات مساعدة</div>
          <div className="text-xl font-bold font-mono text-violet-300">
            {stats?.subledgerAccounts ?? 0}
          </div>
          <div className="text-[10px] text-slate-500 mt-1">
            و{stats?.contraAccounts ?? 0} حساباً مقابل
          </div>
        </div>
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3">
          <div className="text-[11px] text-slate-400">ميزان المراجعة</div>
          <div
            className={`text-xl font-bold font-mono ${trial?.balanced ? "text-emerald-300" : "text-rose-300"}`}
          >
            {trial?.balanced ? "متوازن" : "غير متوازن"}
          </div>
          <div className="text-[10px] text-slate-500 mt-1">
            {trial?.entriesPosted ?? 0} قيداً مرحّلاً
          </div>
        </div>
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3">
          <div className="text-[11px] text-slate-400">
            الأطراف التحليلية 1101
          </div>
          <div className="text-xl font-bold font-mono text-amber-300">
            {parties.length}
          </div>
          <div className="text-[10px] text-slate-500 mt-1">
            تطبيع ع  بي يمنع التكرار
          </div>
        </div>
        <div
          className={`rounded-xl border p-3 ${chain?.valid ? "border-emerald-500/30 bg-emerald-500/5" : "border-rose-500/30 bg-rose-500/5"}`}
        >
          <div className="text-[11px] text-slate-400">سلسلة SHA-256</div>
          <div
            className={`text-xl font-bold font-mono ${chain?.valid ? "text-emerald-300" : "text-rose-300"}`}
          >
            {chain?.valid ? "سليمة" : "مكسورة"}
          </div>
          <div className="text-[10px] text-slate-500 mt-1">
            {chain?.entries ?? 0} قيداً مسلسلاً
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
        <div className="flex flex-wrap items-center gap-3 mb-3">
          <div className="flex items-center gap-2">
            <BookOpenCheck className="w-4 h-4 text-sky-400" />
            <h3 className="text-sm font-bold text-slate-200">
              {chart?.document?.title ?? "دليل الحسابات الموحّد"}
            </h3>
            <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-sky-300 font-mono">
              {chart?.document?.version}
            </span>
          </div>
          <span className="text-[10px] text-slate-500">
            {chart?.document?.subtitle}
          </span>
          <div className="flex items-center gap-1.5 ms-auto">
            <button
              onClick={() => setView("chart")}
              className={`px-3 py-1.5 rounded-lg text-[11px] font-bold ${view === "chart" ? "bg-sky-600 text-white" : "bg-slate-900 text-slate-400 border border-slate-800"}`}
            >
              الدليل
            </button>
            <button
              onClick={() => setView("trial")}
              className={`px-3 py-1.5 rounded-lg text-[11px] font-bold ${view === "trial" ? "bg-sky-600 text-white" : "bg-slate-900 text-slate-400 border border-slate-800"}`}
            >
              ميزان المراجعة
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-[11px] text-slate-400 mb-3">
          <div>
            <span className="text-slate-500">المصدر:</span>{" "}
            <span className="font-mono text-[10px]">
              {chart?.document?.sourceFile}
            </span>
          </div>
          <div>
            <span className="text-slate-500">بصمة الملف:</span>{" "}
            <span className="font-mono text-[10px]">
              {chart?.document?.sourceFileSha256?.slice(0, 20)}…
            </span>
          </div>
          <div>
            <span className="text-slate-500">بوابة السند:</span>{" "}
            {grounding?.ok ? (
              <span className="text-emerald-300">سليمة</span>
            ) : (
              <span className="text-amber-300">تحتاج مراجعة</span>
            )}
          </div>
          <div>
            <span className="text-slate-500">بنود مفتوحة:</span>{" "}
            {(grounding?.openItems ?? []).join(" • ") || "لا يوجد"}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 mb-3">
          <div className="rounded-lg border border-emerald-500/25 bg-emerald-500/5 p-3">
            <div className="text-[11px] font-bold text-emerald-200 mb-1">
              الدليل النشط: {chart?.mapping?.activeGuide?.titleAr ?? "—"}
            </div>
            <div className="text-[10px] text-slate-400 leading-5">
              {chart?.mapping?.activeGuide?.descriptionAr}
              <div className="mt-1 font-mono text-[10px] text-emerald-300">
                النقد المعلن:{" "}
                {(chart?.mapping?.treasuryCodes ?? []).join(" • ") || "—"} —
                قواعد م9/م6 تُقاس آلياً
              </div>
              <div className="mt-0.5 font-mono text-[10px] text-sky-300">
                الحساب المساعد الإلزامي (المدينون):{" "}
                {(chart?.mapping?.debtorCodes ?? []).join(" • ") || "—"}
              </div>
            </div>
          </div>

          <div className="lg:col-span-2 rounded-lg border border-slate-800 bg-slate-900/40 p-3">
            <div className="text-[11px] font-bold text-slate-200 mb-2">
              المعيّن المعتمد بين الدليلين
              <span className="ms-2 text-[10px] font-normal text-slate-400">
                معتمد {chart?.mapping?.counts?.confirmed ?? 0} • مرشّح{" "}
                {chart?.mapping?.counts?.candidates ?? 0} • بلا مقابل{" "}
                {chart?.mapping?.counts?.unmapped ?? 0}
              </span>
            </div>
            <div className="overflow-auto max-h-44 rounded border border-slate-800">
              <table className="w-full text-[10px]">
                <thead className="bg-slate-950 text-slate-400 sticky top-0">
                  <tr>
                    <th className="text-right py-1.5 px-2 font-medium">
                      دليل البرنامج (نشط)
                    </th>
                    <th className="text-right py-1.5 px-2 font-medium">
                      الدليل الموحد
                    </th>
                    <th className="text-right py-1.5 px-2 font-medium">
                      الحالة
                    </th>
                    <th className="text-right py-1.5 px-2 font-medium">
                      السند
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {(chart?.mapping?.rows ?? []).map((row) => (
                    <tr
                      key={`${row.activeCode}-${row.unifiedCode ?? "none"}`}
                      className="border-t border-slate-800/70"
                    >
                      <td className="py-1.5 px-2 text-slate-200">
                        <span className="font-mono text-sky-300">
                          {row.activeCode}
                        </span>{" "}
                        {row.activeName}
                      </td>
                      <td className="py-1.5 px-2 text-slate-300">
                        {row.unifiedCode ? (
                          <>
                            <span className="font-mono text-emerald-300">
                              {row.unifiedCode}
                            </span>{" "}
                            {row.unifiedName}
                          </>
                        ) : (
                          <span className="text-slate-500">—</span>
                        )}
                      </td>
                      <td className="py-1.5 px-2">
                        {row.status === "CONFIRMED" ? (
                          <span className="text-emerald-300">معتمد</span>
                        ) : row.status === "CANDIDATE" ? (
                          <span className="text-amber-300">مرشّح</span>
                        ) : (
                          <span className="text-rose-300">بلا مقابل</span>
                        )}
                      </td>
                      <td className="py-1.5 px-2 text-slate-400 leading-5">
                        {row.rationaleAr}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {(chart?.mapping?.decisions?.length ?? 0) > 0 && (
          <div className="rounded-lg border border-emerald-500/25 bg-slate-900/40 p-3 mb-3">
            <div className="flex items-center gap-2 text-[11px] font-bold text-emerald-200 mb-1">
              <CheckCircle2 className="w-3.5 h-3.5" /> قرارات محسومة في دليل
              الحسابات ({(chart?.mapping?.decisions ?? []).length})
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {(chart?.mapping?.decisions ?? []).map((decision) => (
                <div
                  key={decision.id}
                  className="text-[10px] text-slate-300 leading-5"
                >
                  <span className="font-mono text-emerald-300">
                    {decision.id}
                  </span>{" "}
                  — {decision.titleAr}
                  <div className="text-slate-400">{decision.decisionAr}</div>
                  <div className="text-emerald-300/80">{decision.effectAr}</div>
                  <div className="text-slate-500 font-mono">
                    {decision.decidedAt}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {view === "chart" && (
          <>
            <div className="flex flex-wrap items-center gap-3 mb-3">
              <div className="flex items-center gap-2">
                <Search className="w-4 h-4 text-slate-400" />
                <input
                  value={term}
                  onChange={(event) => setTerm(event.target.value)}
                  placeholder="ابحث بالكود أو الاسم أو الكود القديم"
                  className="w-80 bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 placeholder:text-slate-600"
                />
              </div>
              <select
                value={sectionFilter}
                onChange={(event) => setSectionFilter(event.target.value)}
                className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200"
              >
                <option value="">كل الأقسام</option>
                {sections.map((section) => (
                  <option key={section.code} value={section.code}>
                    {section.code} — {section.name} ({section.accounts})
                  </option>
                ))}
              </select>
              <span className="text-[11px] text-slate-500">
                {filteredAccounts.length} حساباً معروضاً من {accounts.length}
              </span>
            </div>

            <div className="overflow-auto max-h-[26rem] rounded-lg border border-slate-800">
              <table className="w-full text-[11px]">
                <thead className="bg-slate-950 text-slate-400 sticky top-0">
                  <tr>
                    <th className="text-right py-2 px-2 font-medium">الكود</th>
                    <th className="text-right py-2 px-2 font-medium">الاسم</th>
                    <th className="text-right py-2 px-2 font-medium">
                      الكود القديم
                    </th>
                    <th className="text-right py-2 px-2 font-medium">القسم</th>
                    <th className="text-right py-2 px-2 font-medium">النوع</th>
                    <th className="text-right py-2 px-2 font-medium">
                      الطبيعة
                    </th>
                    <th className="text-right py-2 px-2 font-medium">
                      حساب مساعد
                    </th>
                    <th className="text-right py-2 px-2 font-medium">مقابل</th>
                    <th className="text-right py-2 px-2 font-medium">
                      ملاحظات
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAccounts.map((account) => (
                    <tr
                      key={`${account.code}-${account.sourceRow}`}
                      className="border-b border-slate-800/60 hover:bg-slate-800/30"
                    >
                      <td className="py-2 px-2 font-mono text-sky-300">
                        {account.code}
                      </td>
                      <td className="py-2 px-2 text-slate-200">
                        {account.name}
                      </td>
                      <td className="py-2 px-2 font-mono text-slate-500">
                        {account.oldCode ?? "—"}
                      </td>
                      <td className="py-2 px-2 text-slate-400">
                        {account.sectionName}
                      </td>
                      <td className="py-2 px-2 text-slate-400">
                        {TYPE_LABEL[account.type] ?? account.type}
                      </td>
                      <td className="py-2 px-2 text-slate-400">
                        {account.nature === "DEBIT" ? "مدين" : "دائن"}
                      </td>
                      <td className="py-2 px-2 text-slate-400">
                        {SUBLEDGER_LABEL[account.subledgerType] ?? "—"}
                      </td>
                      <td className="py-2 px-2">
                        {account.isContra && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/30">
                            مقابل
                          </span>
                        )}
                      </td>
                      <td className="py-2 px-2 text-slate-500">
                        {account.notesAr ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {(chart?.anomalies?.length ?? 0) > 0 && (
              <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
                <div className="flex items-center gap-2 text-[11px] text-amber-200 font-bold mb-1">
                  <AlertTriangle className="w-3.5 h-3.5" /> شذوذ معلن في الدليل
                  (محسوم)
                </div>
                {(chart?.anomalies ?? []).map((anomaly) => (
                  <div
                    key={anomaly.id}
                    className="text-[10px] text-slate-300 leading-5"
                  >
                    <span className="font-mono text-amber-300">
                      {anomaly.id}
                    </span>{" "}
                    — {anomaly.detailAr} —{" "}
                    <span className="text-slate-400">
                      {anomaly.resolutionAr}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {view === "chart" && (chart?.openItems?.length ?? 0) > 0 && (
          <div className="mt-3 rounded-lg border border-amber-500/25 bg-slate-900/40 p-3">
            <div className="text-[11px] font-bold text-amber-200 mb-2">
              بنود دليل الحسابات وحالتها
            </div>
            <div className="overflow-auto max-h-40 rounded border border-slate-800">
              <table className="w-full text-[10px]">
                <thead className="bg-slate-950 text-slate-400 sticky top-0">
                  <tr>
                    <th className="text-right py-1.5 px-2 font-medium">
                      البند
                    </th>
                    <th className="text-right py-1.5 px-2 font-medium">
                      الحالة
                    </th>
                    <th className="text-right py-1.5 px-2 font-medium">
                      المطلوب / ما تم
                    </th>
                    <th className="text-right py-1.5 px-2 font-medium">
                      الأثر
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {(chart?.openItems ?? []).map((item) => (
                    <tr
                      key={item.id}
                      className="border-t border-slate-800/70 align-top"
                    >
                      <td className="py-1.5 px-2 text-slate-200">
                        <span className="font-mono text-amber-300">
                          {item.id}
                        </span>
                        <div>{item.titleAr}</div>
                      </td>
                      <td className="py-1.5 px-2">
                        {item.status === "RESOLVED" ? (
                          <span className="text-emerald-300">محسوم</span>
                        ) : (
                          <span className="text-amber-300">قائم</span>
                        )}
                      </td>
                      <td className="py-1.5 px-2 text-slate-300 leading-5">
                        {item.requiredFieldsAr}
                      </td>
                      <td className="py-1.5 px-2 text-slate-400 leading-5">
                        {item.impactAr}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {view === "trial" && (
          <div className="overflow-auto max-h-[26rem] rounded-lg border border-slate-800">
            <table className="w-full text-[11px]">
              <thead className="bg-slate-950 text-slate-400 sticky top-0">
                <tr>
                  <th className="text-right py-2 px-2 font-medium">الكود</th>
                  <th className="text-right py-2 px-2 font-medium">الحساب</th>
                  <th className="text-right py-2 px-2 font-medium">النوع</th>
                  <th className="text-right py-2 px-2 font-medium">مدين</th>
                  <th className="text-right py-2 px-2 font-medium">دائن</th>
                  <th className="text-right py-2 px-2 font-medium">الرصيد</th>
                  <th className="text-right py-2 px-2 font-medium">الحركات</th>
                </tr>
              </thead>
              <tbody>
                {(trial?.rows ?? []).map((row, index) => (
                  <tr
                    key={`${row.accountCode}-${index}`}
                    className="border-b border-slate-800/60 hover:bg-slate-800/30"
                  >
                    <td className="py-2 px-2 font-mono text-sky-300">
                      {row.accountCode}
                    </td>
                    <td className="py-2 px-2 text-slate-200">
                      {row.accountName}
                    </td>
                    <td className="py-2 px-2 text-slate-400">
                      {TYPE_LABEL[row.type] ?? row.type}
                    </td>
                    <td className="py-2 px-2 font-mono text-slate-300">
                      {row.debitMajor ? egp(row.debitMajor) : "—"}
                    </td>
                    <td className="py-2 px-2 font-mono text-slate-300">
                      {row.creditMajor ? egp(row.creditMajor) : "—"}
                    </td>
                    <td className="py-2 px-2 font-mono text-emerald-300">
                      {egp(row.balanceMajor)}
                    </td>
                    <td className="py-2 px-2 font-mono text-slate-500">
                      {row.movementCount}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-slate-950 text-slate-200 sticky bottom-0">
                <tr>
                  <td className="py-2 px-2 font-bold" colSpan={3}>
                    الإجمالي — {trial?.balancedAr}
                  </td>
                  <td className="py-2 px-2 font-mono">
                    {egp(trial?.totals?.debitMajor ?? 0)}
                  </td>
                  <td className="py-2 px-2 font-mono">
                    {egp(trial?.totals?.creditMajor ?? 0)}
                  </td>
                  <td className="py-2 px-2 font-mono" colSpan={2}>
                    {trial?.totals?.accountsWithMovement ?? 0} حساباً متحركاً •{" "}
                    {trial?.totals?.accountsWithoutMovement ?? 0} بلا حركة
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <div className="flex items-center gap-2 mb-3">
            <Users className="w-4 h-4 text-amber-400" />
            <h3 className="text-sm font-bold text-slate-200">
              الأطراف التحليلية على الحساب 1101
            </h3>
            <span className="text-[10px] text-slate-500">
              ({parties.length})
            </span>
          </div>
          <div className="flex items-end gap-2 mb-3">
            <div>
              <label className="block text-[10px] text-slate-500 mb-1">
                حساب الطرف
              </label>
              <input
                value={partyAccount}
                onChange={(event) => setPartyAccount(event.target.value)}
                className="w-28 bg-slate-950 border border-slate-700 rounded-lg px-2 py-1.5 text-xs font-mono text-slate-200"
              />
            </div>
            <div className="flex-1">
              <label className="block text-[10px] text-slate-500 mb-1">
                اسم الطرف (يُطبَّع عربياً تلقائياً)
              </label>
              <input
                value={partyName}
                onChange={(event) => setPartyName(event.target.value)}
                placeholder="مثال: شركة النصر للمقاولات"
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-slate-200 placeholder:text-slate-600"
              />
            </div>
            <button
              onClick={addParty}
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-[11px] font-bold"
            >
              <UserPlus className="w-3.5 h-3.5" /> إضافة
            </button>
          </div>
          <div className="max-h-64 overflow-y-auto rounded-lg border border-slate-800">
            <table className="w-full text-[11px]">
              <thead className="bg-slate-950 text-slate-400 sticky top-0">
                <tr>
                  <th className="text-right py-2 px-2 font-medium">الاسم</th>
                  <th className="text-right py-2 px-2 font-medium">
                    الاسم المطبَّع
                  </th>
                  <th className="text-right py-2 px-2 font-medium">الحساب</th>
                </tr>
              </thead>
              <tbody>
                {parties.map((party) => (
                  <tr key={party.id} className="border-b border-slate-800/60">
                    <td className="py-2 px-2 text-slate-200">{party.name}</td>
                    <td className="py-2 px-2 text-slate-400">
                      {party.normalizedName}
                    </td>
                    <td className="py-2 px-2 font-mono text-sky-300">
                      {party.accountCode}
                    </td>
                  </tr>
                ))}
                {parties.length === 0 && (
                  <tr>
                    <td
                      colSpan={3}
                      className="py-4 px-2 text-center text-slate-500 text-[11px]"
                    >
                      لا أطراف تحليلية بعد على هذا الحساب — أضف أول طرف من
                      النموذج أعلاه.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <div className="flex items-center gap-2 mb-3">
            <Link2 className="w-4 h-4 text-emerald-400" />
            <h3 className="text-sm font-bold text-slate-200">
              حالة السجل وسلسلة التحقق
            </h3>
          </div>
          <div className="text-[11px] text-slate-400 space-y-2">
            <div className="flex items-center gap-2">
              <ShieldCheck
                className={`w-4 h-4 ${chain?.valid ? "text-emerald-400" : "text-rose-400"}`}
              />
              <span>{chain?.messageAr ?? "لم تُقرأ حالة السلسلة"}</span>
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3 leading-6">
              كل قيد مُرحَّل يحمل `previousHash` و`currentHash` (SHA-256) — أي
              تعديل لاحق على قيد قديم يكسر السلسلة ويظهر هنا فوراً.
            </div>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={load}
                className="flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 text-[11px] font-bold hover:border-slate-600"
              >
                <RefreshCw className="w-3.5 h-3.5" /> تحديث الحالة
              </button>
              <div className="flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-400 text-[11px]">
                <ShieldCheck className="w-3.5 h-3.5 text-sky-400" /> قراءة فقط —
                لا تعديل على بياناتك
              </div>
            </div>
          </div>
          {(grounding?.unsupportedRuleIds?.length ?? 0) > 0 && (
            <div className="mt-3 rounded-lg border border-rose-500/30 bg-rose-500/5 p-2 text-[10px] text-rose-200">
              قواعد بلا سند: {grounding?.unsupportedRuleIds?.join(" • ")}
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3 text-[10px] text-slate-500">
        <PlusCircle className="w-3.5 h-3.5" />
        الحسابات مستخرجة حرفياً من ملف الدليل الموحّد في مستودعك — بلا اختراع
        حساب واحد.
      </div>
    </div>
  );
};

export default AccountingCoreBoard;
