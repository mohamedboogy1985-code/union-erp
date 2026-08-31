import fs from 'fs';
import path from 'path';
import JSZip from 'jszip';
import ExcelJS from 'exceljs';
import { erpStore } from '../db/store.js';
import { accountingService } from './accounting.service.js';
import { normalizeArabicText } from '../utils/arabic.js';
import { can } from '../security/permissions.js';
import type { PayrollLine, User } from '../../src/types/erp.js';

/**
 * ===== استيراد أرشيف كشوف المرتبات (ZIP/Excel) والربط المحاسبي التلقائي =====
 * المرحلة 1 — المعالجة الخلفية: فك ضغط الأرشيف وقراءة كل كشوف Excel (xls/xlsx)
 *             وتحويلها لسجلات مرتبات شهرية مهيكلة (معاينة قبل الحفظ).
 *
 * المرحلة 2 — الربط المحاسبي (ERP Ledger Routing) عند الاعتماد:
 *   • القيود والحسابات: قيد استحقاق شهري متوازن
 *       من حـ/ مصاريف الأجور والمرتبات (الإجمالي)
 *       إلى حـ/ الهيئة القومية للتأمين الاجتماعي + حـ/ ضرائب كسب العمل
 *         + حـ/ سلف العاملين + حـ/ أجور مستحقة للصرف (الصافي)
 *   • شئون العاملين والتأمينات: تحديث الأجر الفعلي للعاملين المطابقين واستخراج ملخص استمارة 2
 *   • سلف العاملين: تسجيل أقساط الاستقطاع الشهري وتحديث المتبقي حتى السداد
 *   • الدراسات الإكتوارية: احتساب حصة اشتراك صناديق المعاشات والتكافل من الأجور
 *   • الموازنة التقديرية: حساب انحراف الأجور الفعلية مقارنة بالموازنة المعتمدة
 */

// ---------- أدوات مساعدة ----------

const AR_MONTHS: Record<string, number> = {
  'يناير': 1, 'فبراير': 2, 'مارس': 3, 'ابريل': 4, 'أبريل': 4, 'مايو': 5,
  'يونيو': 6, 'يوليو': 7, 'اغسطس': 8, 'أغسطس': 8, 'سبتمبر': 9,
  'اكتوبر': 10, 'أكتوبر': 10, 'نوفمبر': 11, 'ديسمبر': 12,
};

const num = (v: any): number => {
  if (v === null || v === undefined || v === '') return 0;
  const n = Number(String(v).replace(/[,\s٬]/g, '').replace(/٫/g, '.'));
  return Number.isFinite(n) ? n : 0;
};

const norm = (s: string) => normalizeArabicText(String(s ?? ''));

/** استخراج الشهر من اسم مجلد/ملف عربي مثل «مرتبات يناير 2024» */
function extractMonthFromName(name: string): { year?: number; month?: number } {
  const n = norm(name);
  let month: number | undefined;
  for (const [arName, m] of Object.entries(AR_MONTHS)) {
    if (n.includes(norm(arName))) {
      month = m;
      break;
    }
  }
  const yearMatch = n.match(/(20\d{2})/);
  const year = yearMatch ? Number(yearMatch[1]) : undefined;
  return { year, month };
}

/** تصنيف أعمدة كشف المرتبات بمطابقة دلالية عربية مرنة */

export interface ImportedPayrollMonth {
  reportType?: string;
  fileName: string;
  sheetName: string;
  year: number;
  month: number;
  monthLabelAr: string;
  employeesCount: number;
  totals: {
    gross: number;
    basic: number;
    allowances: number;
    insurance: number;
    tax: number;
    loans: number;
    otherDeductions?: number;
    net: number;
  };
  rows: {
    name: string;
    basic: number;
    allowances: number;
    gross: number;
    insurance: number;
    tax: number;
    loans: number;
    otherDeductions: number;
    grossDeductions: number;
    net: number;
  }[];
}

export interface ImportSummaryResult {
  monthsFound: number;
  filesScanned: number;
  skippedFiles: string[];
  totalGross: number;
  totalNet: number;
  months: {
    fileName: string;
    monthLabelAr: string;
    employeesCount: number;
    gross: number;
    insurance: number;
    tax: number;
    loans: number;
    net: number;
  }[];
}

const MONTHS_AR_LABELS = [
  '', 'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
];

