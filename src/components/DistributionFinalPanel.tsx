import React, { useState } from 'react';
import { Percent, Building2, Table2, FileSpreadsheet, Info, AlertCircle, CheckCircle2 } from 'lucide-react';
import type { DistributionDocumentView } from '../types/erp.distribution.js';

interface DistributionFinalPanelProps {
  data: DistributionDocumentView | null;
}

const egp = (value: number) => value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const int = (value: number) => value.toLocaleString('en-US', { maximumFractionDigits: 0 });

/**
 * لوحة «نسب التوزيع المعتمدة» — بيانات ملفَي المستخدم الرسميين:
 * «نسب توزيع اللجان المهنية نهائى.csv» + «المكاتب ايرادات ومصروفات.csv»
 * تُعرض كما هي بلا تعديل، وكل رقم معروض يحمل مصدره وبصمة ملفه.
 */
export const DistributionFinalPanel: React.FC<DistributionFinalPanelProps> = ({ data }) => {
  const [view, setView] = useState<'committees' | 'offices'>('committees');

  if (!data) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 text-xs text-slate-400">
        جارٍ تحميل نموذج نسب التوزيع المعتمد...
      </div>
    );
  }

  const { document: doc, percentages, committees, committeeTotals, offices, officeTotals, openItems } = data;
  const diffKeys = Object.keys(doc.provenance.printedTotalsDiffs ?? {});

  return (
    <div className="space-y-4" data-assistant-screen="distribution-final">
      <div className="rounded-xl border border-amber-800/50 bg-amber-950/30 px-4 py-3 text-[11px] leading-6 text-amber-100">
        هذا عرض لملف CSV مرجعي مستقل كما وردت بياناته؛ لا يمثّل تفسيراً للمادة (2)، ولا يغيّر سياسة الإيصالات التشغيلية المعتمدة.
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-md space-y-4">
          <div className="flex items-center gap-2">
            <Percent className="w-4 h-4 text-teal-400" />
            <h3 className="text-xs font-bold text-slate-200">{doc.titleAr}</h3>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-slate-400">{doc.periodAr}</span>
            <span className="text-[10px] text-teal-300 font-bold bg-teal-950/60 px-2 py-0.5 rounded border border-teal-800/40">
              {doc.statusAr}
            </span>
          </div>

        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-3">
          {percentages.map((item) => (
            <div key={item.id} className="rounded-xl border border-slate-800 bg-slate-950 p-3">
              <div className="text-[11px] text-slate-300 font-bold">{item.labelAr}</div>
              <div className="mt-1 flex items-baseline gap-1.5">
                <span className="text-xl font-bold text-emerald-300 font-mono">%{item.percent}</span>
                <span className="text-[10px] text-slate-500">{item.basisAr}</span>
              </div>
              <div className="mt-1 text-[10px] text-slate-500">
                المستفيد: {item.beneficiaryAr} • القيد:{' '}
                <span className="font-mono text-slate-400">{item.accountCode}</span>
                {item.accountNameAr ? <span className="text-slate-500"> ({item.accountNameAr})</span> : null}
              </div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 border-t border-slate-800 pt-3 text-[11px]">
          <div>
            <span className="text-slate-500 block">إجمالي التحصيل</span>
            <span className="font-mono text-slate-100">{egp(committeeTotals.totalCollected)} ج.م</span>
          </div>
          <div>
            <span className="text-slate-500 block">الاشتراكات</span>
            <span className="font-mono text-slate-100">{egp(committeeTotals.subscriptions)} ج.م</span>
          </div>
          <div>
            <span className="text-slate-500 block">حصة النقابة العامة 30%</span>
            <span className="font-mono text-emerald-300">{egp(committeeTotals.generalShare30)} ج.م</span>
          </div>
          <div>
            <span className="text-slate-500 block">دعم التثقيف (كامل)</span>
            <span className="font-mono text-emerald-300">{egp(committeeTotals.educationSupportFull)} ج.م</span>
          </div>
          <div>
            <span className="text-slate-500 block">مطبوعات 10%</span>
            <span className="font-mono text-sky-300">{egp(committeeTotals.printingShare10)} ج.م</span>
          </div>
          <div>
            <span className="text-slate-500 block">حصة الاتحاد العام 10%</span>
            <span className="font-mono text-sky-300">{egp(committeeTotals.federationShare10)} ج.م</span>
          </div>
          <div>
            <span className="text-slate-500 block">عدد الإيصالات المستلمة</span>
            <span className="font-mono text-slate-100">{int(committeeTotals.receiptsCount)}</span>
          </div>
          <div>
            <span className="text-slate-500 block">حصة اللجنة</span>
            <span className="font-mono text-amber-300">{egp(committeeTotals.committeeShare)} ج.م</span>
          </div>
          <div>
            <span className="text-slate-500 block">الإجمالي</span>
            <span className="font-mono text-slate-100">{egp(committeeTotals.rowTotal)} ج.م</span>
          </div>
          <div className="col-span-2 md:col-span-3 lg:col-span-3">
            <span className="text-slate-500 block">التفقيط</span>
            <span className="text-slate-300">{doc.provenance.tafqeetAr}</span>
          </div>
        </div>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="flex flex-wrap items-center justify-between gap-3 p-4 border-b border-slate-800">
          <div className="flex items-center gap-2">
            {view === 'committees' ? (
              <Table2 className="w-4 h-4 text-teal-400" />
            ) : (
              <Building2 className="w-4 h-4 text-teal-400" />
            )}
            <h3 className="text-xs font-bold text-slate-200">
              {view === 'committees'
                ? `اللجان النقابية المهنية (${doc.stats.committees} لجنة — منها ${doc.stats.committeesWithMovement} بتحصيل)`
                : `مكاتب شئون العضوية (${doc.stats.offices} مكتباً — إيرادات ومصروفات)`}
            </h3>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setView('committees')}
              className={`px-3 py-1.5 rounded-lg text-[11px] font-bold ${view === 'committees' ? 'bg-teal-600 text-white' : 'bg-slate-950 text-slate-400 border border-slate-800'}`}
            >
              نسب التوزيع — اللجان المهنية
            </button>
            <button
              onClick={() => setView('offices')}
              className={`px-3 py-1.5 rounded-lg text-[11px] font-bold ${view === 'offices' ? 'bg-teal-600 text-white' : 'bg-slate-950 text-slate-400 border border-slate-800'}`}
            >
              مكاتب شئون العضوية
            </button>
          </div>
        </div>

        {view === 'committees' ? (
          <div className="overflow-auto max-h-[30rem]">
            <table className="w-full text-[11px]">
              <thead className="bg-slate-950 text-slate-400 sticky top-0">
                <tr>
                  <th className="text-right py-2 px-2 font-medium">م</th>
                  <th className="text-right py-2 px-2 font-medium">البيان</th>
                  <th className="text-right py-2 px-2 font-medium">عدد الإيصالات</th>
                  <th className="text-right py-2 px-2 font-medium">فئة التحصيل</th>
                  <th className="text-right py-2 px-2 font-medium">إجمالي التحصيل</th>
                  <th className="text-right py-2 px-2 font-medium">دعم التثقيف</th>
                  <th className="text-right py-2 px-2 font-medium">الاشتراكات</th>
                  <th className="text-right py-2 px-2 font-medium">النقابة العامة 30%</th>
                  <th className="text-right py-2 px-2 font-medium">دعم التثقيف كامل</th>
                  <th className="text-right py-2 px-2 font-medium">مطبوعات 10%</th>
                  <th className="text-right py-2 px-2 font-medium">الاتحاد العام 10%</th>
                  <th className="text-right py-2 px-2 font-medium">حصة اللجنة</th>
                  <th className="text-right py-2 px-2 font-medium">الإجمالي</th>
                </tr>
              </thead>
              <tbody>
                {committees.map((row) => (
                  <tr key={row.seq} className={`border-t border-slate-800/70 ${row.totalCollected > 0 ? 'bg-teal-500/5' : ''}`}>
                    <td className="py-1.5 px-2 font-mono text-slate-500">{row.seq}</td>
                    <td className="py-1.5 px-2 text-slate-200">{row.nameAr}</td>
                    <td className="py-1.5 px-2 font-mono text-slate-300">{row.receiptsCount ? int(row.receiptsCount) : '—'}</td>
                    <td className="py-1.5 px-2 font-mono text-slate-300">{row.tier ?? '—'}</td>
                    <td className="py-1.5 px-2 font-mono text-slate-100">{egp(row.totalCollected)}</td>
                    <td className="py-1.5 px-2 font-mono text-slate-300">{egp(row.educationSupport)}</td>
                    <td className="py-1.5 px-2 font-mono text-slate-300">{egp(row.subscriptions)}</td>
                    <td className="py-1.5 px-2 font-mono text-emerald-300">{egp(row.generalShare30)}</td>
                    <td className="py-1.5 px-2 font-mono text-emerald-300">{egp(row.educationSupportFull)}</td>
                    <td className="py-1.5 px-2 font-mono text-sky-300">{egp(row.printingShare10)}</td>
                    <td className="py-1.5 px-2 font-mono text-sky-300">{egp(row.federationShare10)}</td>
                    <td className="py-1.5 px-2 font-mono text-amber-300">{egp(row.committeeShare)}</td>
                    <td className="py-1.5 px-2 font-mono text-slate-100">{egp(row.rowTotal)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-slate-950 text-slate-100 sticky bottom-0">
                <tr className="border-t-2 border-slate-700 font-bold">
                  <td className="py-2 px-2" colSpan={2}>الإجمالي</td>
                  <td className="py-2 px-2 font-mono">{int(committeeTotals.receiptsCount)}</td>
                  <td className="py-2 px-2">—</td>
                  <td className="py-2 px-2 font-mono">{egp(committeeTotals.totalCollected)}</td>
                  <td className="py-2 px-2 font-mono">{egp(committeeTotals.educationSupport)}</td>
                  <td className="py-2 px-2 font-mono">{egp(committeeTotals.subscriptions)}</td>
                  <td className="py-2 px-2 font-mono text-emerald-300">{egp(committeeTotals.generalShare30)}</td>
                  <td className="py-2 px-2 font-mono text-emerald-300">{egp(committeeTotals.educationSupportFull)}</td>
                  <td className="py-2 px-2 font-mono text-sky-300">{egp(committeeTotals.printingShare10)}</td>
                  <td className="py-2 px-2 font-mono text-sky-300">{egp(committeeTotals.federationShare10)}</td>
                  <td className="py-2 px-2 font-mono text-amber-300">{egp(committeeTotals.committeeShare)}</td>
                  <td className="py-2 px-2 font-mono">{egp(committeeTotals.rowTotal)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        ) : (
          <div className="overflow-auto max-h-[30rem]">
            <table className="w-full text-[11px]">
              <thead className="bg-slate-950 text-slate-400 sticky top-0">
                <tr>
                  <th className="text-right py-2 px-2 font-medium">م</th>
                  <th className="text-right py-2 px-2 font-medium">بيان مكاتب شئون العضوية</th>
                  <th className="text-right py-2 px-2 font-medium">المحافظة</th>
                  <th className="text-right py-2 px-2 font-medium">قيمة الإيصال</th>
                  <th className="text-right py-2 px-2 font-medium">أرقام الإيصالات المستلمة</th>
                  <th className="text-right py-2 px-2 font-medium">عدد الإيصالات</th>
                  <th className="text-right py-2 px-2 font-medium">إجمالي الإيرادات</th>
                  <th className="text-right py-2 px-2 font-medium">المحصل بالبنك</th>
                  <th className="text-right py-2 px-2 font-medium">المصروفات</th>
                </tr>
              </thead>
              <tbody>
                {offices.map((row) => (
                  <tr key={row.seq} className={`border-t border-slate-800/70 ${row.totalRevenue > 0 ? 'bg-teal-500/5' : ''}`}>
                    <td className="py-1.5 px-2 font-mono text-slate-500">{row.seq}</td>
                    <td className="py-1.5 px-2 text-slate-200">{row.nameAr}</td>
                    <td className="py-1.5 px-2 text-slate-400">{row.governorateAr}</td>
                    <td className="py-1.5 px-2 font-mono text-slate-300">{row.receiptValue ? egp(row.receiptValue) : '—'}</td>
                    <td className="py-1.5 px-2 text-slate-400">{row.receiptRangeAr || '—'}</td>
                    <td className="py-1.5 px-2 font-mono text-slate-300">{row.receiptsCount ? int(row.receiptsCount) : '—'}</td>
                    <td className="py-1.5 px-2 font-mono text-slate-100">{egp(row.totalRevenue)}</td>
                    <td className="py-1.5 px-2 font-mono text-slate-300">{row.collectedByBank ? egp(row.collectedByBank) : '—'}</td>
                    <td className="py-1.5 px-2 font-mono text-rose-300">{row.expenses ? egp(row.expenses) : '—'}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-slate-950 text-slate-100 sticky bottom-0">
                <tr className="border-t-2 border-slate-700 font-bold">
                  <td className="py-2 px-2" colSpan={5}>الإجمالي ({officeTotals.offices} مكتباً)</td>
                  <td className="py-2 px-2 font-mono">{int(officeTotals.receiptsCount)}</td>
                  <td className="py-2 px-2 font-mono">{egp(officeTotals.totalRevenue)}</td>
                  <td className="py-2 px-2 font-mono">{officeTotals.collectedByBank ? egp(officeTotals.collectedByBank) : '—'}</td>
                  <td className="py-2 px-2 font-mono text-rose-300">{officeTotals.expenses ? egp(officeTotals.expenses) : '—'}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        {openItems.length > 0 && (
          <div className="border-t border-slate-800 bg-amber-950/20 p-4 space-y-2" data-dist-open-items={openItems.length}>
            <div className={`flex items-center gap-2 text-[11px] font-bold ${openItems[0].status === 'RESOLVED' ? 'text-emerald-300' : 'text-amber-300'}`}>
              {openItems[0].status === 'RESOLVED' ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5" />}
              {openItems[0].status === 'RESOLVED' ? 'بند محسوم بقرارك' : 'بند معلن للمستخدم'} ({openItems.length}): {openItems[0].titleAr}
            </div>
            {openItems.map((item) => (
              <div key={item.id} className={`text-[10px] leading-5 ${item.status === 'RESOLVED' ? 'text-emerald-200/80' : 'text-amber-200/80'}`}>
                <span className="font-mono text-amber-400/80">{item.id}</span> — {item.detailAr}
                <div className="text-slate-500 mt-0.5">السند: {item.sourceAr}</div>
              </div>
            ))}
          </div>
        )}

        <div className="p-4 border-t border-slate-800 space-y-2 text-[10px] text-slate-500">
          <div className="flex items-start gap-2">
            <FileSpreadsheet className="w-3.5 h-3.5 mt-0.5 shrink-0 text-slate-500" />
            <div className="space-y-0.5">
              <div>
                ملف اللجان: <span className="text-slate-400">{doc.provenance.committeesFile}</span> •{' '}
                <span className="font-mono">{doc.provenance.committeesSha256.slice(0, 24)}…</span>
              </div>
              <div>
                ملف المكاتب: <span className="text-slate-400">{doc.provenance.officesFile}</span> •{' '}
                <span className="font-mono">{doc.provenance.officesSha256.slice(0, 24)}…</span>
              </div>
              <div>
                الأعمدة كما وردت: <span className="text-slate-400">{doc.provenance.committeesHeaderAr}</span>
              </div>
            </div>
          </div>
          {diffKeys.length > 0 && (
            <div className="flex items-start gap-2 text-amber-300/90">
              <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <div>
                فرق بين سطر الإجمالي المطبوع في الملف والإجمالي المحسوب من الصفوف:{' '}
                {diffKeys
                  .map((key) => `${key}: الملف ${doc.provenance.printedTotals[key] ?? '—'} / المحسوب ${doc.provenance.printedTotalsDiffs[key].computed}`)
                  .join(' • ')}
                {' '}— عُرض المحسوب من الصفوف، والخلية متروكة فارغة في الملف.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default DistributionFinalPanel;
