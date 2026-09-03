import { erpStore } from '../db/store.js';
import { reportsService } from './reports.service.js';
import { accountingService } from './accounting.service.js';
import { maskNationalId, hashNationalId } from '../utils/crypto.js';
import type { User } from '../../src/types/erp.js';

/**
 * ===== IMPROVEMENTS.md 8.1: API للتكامل مع الأنظمة الأخرى =====
 * IntegrationAPI:
 * - استيراد البيانات من أنظمة خارجية مع validation + mapping + إنشاء القيود
 * - تصدير التقارير بصيغ JSON / CSV / Excel(CSV)
 */

export type ExternalSourceType = 'JSON' | 'CSV_LIKE' | 'ERP_IMPORT';

export interface ImportResult {
  source: ExternalSourceType;
  entityType: string;
  received: number;
  imported: number;
  skipped: number;
  errors: { row: number; message: string }[];
  message: string;
}

export class IntegrationAPI {
  /**
   * استيراد البيانات من الأنظمة الأخرى: تحقق ثم مطابقة ثم إنشاء
   */
  public importFromExternalSystem(
    source: ExternalSourceType,
    entityType: 'ACCOUNTS' | 'MEMBERS' | 'SUBLEDGER_1301' | 'JOURNAL_ENTRIES',
    rows: any[],
    user: User
  ): ImportResult {
    const result: ImportResult = {
      source,
      entityType,
      received: rows?.length || 0,
      imported: 0,
      skipped: 0,
      errors: [],
      message: '',
    };

    if (!Array.isArray(rows) || rows.length === 0) {
      result.message = 'لا توجد صفوف للاستيراد.';
      return result;
    }

    rows.forEach((row, idx) => {
      const rowNum = idx + 1;
      try {
        if (entityType === 'ACCOUNTS') {
          if (!row.code || !row.name) throw new Error('كود واسم الحساب مطلوبان');
          if (erpStore.accounts.some((a) => a.code === String(row.code))) {
            result.skipped++;
            return;
          }
          erpStore.accounts.push({
            id: `acc-${row.code}`,
            code: String(row.code),
            name: String(row.name),
            type: row.type || 'EXPENSE',
            nature: row.nature || 'DEBIT',
            level: Number(row.level) || 3,
            isParent: false,
            isActive: true,
            requiresSubledger: String(row.code) === '1301' || String(row.code) === '2101',
            subledgerType: String(row.code) === '1301' ? 'MISC_DEBTOR' : 'NONE',
            currentBalance: Number(row.openingDebit || 0) - Number(row.openingCredit || 0),
          });
          result.imported++;
        } else if (entityType === 'MEMBERS') {
          if (!row.fullName) throw new Error('اسم العضو مطلوب');
          const nHash = row.nationalId ? hashNationalId(String(row.nationalId)) : null;
          if (nHash && erpStore.members.some((m) => m.nationalIdHash === nHash)) {
            result.skipped++;
            return;
          }
          erpStore.members.push({
            id: `mem-${Date.now()}-${idx}`,
            membershipNumber: row.membershipNumber || `MEM-EXT-${Date.now().toString().slice(-6)}${idx}`,
            fullName: String(row.fullName),
            nationalIdMasked: row.nationalId ? maskNationalId(String(row.nationalId)) : '———******——',
            nationalIdHash: nHash || 'ext-import',
            syndicateCommitteeId: row.organizationId || user.organizationId,
            syndicateCommitteeName: 'استيراد خارجي',
            profession: row.profession,
            companyName: row.companyName,
            status: 'ACTIVE',
            joinDate: row.joinDate || new Date().toISOString().split('T')[0],
            phone: row.phone || '',
            email: row.email || '',
          });
          result.imported++;
        } else if (entityType === 'SUBLEDGER_1301') {
          if (!row.name) throw new Error('اسم الجهة مطلوب');
          accountingService.findOrCreateSubledgerParty(String(row.name), 'acc-1301', user.organizationId, user);
          result.imported++;
        } else if (entityType === 'JOURNAL_ENTRIES') {
          if (!row.lines || !Array.isArray(row.lines) || row.lines.length < 2) {
            throw new Error('القيد يجب أن يحتوي طرفين على الأقل');
          }
          accountingService.createJournalEntry(
            {
              date: row.date,
              organizationId: row.organizationId || user.organizationId,
              description: row.description || 'قيد مستورد من نظام خارجي',
              type: 'MANUAL',
              sourceDocumentType: 'EXTERNAL_IMPORT',
              sourceDocumentId: row.referenceId,
              lines: row.lines,
              userId: user.id,
            },
            user
          );
          result.imported++;
        }
      } catch (err: any) {
        result.errors.push({ row: rowNum, message: err?.message || 'خطأ غير معروف' });
      }
    });

    erpStore.recordAudit(
      user.id,
      user.fullName,
      user.role,
      user.organizationId,
      'EXTERNAL_IMPORT_EXECUTED',
      entityType,
      source,
      `استيراد من مصدر خارجي [${source}] لنوع [${entityType}]: نجح ${result.imported} / تجاوز ${result.skipped} / فشل ${result.errors.length}`
    );

    result.message = `تم استيراد ${result.imported} سجلاً بنجاح (${result.skipped} مكرر تم تجاوزه، ${result.errors.length} فاشل).`;
    return result;
  }

