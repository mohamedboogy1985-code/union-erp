import { ImportValidationResult } from '../types/erp.js';
import { api } from './api.js';

export class DataImportExportService {
  /**
   * Generates downloadable CSV template with Arabic BOM for Excel
   */
  public getSampleTemplate(entityType: string): { filename: string; content: string } {
    const bom = '\uFEFF';
    if (entityType === 'ACCOUNTS') {
      const csv = `كود_الحساب,اسم_الحساب,النوع,التصنيف,الطبيعة,المستوى,رصيد_افتتاحي_مدين,رصيد_افتتاحي_دائن
1103,خزينة فرعية - الإسكندرية,ASSET,CURRENT_ASSET,DEBIT,3,50000,0
5105,مصروفات ضيافة واستقبال,EXPENSE,GENERAL_EXPENSE,DEBIT,3,0,0
4105,إيرادات تأجير قاعات النقابة,REVENUE,OPERATING_REVENUE,CREDIT,3,0,0`;
      return { filename: 'نموذج_استيراد_دليل_الحسابات.csv', content: bom + csv };
    } else if (entityType === 'SUBLEDGER_1301') {
      const csv = `اسم_الجهة_أو_المدين,الرقم_الضريبي,رقم_الهاتف,النوع,ملاحظات
شركة النيل للاستشارات الهندسية,109-882-771,01012345678,VENDOR,توريد استشارات
مهندس استشاري خالد الفقي,301-229-444,01234567890,DEBTOR_MEMBER,مستحقات تدريب
مؤسسة الأهرام للصحافة والإعلان,200-112-990,0225789000,VENDOR,نشر إعلانات`;
      return { filename: 'نموذج_استيراد_أستاذ_مساعد_1301.csv', content: bom + csv };
    } else if (entityType === 'MEMBERS') {
      const csv = `رقم_القيد,الاسم_الرباعي,الرقم_القومي,المهنة,اللجنة_النقابية,رقم_الهاتف,البريد_الإلكتروني,رصيد_الاشتراك_السنوي
MEM-9011,م. طارق يحيى عبد العزيز,29001010101234,مهندس معماري,لجنة المهندسين,01099887766,tarek@gmail.com,1200
MEM-9012,د. منى عبد الرحمن إبراهيم,29505050109876,طبيبة استشارية,اللجنة الطبية,01122334455,mona@gmail.com,1500
MEM-9013,أ. إسلام محمد علي الشناوي,28812120104567,محاسب قانوني,لجنة المحاسبين,01288997700,islam@gmail.com,1000`;
      return { filename: 'نموذج_استيراد_سجل_الأعضاء.csv', content: bom + csv };
    }

    return { filename: 'نموذج_بيانات.csv', content: bom + 'الاسم,المبلغ,ملاحظات\n' };
  }

  /**
   * Parse CSV/TSV plain text into structured array of objects
   */
  public parseCSVText(rawText: string, entityType: string): any[] {
    const lines = rawText.trim().split(/\r?\n/);
    if (lines.length < 2) return [];

    // Header line
    const headerLine = lines[0].replace(/^\uFEFF/, '');
    const delimiter = headerLine.includes('\t') ? '\t' : ',';
    const headers = headerLine.split(delimiter).map((h) => h.trim().replace(/^["']|["']$/g, ''));

    const rows: any[] = [];

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const cells = line.split(delimiter).map((c) => c.trim().replace(/^["']|["']$/g, ''));
      const obj: any = {};

      if (entityType === 'ACCOUNTS') {
        obj.code = cells[0] || '';
        obj.name = cells[1] || '';
        obj.type = cells[2] || 'EXPENSE';
        obj.category = cells[3] || 'GENERAL_EXPENSE';
        obj.nature = cells[4] || 'DEBIT';
        obj.level = cells[5] || 3;
        obj.openingDebit = Number(cells[6]) || 0;
        obj.openingCredit = Number(cells[7]) || 0;
      } else if (entityType === 'SUBLEDGER_1301') {
        obj.name = cells[0] || '';
        obj.taxNumber = cells[1] || '';
        obj.phone = cells[2] || '';
        obj.type = cells[3] || 'DEBTOR';
        obj.notes = cells[4] || '';
      } else if (entityType === 'MEMBERS') {
        obj.membershipNumber = cells[0] || '';
        obj.fullName = cells[1] || '';
        obj.nationalId = cells[2] || '';
        obj.profession = cells[3] || '';
        obj.committee = cells[4] || '';
        obj.phone = cells[5] || '';
        obj.email = cells[6] || '';
        obj.subscriptionBalance = Number(cells[7]) || 0;
      } else {
        headers.forEach((h, idx) => {
          obj[h] = cells[idx] || '';
        });
      }

      rows.push(obj);
    }

    return rows;
  }

  /**
   * Export table dataset to downloadable CSV
   */
  public exportToCSV(filename: string, headers: string[], rows: any[][]) {
    const bom = '\uFEFF';
    const csvContent = [headers.join(','), ...rows.map((r) => r.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(','))].join('\n');

    const blob = new Blob([bom + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
}

export const dataImportExport = new DataImportExportService();
