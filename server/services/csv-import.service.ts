import fs from 'fs';
import path from 'path';
import { moduleDir, resolveFirst } from '../utils/runtime-paths.js';
import { erpStore, ERPStore } from '../db/store.js';
import { normalizeArabicText } from '../utils/arabic.js';
import { parseCsvToObjects } from '../utils/csv.js';
import type { Account, JournalEntry, JournalEntryLine, SubledgerParty, User } from '../../src/types/erp.js';

/**
 * ===== استيراد البيانات الحقيقية من ملفات CSV المرفقة =====
 * - دليل_الحسابات_الموحد_النهائي.csv → شاشة دليل الحسابات (استبدال الدليل التجريبي)
 * - قيود_اليومية_2024.csv → شاشة قيود اليومية (قيود مرحّلة بأرصدتها وأستاذها المساعد)
 */

const MODULE_DIR = moduleDir(typeof import.meta !== 'undefined' ? import.meta.url : undefined) || process.cwd();

/** مجلد بيانات CSV: يدعم التطوير وحزمة الإنتاج وتطبيق Electron */
export const CSV_DATA_DIR =
  resolveFirst([
    process.env.UNION_DATA_DIR,
    path.join(process.cwd(), 'server', 'data'),
    path.join(MODULE_DIR, '..', 'data'), // تطوير: server/services/../data
    path.join(MODULE_DIR, 'server', 'data'), // حزمة: dist-server/server/data أو بجوارها
    path.join(MODULE_DIR, '..', 'server', 'data'), // Electron asar: app.asar/server/data
    path.join(MODULE_DIR, '..', '..', 'server', 'data'),
  ]) || path.join(process.cwd(), 'server', 'data');

const TYPE_MAP: Record<string, Account['type']> = {
  'أصول': 'ASSET',
  'اصول': 'ASSET',
  'الالتزامات': 'LIABILITY',
  'التزامات': 'LIABILITY',
  'الإيرادات': 'REVENUE',
  'إيرادات': 'REVENUE',
  'ايرادات': 'REVENUE',
  'المصروفات': 'EXPENSE',
  'مصروفات': 'EXPENSE',
  'حقوق الملكية': 'EQUITY',
  'حقوق ملكية': 'EQUITY',
};

const NATURE_MAP: Record<string, Account['nature']> = {
  'مدين': 'DEBIT',
  'مدينة': 'DEBIT',
  'دائن': 'CREDIT',
  'دائنة': 'CREDIT',
};

/** خلاصة الاستيراد */
export interface CsvImportSummary {
  chart?: {
    accountsImported: number;
    groupsCreated: number;
    duplicatesSkipped: number;
    invalidRows: number;
  };
  entries?: {
    imported: number;
    posted: number;
    totalDebit: number;
    partiesCreated: number;
    errors: { serial: string; message: string }[];
  };
}

