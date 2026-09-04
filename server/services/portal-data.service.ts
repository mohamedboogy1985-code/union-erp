import fs from 'fs';
import path from 'path';
import { parseCsvToObjects } from '../utils/csv.js';
import { CSV_DATA_DIR } from './csv-import.service.js';

const BOM = /^\uFEFF/;

function readObjects(file: string): Record<string, string>[] {
  try {
    const text = fs.readFileSync(path.join(CSV_DATA_DIR, file), 'utf-8').replace(BOM, '');
    return parseCsvToObjects(text);
  } catch {
    return [];
  }
}

function readJsonFile(file: string): any | null {
  try {
    const text = fs.readFileSync(path.join(CSV_DATA_DIR, file), 'utf-8').replace(BOM, '');
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export interface PortalDataView {
  company: { number: string; name: string }[];
  professional: { number: string; name: string }[];
  offices: { number: string; name: string }[];
}

export interface InsuredMember {
  number: string;
  name: string;
  occupation: string;
  dateOfBirth: string;
  maturityDate: string;
  age: string;
  monthlyPremium: string;
  maturityAmount: string;
}

export interface JournalRow2024 {
  date: string;
  serial: string;
  permitNo: string;
  checkNo: string;
  description: string;
  debitAccount: string;
  creditAccount: string;
  amount: string;
  carried: string;
}

/** بيانات اللجان والمكاتب (من ملف بيانات.xlsx) */
export function getCommitteesData(): PortalDataView {
  const company = readObjects('لجان_الشركات.csv').map((r) => ({
    number: r['م'] || '',
    name: r['اسم اللجنة'] || '',
  }));
  const professional = readObjects('لجان_مهنية.csv').map((r) => ({
    number: r['م'] || '',
    name: r['اسم اللجنة'] || '',
  }));
  const offices = readObjects('مكاتب_العضوية.csv').map((r) => ({
    number: r['م'] || '',
    name: r['اسم المكتب'] || '',
  }));
  return { company, professional, offices };
}

/** المؤمَّن عليهم (من ملف Insured List.xlsx) */
export function getInsuredList(search?: string): InsuredMember[] {
  const rows = readObjects('insured-list.csv');
  const all = rows.map((r) => ({
    number: r['الرقم'] || '',
    name: r['الاسم'] || '',
    occupation: r['المهنة'] || '',
    dateOfBirth: r['تاريخ الميلاد'] || '',
    maturityDate: r['تاريخ الاستحقاق'] || '',
    age: r['العمر'] || '',
    monthlyPremium: r['القسط الشهري المتفق عليه'] || '',
    maturityAmount: r['مبلغ التأمين عند الاستحقاق'] || '',
  }));
  if (search && search.trim()) {
    const q = search.trim();
    return all.filter(
      (m) => m.name.includes(q) || m.occupation.includes(q) || m.number.includes(q)
    );
  }
  return all;
}

/** قيود يومية 2024 (من ملف قيود اليومية_2024.xlsx) */
let cachedJournal2024Rows: (JournalRow2024 & { id: string })[] | null = null;

function initJournal2024Rows(): (JournalRow2024 & { id: string })[] {
  if (!cachedJournal2024Rows) {
    const raw = readObjects('قيود_اليومية_2024_c.csv');
    cachedJournal2024Rows = raw.map((r, idx) => ({
      id: `j2024-${idx + 1}`,
      date: r['التاريخ'] || '',
      serial: r['المسلسل'] || String(idx + 1),
      permitNo: r['رقم الإذن'] || '',
      checkNo: r['رقم الشيك'] || '',
      description: r['البيان'] || '',
      debitAccount: r['حساب مدين'] || '',
      creditAccount: r['حساب دائن'] || '',
      amount: r['المبلغ'] || '0',
      carried: r['مرحّل'] || 'نعم',
    }));
  }
  return cachedJournal2024Rows;
}

export function getJournal2024(): (JournalRow2024 & { id: string })[] {
  return initJournal2024Rows();
}

export function addJournal2024Row(data: Partial<JournalRow2024>): JournalRow2024 & { id: string } {
  const rows = initJournal2024Rows();
  const newId = `j2024-${Date.now()}`;
  const newRow: JournalRow2024 & { id: string } = {
    id: newId,
    date: data.date || new Date().toISOString().split('T')[0],
    serial: data.serial || String(rows.length + 1),
    permitNo: data.permitNo || '',
    checkNo: data.checkNo || '',
    description: data.description || '',
    debitAccount: data.debitAccount || '',
    creditAccount: data.creditAccount || '',
    amount: String(data.amount || '0'),
    carried: data.carried || 'نعم',
  };
  rows.unshift(newRow);
  return newRow;
}

export function updateJournal2024Row(id: string, data: Partial<JournalRow2024>): JournalRow2024 & { id: string } {
  const rows = initJournal2024Rows();
  const idx = rows.findIndex((r) => r.id === id || r.serial === id);
  if (idx === -1) throw new Error('قيد 2024 غير موجود');
  rows[idx] = {
    ...rows[idx],
    ...data,
    amount: data.amount !== undefined ? String(data.amount) : rows[idx].amount,
  };
  return rows[idx];
}

export function deleteJournal2024Row(id: string): { id: string } {
  const rows = initJournal2024Rows();
  const idx = rows.findIndex((r) => r.id === id || r.serial === id);
  if (idx === -1) throw new Error('قيد 2024 غير موجود');
  rows.splice(idx, 1);
  return { id };
}

// ===== بيانات برنامج المحاسبة 2024 — مركز التدريب =====
export interface TrainingJournalRow {
  month: string;
  date: string;
  serial: string;
  permitCheck: string;
  accountCode: string;
  accountName: string;
  accountType: string;
  debit: string;
  credit: string;
  balance: string;
}

export interface TrainingAccountRow {
  code: string;
  name: string;
  type: string;
  nature: string;
  parentId: string;
  level: string;
  egyptianClassification: string;
  isActive: string;
}

export interface TrainingLedgerRow {
  accountCode: string;
  accountName: string;
  date: string;
  month: string;
  permitCheck: string;
  description: string;
  debit: string;
  credit: string;
}

export interface TrainingDebtorRow {
  party: string;
  txCount: string;
  totalDebit: string;
  totalCredit: string;
  balance: string;
}

export interface TrainingBalanceSheetRow {
  accountCode: string;
  accountName: string;
  balance2024: string;
}

export interface TrainingIncomeExpenseRow {
  item: string;
  debit2024: string;
  credit2024: string;
}

export interface TrainingTrialBalanceRow {
  accountCode: string;
  accountName: string;
  debit: string;
  credit: string;
}

export interface TrainingMonthlySummaryRow {
  month: string;
  totalDebit: string;
  totalCredit: string;
}

export interface TrainingAccounting2024Data {
  journal: TrainingJournalRow[];
  chartOfAccounts: TrainingAccountRow[];
  generalLedger: TrainingLedgerRow[];
  debtors: TrainingDebtorRow[];
  balanceSheet: TrainingBalanceSheetRow[];
  incomeExpense: TrainingIncomeExpenseRow[];
  trialBalance: TrainingTrialBalanceRow[];
  monthlySummary: TrainingMonthlySummaryRow[];
}

function readTrainingCsv(file: string): Record<string, string>[] {
  return readObjects(file);
}

/** برنامج المحاسبة 2024 — مركز التدريب المهني */
export function getTrainingAccounting2024(): TrainingAccounting2024Data {
  const journal = readTrainingCsv('تدريب_قيود_اليومية_2024.csv')
    .filter((r) => r['التاريخ'] || r['الشهر'])
    .map((r) => ({
      month: r['الشهر'] || '',
      date: r['التاريخ'] || '',
      serial: r['مسلسل'] || r['المسلسل'] || '',
      permitCheck: r['رقم الإذن/الشيك'] || '',
      accountCode: r['كود الحساب'] || '',
      accountName: r['اسم الحساب'] || '',
      accountType: r['نوع الحساب'] || '',
      debit: r['مدين'] || '0',
      credit: r['دائن'] || '0',
      balance: r['الرصيد'] || '0',
    }));

  const chartOfAccounts = readTrainingCsv('تدريب_دليل_الحسابات_2024.csv')
    .filter((r) => r['الكود'])
    .map((r) => ({
      code: r['الكود'] || '',
      name: r['اسم الحساب'] || '',
      type: r['نوع الحساب'] || '',
      nature: r['طبيعة الحساب'] || '',
      parentId: r['الكود الأب'] || '',
      level: r['المستوى'] || '',
      egyptianClassification: r['التصنيف المصري'] || '',
      isActive: r['نشط'] || '',
    }));

  const generalLedger = readTrainingCsv('تدريب_الأستاذ_العام_2024.csv')
    .filter((r) => r['كود الحساب'])
    .map((r) => ({
      accountCode: r['كود الحساب'] || '',
      accountName: r['اسم الحساب'] || '',
      date: r['التاريخ'] || '',
      month: r['الشهر'] || '',
      permitCheck: r['رقم الإذن/الشيك'] || '',
      description: r['البيان'] || '',
      debit: r['مدين'] || '0',
      credit: r['دائن'] || '0',
    }));

  const debtors = readTrainingCsv('تدريب_حساب_المدينين_2024.csv')
    .filter((r) => r['الشخص / الجهة'])
    .map((r) => ({
      party: r['الشخص / الجهة'] || '',
      txCount: r['عدد الحركات'] || '0',
      totalDebit: r['إجمالي مدين'] || '0',
      totalCredit: r['إجمالي دائن'] || '0',
      balance: r['الرصيد'] || '0',
    }));

  const balanceSheet = readTrainingCsv('تدريب_الميزانية_العمومية_2024.csv')
    .filter((r) => r['البيان'])
    .map((r) => ({
      accountCode: r['كود الحساب'] || r['الكود'] || '',
      accountName: r['البيان'] || '',
      balance2024: r['كلي'] || r['جزئي'] || r['المبلغ'] || '0',
    }));

  const incomeExpenseRows = readTrainingCsv('تدريب_الإيرادات_والمصروفات_2024.csv');
  const incomeExpense: TrainingIncomeExpenseRow[] = [];
  for (const r of incomeExpenseRows) {
    if (r['الإيرادات']) {
      incomeExpense.push({ item: r['الإيرادات'], debit2024: '0', credit2024: r['المبلغ'] || '0' });
    }
    if (r['المصروفات']) {
      incomeExpense.push({ item: r['المصروفات'], debit2024: r['المبلغ'] || '0', credit2024: '0' });
    }
  }

  const trialBalance = readTrainingCsv('تدريب_ميزان_المراجعة_2024.csv')
    .filter((r) => r['اسم الحساب'] || r['كود الحساب'] || r['الكود'])
    .map((r) => ({
      accountCode: r['كود الحساب'] || r['الكود'] || '',
      accountName: r['اسم الحساب'] || r['البيان'] || '',
      debit: r['مدين'] || '0',
      credit: r['دائن'] || '0',
    }));

  const monthlySummary = readTrainingCsv('تدريب_ملخص_شهري_2024.csv')
    .filter((r) => r['الشهر'] || r['البيان'])
    .map((r) => ({
      month: r['الشهر'] || r['البيان'] || '',
      totalDebit: r['إجمالي مدين'] || r['مدين'] || '0',
      totalCredit: r['إجمالي دائن'] || r['دائن'] || '0',
    }));

  return { journal, chartOfAccounts, generalLedger, debtors, balanceSheet, incomeExpense, trialBalance, monthlySummary };
}

// ===== الحسابات الختامية 2024 — مركز التدريب (من ملف وورد) =====
export interface FinalAccounts2024Data {
  auditorReport: string[];
  balanceSheet: { side: string; label: string; main: string; sub: string; comparative: string }[];
  incomeExpense: { type: string; label: string; amount: string }[];
  receiptsPayments: { amount: string; description: string; oppAmount: string; oppDescription: string }[];
  trialBalance: { debit: string; credit: string; account: string; oppAccount: string; oppDebit: string; oppCredit: string }[];
  expenses: { debit: string; credit: string; account: string }[];
  bankReconciliation: { description: string; amount: string }[];
  depreciation: { amount: string; description: string }[];
}

/** الميزانية العمومية والحسابات الختامية 2024 — مركز التدريب (من ملف وورد) */
export function getFinalAccounts2024(): FinalAccounts2024Data {
  const d = readJsonFile('الميزانية_الختامية_التدريب_2024.json');
  const empty = { auditorReport: [], balanceSheet: [], incomeExpense: [], receiptsPayments: [], trialBalance: [], expenses: [], bankReconciliation: [], depreciation: [] };
  if (!d) return empty;
  return {
    auditorReport: Array.isArray(d.auditorReport) ? d.auditorReport.map(String) : [],
    balanceSheet: Array.isArray(d.balanceSheet) ? d.balanceSheet : [],
    incomeExpense: Array.isArray(d.incomeExpense) ? d.incomeExpense : [],
    receiptsPayments: Array.isArray(d.receiptsPayments) ? d.receiptsPayments : [],
    trialBalance: Array.isArray(d.trialBalance) ? d.trialBalance : [],
    expenses: Array.isArray(d.expenses) ? d.expenses : [],
    bankReconciliation: Array.isArray(d.bankReconciliation) ? d.bankReconciliation : [],
    depreciation: Array.isArray(d.depreciation) ? d.depreciation : [],
  };
}

export const portalDataService = {
  getCommitteesData,
  getInsuredList,
  getJournal2024,
  addJournal2024Row,
  updateJournal2024Row,
  deleteJournal2024Row,
  getTrainingAccounting2024,
  getFinalAccounts2024,
};