/**
 * تحليل كشف مرتبات بمصفوفة خام مع دعم الرؤوس المزدوجة وقسم الاستقطاعات
 * البنية المصرية النموذجية: أعمدة المستحقات ثم «الجملة» ثم قسم «استقطاعات»
 * ملاحظة: كل الكلمات المفتاحية أدناه بصيغة مطبَّعة (normalizeArabicText: ة→ه، أإآ→ا، ى→ي)
 */
export function parseSheetMatrix(matrix: any[][]): { name: string; basic: number; allowances: number; gross: number; insurance: number; tax: number; loans: number; otherDeductions: number; grossDeductions: number; net: number }[] {
  // 1) صف الرأس: يحتوي عمود «الاسم»
  let headerIdx = -1;
  for (let r = 0; r < Math.min(matrix.length, 20); r++) {
    const joined = matrix[r].map((c) => norm(String(c))).join('|');
    if (joined.includes('اسم')) {
      headerIdx = r;
      break;
    }
  }
  if (headerIdx === -1) return [];

  // 2) دمج الرأس المزدوج (صفان أو ثلاثة نصية متتالية قبل أول صف بيانات رقمي)
  const width = Math.max(...matrix.slice(headerIdx, headerIdx + 3).map((r) => r.length));
  const labels: string[] = new Array(width).fill('');
  for (let r = headerIdx; r <= headerIdx + 2 && r < matrix.length; r++) {
    let hasDataNumbers = false;
    const rowLabels = matrix[r].map((c) => {
      const s = String(c ?? '');
      if (/^\d{2,}(\.\d+)?$/.test(s.trim())) hasDataNumbers = true;
      return s;
    });
    if (hasDataNumbers && r > headerIdx) break;
    rowLabels.forEach((c, i) => {
      const t = norm(c);
      if (t && !labels[i].includes(t)) labels[i] = `${labels[i]} ${t}`.trim();
    });
  }

  // مواضع مهمة
  const findIdx = (pred: (label: string, index: number) => boolean) => labels.findIndex(pred);
  const nameIdx = findIdx((l) => l.includes('اسم'));
  if (nameIdx === -1) return [];

  // بداية قسم الاستقطاعات: خلية «استقطاعات» أو أول عمود خصم بعد عمود الجملة
  let dedStart = findIdx((l) => l.includes('استقطاع'));
  if (dedStart === -1) {
    dedStart = findIdx(
      (l, i) =>
        i > nameIdx &&
        (l.includes('خصم') || l.includes('قسط') || l.includes('سلف') || l.includes('ضرائب')) &&
        labels.slice(Math.max(nameIdx + 1, i - 3), i).some((p) => p.includes('جمله') || p.includes('صافي'))
    );
  }

  /** تصنيف عمود واحد: مستحق / خصم / عرض-يُستبعد */
  const classify = (l: string, i: number): 'EARN' | 'DED' | 'SKIP' => {
    if (i <= nameIdx) return 'SKIP';
    if (!l) return 'EARN';
    // أعمدة العرض والإجماليات والملاحظات
    if (
      l.includes('جمله') ||
      l.includes('اجمالي') ||
      l === 'شامل' ||
      (l.includes('شامل') && l.includes('جمله')) ||
      l.includes('صافي') ||
      l.includes('وعاء') ||
      l.includes('الفرق') ||
      l.includes('توقيع') ||
      l.includes('ملاحظ')
    ) {
      return 'SKIP';
    }
    // حصة النقابة الإعلامية قبل قسم الاستقطاعات (تكرار لعمود الاستقطاع)
    if (l.includes('حصه النقاب') && (dedStart === -1 || i < dedStart)) return 'SKIP';
    if (l.includes('استقطاع')) return 'SKIP';
    // كلمات الخصومات
    if (
      l.includes('قسط') ||
      l.includes('سلف') ||
      l.includes('قرض') ||
      l.includes('ضريب') ||
      l.includes('ضرائب') ||
      l.includes('اشتراك') ||
      l.includes('تامين') ||
      l.includes('خصم')
    ) {
      return dedStart === -1 || i >= dedStart ? 'DED' : 'SKIP';
    }
    if (dedStart !== -1 && i >= dedStart) return 'DED';
    return 'EARN';
  };
  const kinds: ('EARN' | 'DED' | 'SKIP')[] = [];
  for (let i = 0; i < width; i++) kinds.push(classify(labels[i] || '', i));

  const isNumeric = (v: any) => v !== '' && v !== null && Number.isFinite(Number(String(v).replace(/,/g, '')));

  // 3) صفوف البيانات
  const out: ReturnType<typeof parseSheetMatrix> = [];
  let blankRun = 0;
  for (let r = headerIdx + 1; r < matrix.length; r++) {
    const row = matrix[r];
    if (!row?.length) continue;
    const rawName = String(row[nameIdx] ?? '').trim();
    const nName = norm(rawName);
    if (!rawName || nName.length < 3) {
      blankRun++;
      if (blankRun > 3) break;
      continue;
    }
    blankRun = 0;
    if (nName.includes('اجمالي') || nName.includes('توقيع') || nName.includes('مسؤول') || nName.includes('اعتماد')) break;

    let earn = 0, basic = 0, allow = 0, ins = 0, tax = 0, loans = 0, otherDed = 0;
    for (let c = nameIdx + 1; c < Math.min(row.length, width); c++) {
      const k = kinds[c];
      if (k === 'SKIP' || !isNumeric(row[c])) continue;
      const v = num(row[c]);
      const l = labels[c] || '';
      if (k === 'EARN') {
        earn += v;
        if (l.includes('اساسي')) basic += v;
        else allow += v;
      } else {
        if (l.includes('تامين')) ins += v;
        else if (l.includes('ضريب') || l.includes('ضرائب')) tax += v;
        else if (l.includes('سلف') || l.includes('قرض') || l.includes('قسط')) loans += v;
        else otherDed += v;
      }
    }
    const ded = Math.round((ins + tax + loans + otherDed) * 100) / 100;
    earn = Math.round(earn * 100) / 100;
    if (earn === 0 && ded === 0) continue;
    out.push({
      name: rawName,
      basic: Math.round(basic * 100) / 100,
      allowances: Math.round(allow * 100) / 100,
      gross: earn,
      insurance: Math.round(ins * 100) / 100,
      tax: Math.round(tax * 100) / 100,
      loans: Math.round(loans * 100) / 100,
      otherDeductions: Math.round(otherDed * 100) / 100,
      grossDeductions: ded,
      net: Math.round((earn - ded) * 100) / 100,
    });
  }
  return out;
}