export class CsvImportService {
  /**
   * استبدال دليل الحسابات التجريبي بالدليل الموحد النهائي من ملف CSV
   * الأعمدة: الكود القديم;اسم الحساب;كود القسم;اسم القسم;الكود الجديد;نوع الحساب;طبيعة الحساب;ملاحظات
   */
  public applyUnifiedChartOfAccounts(csvText: string, user?: User): CsvImportSummary['chart'] {
    const rows = parseCsvToObjects(csvText);
    if (rows.length === 0) throw new Error('ملف دليل الحسابات فارغ أو غير صالح.');

    const get = (r: Record<string, string>, ...keys: string[]) => {
      for (const k of keys) {
        const found = Object.keys(r).find((h) => normalizeArabicText(h) === normalizeArabicText(k));
        if (found && r[found]) return r[found].trim();
      }
      return '';
    };

    // 1) تنظيف البيانات التجريبية المحاسبية (القيود/الإيصالات/الأستاذ المساعد/الموازنات)
    //    مع الإبقاء على المستخدمين والجهات وسجل التدقيق
    erpStore.accounts = [];
    erpStore.journalEntries = [];
    erpStore.receipts = [];
    erpStore.subledgerParties = [];
    erpStore.subledgerAliases = [];
    erpStore.fiscalPeriods = [];
    erpStore.budgets = [];
    erpStore.distributionRules = [];
    erpStore.accountingHistory = [];

    // 2) بناء الأقسام (المجموعات) من (كود القسم + اسم القسم)
    const groups = new Map<string, { id: string; code: string; name: string }>();
    const accounts: Account[] = [];
    const seenCodes = new Set<string>();
    let duplicatesSkipped = 0;
    let invalidRows = 0;

    for (const row of rows) {
      const newName = get(row, 'اسم الحساب');
      const newCode = get(row, 'الكود الجديد');
      if (!newName || !newCode) continue; // أسطر الأقسام الفارغة

      const cleanName = newName.replace(/\s*\(مكرر\)\s*$/g, '').trim();
      if (seenCodes.has(newCode)) {
        duplicatesSkipped++;
        continue;
      }

      const typeAr = get(row, 'نوع الحساب');
      const natureAr = get(row, 'طبيعة الحساب');
      const accountType = TYPE_MAP[typeAr.replace(/^ال/, '')] || TYPE_MAP[typeAr];
      const nature = NATURE_MAP[natureAr.replace(/^ال/, '')] || NATURE_MAP[natureAr];

      if (!accountType || !nature) {
        invalidRows++;
        continue;
      }

      // القسم الأب
      const groupCode = get(row, 'كود القسم');
      const groupName = get(row, 'اسم القسم');
      let parent: Account['parentId'] = undefined;
      if (groupCode) {
        if (!groups.has(groupCode)) {
          const gid = `accgrp-${groupCode}`;
          groups.set(groupCode, { id: gid, code: groupCode, name: groupName || `قسم ${groupCode}` });
        }
        parent = groups.get(groupCode)!.id;
      }

      seenCodes.add(newCode);
      const requiresSubledger = normalizeArabicText(cleanName).includes(normalizeArabicText('مدينون متنوعون'));
      accounts.push({
        id: `accu-${newCode}`,
        code: newCode,
        name: cleanName,
        type: accountType,
        nature,
        parentId: parent,
        isParent: false,
        level: parent ? 3 : 2,
        requiresSubledger,
        subledgerType: requiresSubledger ? 'MISC_DEBTOR' : 'NONE',
        currentBalance: 0,
        isActive: true,
      });
    }

    // 3) إدراج المجموعات ثم الحسابات
    const groupAccounts: Account[] = [...groups.values()].map((g) => ({
      id: g.id,
      code: g.code,
      name: g.name,
      type: 'ASSET' as Account['type'], // يُضبط أدناه حسب أغلبية الأبناء
      nature: 'DEBIT' as Account['nature'],
      isParent: true,
      level: 2,
      requiresSubledger: false,
      subledgerType: 'NONE',
      currentBalance: 0,
      isActive: true,
    }));

    // نوع المجموعة = نوع أول ابن فيها
    for (const ga of groupAccounts) {
      const child = accounts.find((a) => a.parentId === ga.id);
      if (child) {
        ga.type = child.type;
        ga.nature = child.nature;
      }
    }

    erpStore.accounts = [...groupAccounts, ...accounts];

    if (user) {
      erpStore.recordAudit(
        user.id,
        user.fullName,
        user.role,
        user.organizationId,
        'CHART_OF_ACCOUNTS_IMPORTED',
        'ACCOUNT',
        'UNIFIED_CHART_CSV',
        `استيراد الدليل المحاسبي الموحد النهائي من ملف CSV: ${accounts.length} حساباً في ${groupAccounts.length} قسماً (${duplicatesSkipped} مكرر، ${invalidRows} سطر غير صالح)`
      );
    }

    return {
      accountsImported: accounts.length,
      groupsCreated: groupAccounts.length,
      duplicatesSkipped,
      invalidRows,
    };
  }