  /**
   * تصدير التقارير بصيغ متعددة
   */
  public async exportReport(
    reportType: 'trial-balance' | 'income-expense' | 'journal-entries' | 'subledger-1301',
    format: 'JSON' | 'CSV' | 'Excel',
    organizationId?: string
  ): Promise<{ format: string; fileName: string; contentType: string; payload: string }> {
    let data: any;
    let fileNamePrefix = reportType;

    switch (reportType) {
      case 'trial-balance':
        data = reportsService.getTrialBalance({ organizationId });
        break;
      case 'income-expense':
        data = reportsService.getIncomeExpenseReport({ organizationId });
        break;
      case 'journal-entries':
        data = erpStore.journalEntries.filter((e) => !organizationId || e.organizationId === organizationId);
        break;
      case 'subledger-1301':
        data = erpStore.subledgerParties.filter((p) => p.associatedAccountId === 'acc-1301');
        break;
    }

    const timestamp = new Date().toISOString().split('T')[0];

    if (format === 'JSON') {
      return {
        format,
        fileName: `${fileNamePrefix}-${timestamp}.json`,
        contentType: 'application/json; charset=utf-8',
        payload: JSON.stringify(data, null, 2),
      };
    }

    // CSV / Excel (بصيغة CSV متوافقة مع Excel مع BOM للعربية)
    const csv = this.toCsv(data);
    return {
      format,
      fileName: `${fileNamePrefix}-${timestamp}.csv`,
      contentType: 'text/csv; charset=utf-8',
      payload: '\uFEFF' + csv,
    };
  }

  /** تسطيح الكائنات إلى CSV (صفين: رؤوس ثم قيم) */
  private toCsv(data: any): string {
    const rows = Array.isArray(data) ? data : [data];
    if (rows.length === 0) return '';

    const headers = new Set<string>();
    const flatRows = rows.map((row: any) => this.flatten(row));
    flatRows.forEach((r: any) => Object.keys(r).forEach((k) => headers.add(k)));

    const headerArr = [...headers].filter((h) => !h.endsWith('Id') || h === 'id');
    const escape = (v: any) => {
      const s = v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };

    const lines = [headerArr.join(',')];
    for (const r of flatRows) {
      lines.push(headerArr.map((h) => escape(r[h])).join(','));
    }
    return lines.join('\n');
  }

  private flatten(obj: any, prefix = ''): Record<string, any> {
    const out: Record<string, any> = {};
    for (const [key, value] of Object.entries(obj || {})) {
      const name = prefix ? `${prefix}.${key}` : key;
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        Object.assign(out, this.flatten(value, name));
      } else {
        out[name] = Array.isArray(value) ? `${value.length} عنصر` : value;
      }
    }
    return out;
  }
}

export const integrationAPI = new IntegrationAPI();