/** هل الورقة مرجعية/ملخصة لا تمثل كشف صرف فعلي؟ */
function isReferenceSheet(sheetName: string): boolean {
  const n = norm(sheetName);
  return (
    n.includes('تاميني') ||
    n.includes('والشامل') ||
    n === 'شامل' ||
    /^ورق[هة]/.test(n) ||
    /^sheet/i.test(n)
  );
}

/** مفتاح توحيد نسخ الملفات المكررة (إزالة الأرقام وعلامات ترقيم ولاحقة «بعد تعديل») */
function dedupKey(fileName: string): string {
  let n = norm(fileName.split('/').pop() || fileName);
  n = n.replace(/بعد\s*تعديل[^]*$/, '').replace(/تعديل\s*الضرائب/g, '');
  n = n.replace(/\d+/g, ' ').replace(/[-_\-.]+/g, ' ').replace(/\s+/g, ' ').trim();
  return n;
}

/**
 * استخراج نوع التقرير من اسم الملف بمزج أسماء الشهور والأعوام واللاحقات
 * مثال: "مرتبات-المكاتب يناير 2024 بعد تعديل الضرائب" → "مرتبات-المكاتب"
 *        "مكافآت_Q1 2024.xlsx" → "مكافآت_Q1"
 */
function extractReportType(fileName: string): string {
  let n = norm(fileName.split('/').pop() || fileName);
  // إزالة اللاحقات المعرفة
  n = n.replace(/بعد\s*تعديل[^]*$/, '').replace(/تعديل\s*الضرائب/g, '');
  // إزالة أسماء الشهور
  for (const ar of Object.keys(AR_MONTHS)) {
    n = n.replace(new RegExp(norm(ar), 'g'), '');
  }
  // إزالة الأعوام (4 أرقام تبدأ بـ 20)
  n = n.replace(/\b20\d{2}\b/g, '');
  // إزالة الأرقام وعلامات الترقيم
  n = n.replace(/\d+/g, ' ').replace(/[-_\.]+/g, ' ').replace(/\s+/g, ' ').trim();
  return n || 'عام';
}

export class PayrollImportService {
  private importsFile = path.join(process.cwd(), 'data', 'payroll-imports.json');