  /**
   * استيراد قيود اليومية من ملف CSV (صيغة: التاريخ,المسلسل,رقم الإذن,رقم الشيك,البيان,حساب مدين,حساب دائن,المبلغ,مرحّل)
   * - مطابقة الحسابات بالاسم المطبع من الدليل الموحد
   * - إنشاء حسابات الأستاذ المساعد تلقائياً لسطور مدينون متنوعون (استخلاص اسم الشخص من البيان)
   * - القيود المرحّلة تُرحّل أرصدتها فعلياً مع تسجيل سجل التحديثات المحاسبية
   */
  public importJournalEntriesCsv(csvText: string, user?: User, journalName?: string): CsvImportSummary['entries'] {
    const rows = parseCsvToObjects(csvText);
    if (rows.length === 0) throw new Error('ملف قيود اليومية فارغ أو غير صالح.');

    const get = (r: Record<string, string>, ...keys: string[]) => {
      for (const k of keys) {
        const found = Object.keys(r).find((h) => normalizeArabicText(h) === normalizeArabicText(k));
        if (found && r[found] !== undefined && r[found] !== '') return r[found].trim();
      }
      return '';
    };

    const findAccountByName = (name: string): Account | undefined => {
      const target = normalizeArabicText(name);
      if (!target) return undefined;
      return (
        erpStore.accounts.find((a) => !a.isParent && normalizeArabicText(a.name) === target) ||
        erpStore.accounts.find((a) => !a.isParent && normalizeArabicText(a.name).startsWith(target)) ||
        erpStore.accounts.find((a) => !a.isParent && normalizeArabicText(a.name).includes(target))
      );
    };

    /** استخلاص اسم الشخص من البيان قبل كلمات الغرض (عهدة/استعاضة/مصروفات...) */
    const extractPartyName = (description: string): string | undefined => {
      const split = description.split(/\s+(?:عهدة|عهدة مستديمة|استعاضة|مصروفات|مصاريف|سداد|تحصيل|شراء|دفع|مراجعة|للقيام)/);
      const candidate = split[0]?.trim();
      if (candidate && candidate.length >= 5 && /[\u0600-\u06FF]/.test(candidate)) {
        return candidate.replace(/\s+/g, ' ');
      }
      return undefined;
    };

    const adminUser = user || erpStore.users[0];
    const results: CsvImportSummary['entries'] = {
      imported: 0,
      posted: 0,
      totalDebit: 0,
      partiesCreated: 0,
      errors: [],
    };

    // تجميع صفوف كل قيد حسب (التاريخ + المسلسل) لدعم القيود متعددة الأسطر:
    // صف بسيط يملك حساب مدين + حساب دائن = قيد عادي؛ عدة صفوف بنفس المسلسل = قيد بعدة أسطر
    const groupBy = new Map<string, typeof rows>();
    for (const row of rows) {
      const date = get(row, 'التاريخ');
      const serial = get(row, 'المسلسل');
      if (!date) continue;
      const key = `${date}|${serial || ''}`;
      if (!groupBy.has(key)) groupBy.set(key, []);
      groupBy.get(key)!.push(row);
    }

    // ترتيب المجموعات حسب التاريخ ثم المسلسل لضمان تسلسل الأرصدة الزمني
    const groupKeys = [...groupBy.keys()].sort((a, b) => {
      const [da, sa] = a.split('|');
      const [db, sb] = b.split('|');
      if (da !== db) return da < db ? -1 : 1;
      return String(sa).localeCompare(String(sb), 'en', { numeric: true });
    });

    for (const key of groupKeys) {
      const groupRows = groupBy.get(key)!;
      const first = groupRows[0];
      const date = get(first, 'التاريخ');
      const serial = get(first, 'المسلسل') || String(results.imported + 1);
      try {
        const description = get(first, 'البيان') || 'قيد مستورد من ملف قيود اليومية';
        const posted = normalizeArabicText(get(first, 'مرحّل', 'مرحل')).includes('نعم') || get(first, 'مرحّل', 'مرحل') === 'yes';
        const permitNo = get(first, 'رقم الإذن');
        const chequeNo = get(first, 'رقم الشيك');

        if (!date) throw new Error('تاريخ مفقود');

        // جمع أرجل القيد (مدين/دائن) من كل صفوف المجموعة
        const debitLegs: { account: Account; amount: number; party?: SubledgerParty }[] = [];
        const creditLegs: { account: Account; amount: number }[] = [];
        for (const row of groupRows) {
          const debitName = get(row, 'حساب مدين');
          const creditName = get(row, 'حساب دائن');
          const amount = Number(get(row, 'المبلغ').replace(/,/g, ''));
          if (!amount || amount <= 0) continue;

          if (debitName) {
            const debitAcc = findAccountByName(debitName);
            if (!debitAcc) throw new Error(`الحساب المدين [${debitName}] غير موجود في الدليل`);
            let debitParty: SubledgerParty | undefined;
            if (debitAcc.requiresSubledger) {
              const partyName = extractPartyName(description);
              if (partyName) {
                const normalized = normalizeArabicText(partyName);
                debitParty = erpStore.subledgerParties.find(
                  (p) => p.associatedAccountId === debitAcc.id && p.normalizedName === normalized
                );
                if (!debitParty) {
                  const count =
                    erpStore.subledgerParties.filter((p) => p.associatedAccountId === debitAcc.id).length + 1;
                  debitParty = {
                    id: `party-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
                    partyCode: `DEBT-${String(count + 100).padStart(3, '0')}`,
                    name: partyName,
                    normalizedName: normalized,
                    type: 'MISC_DEBTOR',
                    organizationId: adminUser.organizationId,
                    associatedAccountId: debitAcc.id,
                    totalDebit: 0,
                    totalCredit: 0,
                    currentBalance: 0,
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                  };
                  erpStore.subledgerParties.push(debitParty);
                  results.partiesCreated++;
                }
              }
            }
            debitLegs.push({ account: debitAcc, amount, party: debitParty });
          }
          if (creditName) {
            const creditAcc = findAccountByName(creditName);
            if (!creditAcc) throw new Error(`الحساب الدائن [${creditName}] غير موجود في الدليل`);
            creditLegs.push({ account: creditAcc, amount });
          }
        }

        const totalDebit = debitLegs.reduce((s, x) => s + x.amount, 0);
        const totalCredit = creditLegs.reduce((s, x) => s + x.amount, 0);
        if (debitLegs.length === 0) throw new Error('لا توجد أرجل مدينة');
        if (creditLegs.length === 0) throw new Error('لا توجد أرجل دائنة');
        if (Math.abs(totalDebit - totalCredit) > 0.01) {
          throw new Error(`قيد غير متوازن (مدين ${totalDebit} / دائن ${totalCredit})`);
        }

        // الفترة المالية الخاصة بالقيد التاريخي (مقفلة لأنها فترة مؤرشفة)
        const periodKey = date.slice(0, 7);
        let period = erpStore.fiscalPeriods.find((p) => p.id === `fp-${periodKey}`);
        if (!period) {
          const monthNames = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
          period = {
            id: `fp-${periodKey}`,
            year: Number(date.slice(0, 4)),
            periodNumber: Number(date.slice(5, 7)),
            name: `${monthNames[Number(date.slice(5, 7)) - 1]} ${date.slice(0, 4)}`,
            startDate: `${periodKey}-01`,
            endDate: `${periodKey}-28`,
            status: 'CLOSED',
            closedAt: new Date().toISOString(),
          };
          erpStore.fiscalPeriods.push(period);
        }

        const entryId = `jei-${periodKey}-${serial}`;
        let lineNumber = 1;
        const lines: JournalEntryLine[] = [];
        for (const leg of debitLegs) {
          lines.push({
            id: `${entryId}-d${lineNumber}`,
            journalEntryId: entryId,
            lineNumber: lineNumber++,
            accountId: leg.account.id,
            accountCode: leg.account.code,
            accountName: leg.account.name,
            subledgerPartyId: leg.party?.id,
            subledgerPartyName: leg.party?.name,
            debit: leg.amount,
            credit: 0,
            description,
          });
        }
        for (const leg of creditLegs) {
          lines.push({
            id: `${entryId}-c${lineNumber}`,
            journalEntryId: entryId,
            lineNumber: lineNumber++,
            accountId: leg.account.id,
            accountCode: leg.account.code,
            accountName: leg.account.name,
            debit: 0,
            credit: leg.amount,
            description: `مقابل${chequeNo ? ` — شيك رقم ${chequeNo}` : ''}${permitNo ? ` / إذن رقم ${permitNo}` : ''}`,
          });
        }

        const org = erpStore.organizations[0];
        const entry: JournalEntry = {
          id: entryId,
          entryNumber: `JV-${date.slice(0, 4)}-${String(Number(serial)).padStart(4, '0')}`,
          date,
          organizationId: org.id,
          organizationName: org.name,
          fiscalPeriodId: period.id,
          fiscalPeriodName: period.name,
          type: 'PAYMENT',
          status: posted ? 'POSTED' : 'DRAFT',
          description,
          journalName: journalName || 'يومية النقابة',
          sourceDocumentType: permitNo ? 'PAYMENT_PERMIT' : 'CSV_IMPORT',
          sourceDocumentId: permitNo || undefined,
          totalDebit,
          totalCredit,
          lines,
          createdBy: adminUser.id,
          createdByName: `${adminUser.fullName} (استيراد CSV)`,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          postedAt: posted ? new Date().toISOString() : undefined,
          postedBy: posted ? adminUser.id : undefined,
        };

        // ترحيل الأثر المالي للقيود المرحّلة
        if (posted) {
          for (const line of lines) {
            const account = erpStore.accounts.find((a) => a.id === line.accountId);
            if (account) {
              const previousBalance = account.currentBalance;
              account.currentBalance +=
                account.nature === 'DEBIT' ? line.debit - line.credit : line.credit - line.debit;
              erpStore.recordAccountingHistory(
                account,
                previousBalance,
                account.currentBalance - previousBalance,
                `استيراد قيد [${entry.entryNumber}] - ${description.slice(0, 80)}`,
                entry.id
              );
            }
            if (line.subledgerPartyId) {
              const party = erpStore.subledgerParties.find((p) => p.id === line.subledgerPartyId);
              if (party) {
                party.totalDebit += line.debit;
                party.totalCredit += line.credit;
                party.currentBalance = party.totalDebit - party.totalCredit;
                party.updatedAt = new Date().toISOString();
              }
            }
          }
          results.posted++;
        }

        erpStore.journalEntries.push(entry);
        results.imported++;
        results.totalDebit += totalDebit;
      } catch (err: any) {
        results.errors.push({ serial, message: err?.message || 'خطأ غير معروف' });
      }
    }

    // عرض القيود الأحدث أولاً (كما تفعل بقية الشاشات)
    erpStore.journalEntries.sort((a, b) => (a.date < b.date ? 1 : -1));

    if (user || results.imported > 0) {
      erpStore.recordAudit(
        adminUser.id,
        adminUser.fullName,
        adminUser.role,
        adminUser.organizationId,
        'JOURNAL_ENTRIES_IMPORTED',
        'JOURNAL_ENTRY',
        'CSV_IMPORT_2024',
        `استيراد قيود اليومية من ملف CSV: ${results.imported} قيداً (${results.posted} مرحّلاً) بإجمالي ${results.totalDebit.toLocaleString()} ج.م وإنشاء ${results.partiesCreated} حساب أستاذ مساعد${results.errors.length > 0 ? ` — ${results.errors.length} سطر مرفوض` : ''}`
      );
    }

    return results;
  }

  /**
   * التحميل التلقائي عند إقلاع الخادم من مجلد server/data
   * يُستدعى قبل مزامنة Cloud SQL حتى تُزرع البيانات الحقيقية في قاعدة البيانات عند توفرها
   */
  public loadRealDataFromCsvFiles(): CsvImportSummary & { loaded: boolean } {
    const summary: CsvImportSummary & { loaded: boolean } = { loaded: false };
    const admin = erpStore.users[0];

    try {
      const chartPath = this.findDataFile(/دليل_الحسابات|chart/i);
      if (chartPath) {
        const csv = fs.readFileSync(chartPath, 'utf-8');
        const chartSummary = this.applyUnifiedChartOfAccounts(csv, admin);
        if (!chartSummary) throw new Error('لم يتم إرجاع خلاصة صالحة من دليل الحسابات.');
        summary.chart = chartSummary;
        summary.loaded = true;
        console.log(`📊 تم تحميل الدليل الموحد: ${chartSummary.accountsImported} حساباً في ${chartSummary.groupsCreated} قسماً`);
      }

      const entriesPaths = this.findAllDataFiles(/قيود|journal/i);
      if (entriesPaths.length > 0) {
        const agg: CsvImportSummary['entries'] = {
          imported: 0,
          posted: 0,
          totalDebit: 0,
          partiesCreated: 0,
          errors: [],
        };
        for (const ep of entriesPaths) {
          // اسم دفتر اليومية يُستنتج من اسم الملف: ملفات "لجان" = يومية لجان الشركات
          const base = path.basename(ep);
          const journalName = /لجان|لجنة|الشركات|مصر الجديدة|بنك القاهرة/i.test(base)
            ? 'يومية لجان الشركات'
            : 'يومية النقابة';
          const fileSummary = this.importJournalEntriesCsv(fs.readFileSync(ep, 'utf-8'), admin, journalName);
          if (!fileSummary) throw new Error(`لم يتم إرجاع خلاصة صالحة من ملف ${path.basename(ep)}.`);
          agg.imported += fileSummary.imported;
          agg.posted += fileSummary.posted;
          agg.totalDebit += fileSummary.totalDebit;
          agg.partiesCreated += fileSummary.partiesCreated;
          agg.errors.push(...fileSummary.errors);
          console.log(
            `📒 تم تحميل [${path.basename(ep)}]: ${fileSummary.imported} قيداً (${fileSummary.posted} مرحّلاً) بإجمالي ${fileSummary.totalDebit.toLocaleString()} ج.م`
          );
        }
        summary.entries = agg;
        summary.loaded = true;
        console.log(
          `📒 إجمالي القيود المحمّلة: ${agg.imported} قيداً بإجمالي ${agg.totalDebit.toLocaleString()} ج.م`
        );
      }
    } catch (err: any) {
      console.error('فشل تحميل ملفات البيانات الحقيقية — سيتم استخدام البيانات التجريبية:', err?.message || err);
      // استرداد آمن: إعادة توليد المتجر التجريبي بالكامل (الطرق على الـ prototype تبقى سليمة)
      try {
        const fresh = new ERPStore();
        Object.assign(erpStore, fresh);
      } catch (reSeedErr: any) {
        console.error('فشل إعادة التهيئة التجريبية أيضاً:', reSeedErr?.message);
      }
    }

    return summary;
  }

  private findDataFile(pattern: RegExp): string | null {
    try {
      const dir = fs.statSync(CSV_DATA_DIR).isDirectory() ? CSV_DATA_DIR : path.dirname(CSV_DATA_DIR);
      const files = fs.readdirSync(dir);
      const match = files.find((f) => f.toLowerCase().endsWith('.csv') && pattern.test(f));
      return match ? path.join(dir, match) : null;
    } catch {
      return null;
    }
  }

  private findAllDataFiles(pattern: RegExp): string[] {
    try {
      const dir = fs.statSync(CSV_DATA_DIR).isDirectory() ? CSV_DATA_DIR : path.dirname(CSV_DATA_DIR);
      const files = fs.readdirSync(dir);
      return files
        .filter((f) => f.toLowerCase().endsWith('.csv') && pattern.test(f))
        .map((f) => path.join(dir, f));
    } catch {
      return [];
    }
  }
}

export const csvImportService = new CsvImportService();
