import { Request, Response } from 'express';
import ExcelJS from 'exceljs';
import { erpStore } from '../db/store.js';
import { aiService } from '../services/ai.service.js';

/**
 * ===== تصدير التقارير المالية بصيغة Excel منسّقة (وضعية موحدة للنقابة) =====
 * - تقرير المخاطر (خريطة المخاطر المالية): الشذوذ المالي + ملخص التنبؤ
 * - تقرير ميزان/قيود: أحدث القيود المحاسبية
 * - تقرير الموازنة الحكومية: بنود الأبواب والمجاميع
 * الملف يحمل اسم الملف بصيغة موحدة: Union_Financial_{type}_{yyyy-MM-dd}.xlsx
 */
export function registerReportExportRoutes(app: any): void {
  app.get('/api/reports/export/risk', async (req: Request, res: Response) => {
    try {
      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'Union ERP';
      workbook.created = new Date();

      // ===== ورقة 1: ملخص المخاطر المالية (Risk Heatmap Summary) =====
      const riskSheet = workbook.addWorksheet('تقرير المخاطر المالية', { views: [{ state: 'frozen', ySplit: 1 }] });

      riskSheet.columns = [
        { header: 'رقم القيد', key: 'entryNumber', width: 16 },
        { header: 'التاريخ', key: 'date', width: 14 },
        { header: 'النوع', key: 'type', width: 26 },
        { header: 'مستوى الخطورة', key: 'riskLevel', width: 12 },
        { header: 'درجة الخطورة %', key: 'riskScore', width: 12 },
        { header: 'المبلغ (ج.م)', key: 'amount', width: 18 },
        { header: 'الوصف', key: 'title', width: 45 },
        { header: 'التوصية', key: 'recommendation', width: 50 },
      ];

      const anomalies = await aiService.detectAnomaliesAndFraud();
      anomalies.forEach((a) => {
        riskSheet.addRow({
          entryNumber: a.entryNumber,
          date: a.date,
          type: a.anomalyType.replace(/_/g, ' '),
          riskLevel: a.riskLevel,
          riskScore: a.riskScore,
          amount: a.amount,
          title: a.title,
          recommendation: a.recommendation,
        });
      });

      riskSheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
      riskSheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };
      riskSheet.eachRow((row, rowNumber) => {
        row.alignment = { vertical: 'middle', wrapText: true };
        if (rowNumber > 1) {
          const level = row.getCell(4).value as string;
          const fill =
            level === 'HIGH' ? { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FF7F1D1D' } }
            : level === 'MEDIUM' ? { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FF78350F' } }
            : { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FF14532D' } };
          row.getCell(4).fill = fill;
          row.getCell(4).font = { color: { argb: 'FFFFFFFF' }, bold: true };
        }
      });

      // ===== ورقة 2: بيانات السيولة والتنبؤ المالي =====
      const fcSheet = workbook.addWorksheet('التنبؤ المالي', { views: [{ state: 'frozen', ySplit: 1 }] });
      fcSheet.columns = [
        { header: 'الشهر', key: 'month', width: 16 },
        { header: 'الإيرادات المتوقعة', key: 'revenue', width: 20 },
        { header: 'المصروفات المتوقعة', key: 'expense', width: 20 },
        { header: 'صافي التدفق', key: 'net', width: 18 },
        { header: 'الرصيد التراكمي', key: 'cumulative', width: 22 },
      ];
      try {
        const forecast = await aiService.generateFinancialForecast(6);
        forecast.monthlyProjections.forEach((p) => {
          fcSheet.addRow({
            month: p.month,
            revenue: p.projectedRevenue,
            expense: p.projectedExpense,
            net: p.projectedNetCashFlow,
            cumulative: p.cumulativeCashBalance,
          });
        });
      } catch (err) {
        fcSheet.addRow({ month: '—', revenue: 'غير متاح', expense: '', net: '', cumulative: '' });
      }
      fcSheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
      fcSheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };

      // ===== ورقة 3: الموازنة الحكومية (بنود الأبواب) =====
      const govSheet = workbook.addWorksheet('موازنة حكومية', { views: [{ state: 'frozen', ySplit: 1 }] });
      govSheet.columns = [
        { header: 'الكود', key: 'code', width: 18 },
        { header: 'الاسم', key: 'name', width: 40 },
        { header: 'المستوى', key: 'level', width: 12 },
        { header: 'التصنيف', key: 'category', width: 14 },
        { header: 'الحد/الاعتماد (ج.م)', key: 'budget', width: 20 },
        { header: 'الصرف الفعلي (ج.م)', key: 'spent', width: 20 },
        { header: 'الحساب المحاسبي', key: 'account', width: 16 },
      ];
      erpStore.governmentAccounts.forEach((g) => {
        govSheet.addRow({
          code: g.code,
          name: g.name,
          level: g.level,
          category: g.category,
          budget: g.budgetLimit ?? 0,
          spent: g.actualSpent ?? 0,
          account: g.mappedAccountCode ?? '',
        });
      });
      govSheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
      govSheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };

      const fileName = `Union_Financial_Risk_${new Date().toISOString().split('T')[0]}.xlsx`;
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
      await workbook.xlsx.write(res);
      res.end();
    } catch (err: any) {
      console.error('Export risk report error:', err);
      res.status(500).json({ error: 'تعذر إنشاء ملف التقرير المالي: ' + err.message });
    }
  });
}