  /** تحميل الكشوف المعتمدة سابقاً عند إقلاع الخادم */
  public loadPersistedImports(): number {
    try {
      if (!fs.existsSync(this.importsFile)) return 0;
      const raw = JSON.parse(fs.readFileSync(this.importsFile, 'utf-8'));
      if (!Array.isArray(raw)) return 0;
      const known = new Set(erpStore.payrollImports.map((m) => m.id));
      let added = 0;
      for (const rec of raw) {
        if (rec?.id && !known.has(rec.id)) {
          erpStore.payrollImports.push(rec);
          added++;
        }
      }
      return added;
    } catch {
      return 0;
    }
  }

  /** حفظ كشف معتمد جديد على القرص */
  private persistImport(record: any): void {
    try {
      const dir = path.dirname(this.importsFile);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const existing = fs.existsSync(this.importsFile)
        ? JSON.parse(fs.readFileSync(this.importsFile, 'utf-8'))
        : [];
      const list: any[] = Array.isArray(existing) ? existing : [];
      list.push(record);
      fs.writeFileSync(this.importsFile, JSON.stringify(list), 'utf-8');
    } catch (err: any) {
      console.error(`تعذر حفظ كشف المرتبات المستورد: ${err.message}`);
    }
  }

  /**
   * المرحلة 1: فك الضغط وتحليل كل ملفات Excel داخل الأرشيف (بدون أي حفظ)
   * التجميع الموحد: يقرأ اسم كل ملف ويُجمع حسب نوع التقرير أولاً ثم حسب الشهر
   */
  public async parseArchive(zipBase64: string): Promise<ImportSummaryResult> {
    const zipBuffer = Buffer.from(zipBase64, 'base64');
    const zip = await JSZip.loadAsync(zipBuffer);

    const result: ImportSummaryResult = {
      monthsFound: 0,
      filesScanned: 0,
      skippedFiles: [],
      totalGross: 0,
      totalNet: 0,
      months: [],
    };

    // -------- المرحلة أ: قراءة الملفات وتجميعها حسب نوع التقرير --------
    // byType → byMonth → dedupKey → أفضل نسخة
    const byType = new Map<string, Map<string, { year: number; month: number; winners: Map<string, { fileName: string; buffer: Buffer; score: number }> }>>();

    const entries = Object.values(zip.files).filter((f) => !f.dir && /\.(xlsx|xls)$/i.test(f.name));
    result.filesScanned = entries.length;

    for (const entry of entries) {
      try {
        const { year, month } = extractMonthFromName(entry.name);
        if (!month || !year) {
          result.skippedFiles.push(`${entry.name} (خارج تسمية شهر/سنة)`);
          continue;
        }
        const data = await entry.async('nodebuffer');
        const reportType = extractReportType(entry.name);
        const monthKey = `${year}-${String(month).padStart(2, '0')}`;

        if (!byType.has(reportType)) byType.set(reportType, new Map());
        const typeMap = byType.get(reportType)!;
        if (!typeMap.has(monthKey)) typeMap.set(monthKey, { year, month, winners: new Map() });
        const bucket = typeMap.get(monthKey)!;

        const dKey = dedupKey(entry.name);
        const nName = norm(entry.name);
        const score = (nName.includes('تعديل') ? 2 : 0) + (nName.includes('بعد') ? 1 : 0);
        const existing = bucket.winners.get(dKey);
        if (!existing || score > existing.score) {
          if (existing) result.skippedFiles.push(`${existing.fileName} (نسخة مكررة — اعتُمدت الأحدث)`);
          bucket.winners.set(dKey, { fileName: entry.name, buffer: data, score });
        } else {
          result.skippedFiles.push(`${entry.name} (نسخة مكررة — اعتُمدت الأحدث)`);
        }
      } catch {
        result.skippedFiles.push(entry.name);
      }
    }

    // -------- المرحلة ب: قراءة ملفات Excel لكل نوع تقرير --------
    const reportTypesMap = new Map<string, {
      label: string;
      months: { fileName: string; monthLabelAr: string; employeesCount: number; gross: number; insurance: number; tax: number; loans: number; net: number }[];
      totalGross: number;
    }>();

    for (const [reportType, typeMap] of [...byType.entries()].sort()) {
      let typeGross = 0;
      const typeMonths: typeof reportTypesMap extends Map<string, infer V> ? (V extends { months: (infer M)[] } ? M[] : never) : never = [];

      for (const [monthKey, bucket] of [...typeMap.entries()].sort()) {
        const parsedRows: ImportedPayrollMonth['rows'] = [];
        let sheetName = '';
        const files = [...bucket.winners.values()];

        for (let i = 0; i < files.length; i++) {
          try {
            const wb = new ExcelJS.Workbook();
            await wb.xlsx.load(files[i].buffer as any);
            for (const sheet of wb.worksheets) {
              if (isReferenceSheet(sheet.name)) continue;
              const matrix: any[][] = [];
              sheet.eachRow({ includeEmpty: true }, (row) => {
                const rowData: any[] = [];
                row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
                  rowData[colNumber - 1] = cell.value ?? '';
                });
                matrix.push(rowData);
              });
              const rows = parseSheetMatrix(matrix);
              if (rows.length > 0 && !sheetName) sheetName = sheet.name;
              parsedRows.push(...rows);
            }
          } catch {
            result.skippedFiles.push(`${files[i].fileName} (تعذر قراءة الملف)`);
          }
        }

        if (parsedRows.length === 0) continue;

        const sum = (fn: (r: any) => number) => Math.round(parsedRows.reduce((s, r) => s + fn(r), 0) * 100) / 100;
        const monthData: ImportedPayrollMonth = {
          reportType,
          fileName: files.map((f) => f.fileName).join(' | ').slice(0, 200),
          sheetName,
          year: bucket.year,
          month: bucket.month,
          monthLabelAr: `${MONTHS_AR_LABELS[bucket.month]} ${bucket.year}`,
          employeesCount: parsedRows.length,
          totals: {
            gross: sum((r) => r.gross),
            basic: sum((r) => r.basic),
            allowances: sum((r) => r.allowances),
            insurance: sum((r) => r.insurance),
            tax: sum((r) => r.tax),
            loans: sum((r) => r.loans),
            otherDeductions: sum((r) => r.otherDeductions || 0),
            net: sum((r) => r.net),
          },
          rows: parsedRows,
        };

        result.months.push(monthData as any);
        result.monthsFound++;
        result.totalGross += monthData.totals.gross;
        result.totalNet += monthData.totals.net;
        typeGross += monthData.totals.gross;
        typeMonths.push({
          fileName: monthData.fileName,
          monthLabelAr: monthData.monthLabelAr,
          employeesCount: monthData.employeesCount,
          gross: monthData.totals.gross,
          insurance: monthData.totals.insurance,
          tax: monthData.totals.tax,
          loans: monthData.totals.loans,
          net: monthData.totals.net,
        });
      }

