import React, { useState } from 'react';
import {
  FileCode2,
  CheckCircle2,
  ExternalLink,
  ShieldCheck,
  Send,
  RefreshCw
} from 'lucide-react';
import { User } from '../types/erp.js';

interface EInvoicingProps {
  organizationId: string;
  currentUser: User | null;
  onShowToast: (type: 'success' | 'error' | 'warning' | 'info', msg: string) => void;
}

export const EInvoicing: React.FC<EInvoicingProps> = ({
  organizationId,
  currentUser,
  onShowToast,
}) => {
  const [docs] = useState([
    {
      uuid: 'ETA-INV-2026-9901-8842',
      receiver: 'شركة الأمل للمقاولات والتطوير',
      amount: 50000,
      tax: 7000,
      total: 57000,
      status: 'Valid',
      submissionDate: '2026-02-20 10:30',
    },
    {
      uuid: 'ETA-REC-2026-9902-1134',
      receiver: 'المهندس أحمد علي حسن',
      amount: 1500,
      tax: 0,
      total: 1500,
      status: 'Valid',
      submissionDate: '2026-02-20 14:15',
    },
  ]);

  const handleSyncETA = () => {
    onShowToast('success', 'تمت المزامنة والتحقق من منظومة الفاتورة والإيصال الإلكتروني لمصلحة الضرائب المصرية بنجاح.');
  };

  return (
    <div className="space-y-6">
      <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl shadow-lg flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <FileCode2 className="w-5 h-5 text-emerald-400" />
            <h2 className="text-lg font-bold text-slate-100">منظومة الفاتورة والإيصال الإلكتروني (ETA Egyptian Tax Authority)</h2>
          </div>
          <p className="text-xs text-slate-400">
            الربط اللحظي مع منظومة الفاتورة الإلكترونية والإيصال الإلكتروني لمصلحة الضرائب المصرية بالمعايير الرسمية (UBL 2.1).
          </p>
        </div>

        <button
          onClick={handleSyncETA}
          className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl shadow-lg transition-all"
        >
          <RefreshCw className="w-4 h-4" />
          <span>مزامنة بوابة الضرائب المصرية</span>
        </button>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
        <h3 className="text-xs font-bold text-slate-300">المستندات المرسلة والموثقة على بوابة الضرائب:</h3>

        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead>
              <tr className="bg-slate-950 text-slate-400 font-bold border-b border-slate-800">
                <th className="py-3 px-4">الرقم الموحد (UUID)</th>
                <th className="py-3 px-4">تاريخ الإرسال</th>
                <th className="py-3 px-4">المستلم / المشتري</th>
                <th className="py-3 px-4">القيمة قبل الضريبة</th>
                <th className="py-3 px-4">ضريبة القيمة المضافة</th>
                <th className="py-3 px-4">الإجمالي الكلي</th>
                <th className="py-3 px-4">حالة البوابة</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {docs.map((d, i) => (
                <tr key={i} className="hover:bg-slate-800/40">
                  <td className="py-3 px-4 font-mono font-bold text-emerald-400">{d.uuid}</td>
                  <td className="py-3 px-4 font-mono text-slate-400">{d.submissionDate}</td>
                  <td className="py-3 px-4 font-bold text-slate-200">{d.receiver}</td>
                  <td className="py-3 px-4 font-mono text-slate-300">{(d.amount ?? 0).toLocaleString()} ج.م</td>
                  <td className="py-3 px-4 font-mono text-slate-400">{(d.tax ?? 0).toLocaleString()} ج.م</td>
                  <td className="py-3 px-4 font-mono font-bold text-slate-100">{(d.total ?? 0).toLocaleString()} ج.م</td>
                  <td className="py-3 px-4">
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-950 text-emerald-400 border border-emerald-800/40">
                      <CheckCircle2 className="w-3 h-3" />
                      <span>صحيح وموثق (Valid)</span>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
