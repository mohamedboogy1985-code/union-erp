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
export function getJournal2024(): JournalRow2024[] {
  return readObjects('قيود_اليومية_2024_c.csv').map((r) => ({
    date: r['التاريخ'] || '',
    serial: r['المسلسل'] || '',
    permitNo: r['رقم الإذن'] || '',
    checkNo: r['رقم الشيك'] || '',
    description: r['البيان'] || '',
    debitAccount: r['حساب مدين'] || '',
    creditAccount: r['حساب دائن'] || '',
    amount: r['المبلغ'] || '',
    carried: r['مرحّل'] || '',
  }));
}

export const portalDataService = {
  getCommitteesData,
  getInsuredList,
  getJournal2024,
};