      if (typeMonths.length > 0) {
        reportTypesMap.set(reportType, { label: reportType, months: typeMonths, totalGross: typeGross });
      }
    }

    result.totalGross = Math.round(result.totalGross * 100) / 100;
    result.totalNet = Math.round(result.totalNet * 100) / 100;
    result.months.sort((a: any, b: any) => a.year - b.year || a.month - b.month);

    // إرفاق ملخصات أنواع التقارير
    (result as any).reportTypes = [...reportTypesMap.entries()].map(([key, val]) => ({
      type: key,
      label: val.label,
      monthsCount: val.months.length,
      totalGross: Math.round(val.totalGross * 100) / 100,
      months: val.months,
    }));

    return result;
  }

  /** البحث الدلالي عن حساب بالكود أولاً ثم بالكلمات المفتاحية */
  private findAccount(codeOrKeywords: { code?: string; keywords: string[]; type?: string }): any | undefined {
    const active = erpStore.accounts.filter((a) => !a.isParent && a.isActive);
    if (codeOrKeywords.code) {
      const byCode = active.find((a) => a.code === codeOrKeywords.code);
      if (byCode) return byCode;
    }
    for (const kw of codeOrKeywords.keywords) {
      const found = active.find((a) => norm(a.name).includes(norm(kw)));
      if (found) return found;
    }
    if (codeOrKeywords.type) {
      return active.find((a) => a.type === codeOrKeywords.type);
    }
    return undefined;
  }

  /**
   * ضمان وجود فترة مالية مفتوحة تغطي تاريخ القيد (للاستيراد التاريخي)
   * — يعيد فتح الفترة المقفلة أو ينشئها إن لم تكن موجودة مع تدقيق الإجراء
   */
  public ensureOpenPeriod(user: User, year: number, month: number): void {
    const periodId = `fp-${year}-${String(month).padStart(2, '0')}`;
    let period = erpStore.fiscalPeriods.find((p) => p.year === year && p.periodNumber === month);
    if (!period) {
      const daysInMonth = new Date(year, month, 0).getDate();
      period = {
        id: periodId,
        year,
        periodNumber: month,
        name: `${MONTHS_AR_LABELS[month]} ${year}`,
        startDate: `${year}-${String(month).padStart(2, '0')}-01`,
        endDate: `${year}-${String(month).padStart(2, '0')}-${daysInMonth}`,
        status: 'OPEN',
      };
      erpStore.fiscalPeriods.push(period);
      erpStore.recordAudit(
        user.id, user.fullName, user.role, user.organizationId, 'FISCAL_PERIOD_AUTO_CREATED', 'FiscalPeriod', period.id,
        `إنشاء فترة مالية مفتوحة تلقائياً لاستيراد كشوف المرتبات (${period.name})`,
        undefined, { status: 'OPEN' }
      );
    } else if (period.status === 'CLOSED') {
      period.status = 'OPEN';
      period.reopenedBy = user.fullName;
      period.reopenedAt = new Date().toISOString();
      delete (period as any).closedAt;
      erpStore.recordAudit(
        user.id, user.fullName, user.role, user.organizationId, 'FISCAL_PERIOD_REOPENED', 'FiscalPeriod', period.id,
        `إعادة فتح الفترة المالية ${period.name} تلقائياً لاعتماد كشوف المرتبات المستوردة`,
        { status: 'CLOSED' }, { status: 'OPEN' }
      );
    }
  }

  /**
   * المرحلة 2: اعتماد البيانات المستوردة — ربطها بكل شاشات النظام
   */
  public commitImport(user: User, months: ImportedPayrollMonth[], year: number): any {
    if (!can(user, 'hr:manage')) throw new Error('لا تملك صلاحية استيراد المرتبات.');

    const expenseAcc = this.findAccount({ code: '5101', keywords: ['مرتب', 'أجور', 'اجور', 'رواتب'], type: 'EXPENSE' });
    const insuranceAcc = this.findAccount({ code: '2104', keywords: ['الهيئة القومية للتأمين', 'التأمين الاجتماعي', 'تأمينات اجتماعية', 'تأمين'], type: 'LIABILITY' });
    const taxAcc = this.findAccount({ code: '2105', keywords: ['ضرائب كسب العمل', 'مصلحة الضرائب', 'ضريبة'], type: 'LIABILITY' });
    const loansAcc = this.findAccount({ code: '1208', keywords: ['سلف العاملين', 'سلف مستردة', 'سلف'], type: 'ASSET' });
    // خصومات أخرى من المرتب (نفقات/أجزاء/تأمينات إضافية...) تُستحق لصالح النقابة
    const otherDedAcc =
      this.findAccount({ code: '2109', keywords: ['مستحقات أخرى', 'دائنون أخرى', 'إيرادات أخرى', 'اخرى', 'أخرى', 'اخري'] }) ||
      this.findAccount({ keywords: ['دائنون', 'مستحقات'], type: 'LIABILITY' });
    const netAcc =
      this.findAccount({ code: '2101', keywords: ['أجور مستحقة', 'اجور مستحقة', 'رواتب مستحقة', 'أجور وصرف', 'دائنون'] }) ||
      this.findAccount({ keywords: ['الخزينة', 'بنك مصر', 'بنك'], type: 'ASSET' });

    const missing: string[] = [];
    if (!expenseAcc) missing.push('حساب مصاريف الأجور');
    if (!netAcc) missing.push('حساب صرف/استحقاق المرتبات');
    if (missing.length) throw new Error(`تعذر تحديد ${missing.join(' و ')} من دليل الحسابات النشط.`);

    let journalEntriesCreated = 0;
    let advanceDeductionsApplied = 0;
    let employeesUpdated = 0;
    const createdEntryNumbers: string[] = [];
    const createdJournalEntries: any[] = [];
    const actuarialContributions = { pensions: 0, solidarity: 0 };

    for (const m of months) {
      const monthPrefix = `${m.year}-${String(m.month).padStart(2, '0')}`;

      // ضمان فترة مالية مفتوحة لشهر الكشف قبل تسجيل القيد
      this.ensureOpenPeriod(user, m.year, m.month);

      // منع ازدواجية استيراد نفس الشهر
      const exists = erpStore.journalEntries.some(
        (e) => e.sourceDocumentType === 'PAYROLL_IMPORT' && (e as any).sourceDocumentId === `IMPORT-${monthPrefix}`
      );
      if (exists) continue;

      // ===== 1) قيد الاستحقاق المحاسبي (شاشة القيود والحسابات) =====
      const lines: any[] = [
        { accountId: expenseAcc.id, debit: m.totals.gross, credit: 0, description: `إجمالي مرتبات ومكافآت ${m.monthLabelAr}` },
      ];
      if (insuranceAcc && m.totals.insurance > 0) {
        lines.push({ accountId: insuranceAcc.id, debit: 0, credit: m.totals.insurance, description: 'استقطاع الهيئة القومية للتأمين الاجتماعي' });
      }
      if (taxAcc && m.totals.tax > 0) {
        lines.push({ accountId: taxAcc.id, debit: 0, credit: m.totals.tax, description: 'استقطاع ضريبة كسب العمل' });
      }
      if (loansAcc && m.totals.loans > 0) {
        lines.push({ accountId: loansAcc.id, debit: 0, credit: m.totals.loans, description: 'استقطاع أقساط سلف العاملين' });
      }
      const otherDed = m.totals.otherDeductions || 0;
      if (otherDed > 0) {
        const target = otherDedAcc || netAcc;
        lines.push({ accountId: target.id, debit: 0, credit: otherDed, description: 'خصومات أخرى من المرتبات (نفقات/أجزاء/متفرقات)' });
      }
      const deducted = m.totals.insurance + m.totals.tax + m.totals.loans + otherDed;
      lines.push({
        accountId: netAcc.id,
        debit: 0,
        credit: Math.round((m.totals.gross - deducted) * 100) / 100,
        description: 'صافي الأجور المستحقة للصرف',
      });

      const { entry } = accountingService.createJournalEntry(
        {
          date: `${monthPrefix}-28`,
          organizationId: user.organizationId,
          description: `قيد استحقاق مرتبات شهر ${m.monthLabelAr} (${m.employeesCount} عاملاً)`,
          type: 'MANUAL',
          sourceDocumentType: 'PAYROLL_IMPORT',
          sourceDocumentId: `IMPORT-${monthPrefix}`,
          lines,
          userId: user.id,
        },
        user
      );
      journalEntriesCreated++;
      createdEntryNumbers.push(entry.entryNumber);
      createdJournalEntries.push(entry);

      // حفظ الكشف المعتمد كنموذج مرتبات رسمي (يصمد بعد إعادة التشغيل)
      const committedRecord = {
        id: `IMPORT-${monthPrefix}`,
        year: m.year,
        month: m.month,
        monthLabelAr: m.monthLabelAr,
        fileName: m.fileName,
        sheetName: m.sheetName,
        employeesCount: m.employeesCount,
        totals: { ...m.totals, otherDeductions: otherDed },
        rows: m.rows,
        entryNumber: entry.entryNumber,
        status: 'COMMITTED',
        committedAt: new Date().toISOString(),
        committedBy: user.fullName,
      };
      erpStore.payrollImports.push(committedRecord);
      this.persistImport(committedRecord);

      // ===== 2) شئون العاملين: مطابقة الأسماء وتحديث الأجر الفعلي =====
      for (const row of m.rows) {
        const emp = erpStore.employees.find((e) => {
          const en = norm(e.fullName);
          const rn = norm(row.name);
          return en === rn || en.includes(rn) || rn.includes(en.replace(/^(م\.|د\.)\s*/, ''));
        });
        if (emp && row.gross > 0 && emp.totalSalary !== row.gross) {
          emp.totalSalary = row.gross;
          employeesUpdated++;
        }
      }

      // ===== 3) سلف العاملين: تسجيل أقساط الاستقطاع على العاملين المطابقين =====
      if (m.totals.loans > 0) {
        for (const row of m.rows) {
          if (row.loans <= 0) continue;
          const emp = erpStore.employees.find((e) => norm(e.fullName) === norm(row.name)) ||
            erpStore.employees.find((e) => norm(e.fullName).includes(norm(row.name)));
          const adv = emp
            ? erpStore.employeeAdvances.find((a) => a.employeeId === emp.id && a.status === 'ACTIVE')
            : undefined;
          if (adv) {
            const due = Math.min(row.loans, adv.amount - adv.paidAmount);
            if (due > 0.001) {
              adv.payments.push({
                id: `pay-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
                amount: due,
                date: `${monthPrefix}-28`,
                method: 'PAYROLL_DEDUCTION',
                notes: `استقطاع بكشف ${m.monthLabelAr} (استيراد أرشيف 2024)`,
                recordedBy: user.fullName,
              });
              adv.paidAmount += due;
              if (adv.paidAmount >= adv.amount - 0.001) adv.status = 'SETTLED';
              advanceDeductionsApplied++;
            }
          }
        }
      }

      // ===== 4) الدراسات الإكتوارية: حصص اشتراك الصناديق من الأجور =====
      // (نسبة تقديرية معتمدة بصناديق النقابة: معاشات 15% + تكافل 1% من الأجور التأمينية)
      const insBase = m.totals.gross;
      actuarialContributions.pensions += Math.round(insBase * 0.15 * 100) / 100;
      actuarialContributions.solidarity += Math.round(insBase * 0.01 * 100) / 100;

      erpStore.recordAudit(
        user.id,
        user.fullName,
        user.role,
        user.organizationId,
        'PAYROLL_IMPORT_MONTH_COMMITTED',
        'PayrollImport',
        `IMPORT-${monthPrefix}`,
        `اعتماد كشف مرتبات ${m.monthLabelAr}: ${m.employeesCount} عاملاً بإجمالي ${m.totals.gross.toLocaleString()} ج.م وصافي ${(m.totals.gross - deducted).toLocaleString()} ج.م — قيد [${entry.entryNumber}]`,
        undefined,
        { month: monthPrefix, totals: m.totals, entryNumber: entry.entryNumber }
      );
    }

    // ===== 5) الموازنة التقديرية: انحراف الأجور الفعلية مقابل الموازنة المعتمدة =====
    const importedTotal = Math.round(months.reduce((s, m) => s + m.totals.gross, 0) * 100) / 100;
    const salaryBudget = erpStore.budgets.find(
      (b) => b.year === year && (norm(b.title).includes('مرتب') || norm(b.title).includes('أجور') || norm(b.title).includes('اجور'))
    ) || erpStore.budgets.find((b) => b.year === year);
    const budgetVariance = salaryBudget
      ? {
          budgetTitle: salaryBudget.title,
          budgetAllocated: salaryBudget.totalAllocated,
          actualPayroll: importedTotal,
          variance: Math.round((salaryBudget.totalAllocated - importedTotal) * 100) / 100,
          variancePercent: salaryBudget.totalAllocated > 0
            ? Math.round(((salaryBudget.totalAllocated - importedTotal) / salaryBudget.totalAllocated) * 10000) / 100
            : null,
        }
      : null;

    erpStore.recordAudit(
      user.id,
      user.fullName,
      user.role,
      user.organizationId,
      'PAYROLL_ARCHIVE_IMPORTED',
      'PayrollImport',
      `ARCHIVE-${year}`,
      `ربط أرشيف مرتبات ${year}: ${months.length} شهراً بإجمالي ${importedTotal.toLocaleString()} ج.م — ${journalEntriesCreated} قيداً محاسبياً و${advanceDeductionsApplied} قسط سلفة و${employeesUpdated} أجراً محدثاً`,
      undefined,
      { year, monthsCount: months.length, importedTotal, journalEntriesCreated }
    );

    erpStore.addNotification({
      title: 'ربط أرشيف مرتبات بنظام ERP',
      message: `تم ربط ${months.length} كشف مرتبات (${year}) بقيمة ${importedTotal.toLocaleString()} ج.م وإنشاء ${journalEntriesCreated} قيداً محاسبياً.`,
      type: 'HR_ALERT',
      severity: 'SUCCESS',
      targetRole: 'ALL',
      organizationId: user.organizationId,
      actionTab: 'payroll',
      entityId: `ARCHIVE-${year}`,
    });

    return {
      success: true,
      message: `تم ربط أرشيف مرتبات ${year} بنجاح مع كافة شاشات النظام.`,
      monthsCommitted: months.length,
      journalEntriesCreated,
      createdEntryNumbers,
      createdJournalEntries,
      advanceDeductionsApplied,
      employeesSalaryUpdated: employeesUpdated,
      actuarialContributions,
      budgetVariance,
      importedTotalGross: importedTotal,
    };
  }
}

export const payrollImportService = new PayrollImportService();
