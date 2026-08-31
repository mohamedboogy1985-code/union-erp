import React, { useState } from 'react';
import {
  ShoppingCart,
  PlusCircle,
  CheckCircle2,
  Clock,
  FileCheck,
  Building,
  DollarSign
} from 'lucide-react';
import { User } from '../types/erp.js';

interface ProcurementProps {
  organizationId: string;
  currentUser: User | null;
  onShowToast: (type: 'success' | 'error' | 'warning' | 'info', msg: string) => void;
}

export const Procurement: React.FC<ProcurementProps> = ({
  organizationId,
  currentUser,
  onShowToast,
}) => {
  const [requests] = useState([
    {
      id: 'pr-1',
      requestNumber: 'PR-2026-0041',
      title: 'توريد أجهزة حاسب آلي وتجهيزات مركز تدريب النقابة',
      vendorName: 'مكتب الأهرام للتوريدات الهندسية',
      estimatedAmount: 75000,
      status: 'APPROVED',
      date: '2026-02-15',
    },
    {
      id: 'pr-2',
      requestNumber: 'PR-2026-0042',
      title: 'أدوات كتابية ومطبوعات لجان المحافظات',
      vendorName: 'مكتبة ومطابع دار الشعب',
      estimatedAmount: 22000,
      status: 'MATCHED_3WAY',
      date: '2026-02-18',
    },
  ]);

  return (
    <div className="space-y-6">
      <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl shadow-lg flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <ShoppingCart className="w-5 h-5 text-emerald-400" />
            <h2 className="text-lg font-bold text-slate-100">المشتريات وإدارة أوامر التوريد (P2P)</h2>
          </div>
          <p className="text-xs text-slate-400">
            دورة الشراء، طلبات عروض الأسعار، وأوامر التوريد والمطابقة الثلاثية (3-Way Matching).
          </p>
        </div>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
        <h3 className="text-xs font-bold text-slate-300">أوامر التوريد وطلبات الشراء النشطة:</h3>

        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead>
              <tr className="bg-slate-950 text-slate-400 font-bold border-b border-slate-800">
                <th className="py-3 px-4">رقم الطلب</th>
                <th className="py-3 px-4">التاريخ</th>
                <th className="py-3 px-4">الموضوع / البنود</th>
                <th className="py-3 px-4">المورد / المقاول</th>
                <th className="py-3 px-4">القيمة التقديرية</th>
                <th className="py-3 px-4">حالة المطابقة</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {requests.map((r) => (
                <tr key={r.id} className="hover:bg-slate-800/40">
                  <td className="py-3 px-4 font-mono font-bold text-slate-200">{r.requestNumber}</td>
                  <td className="py-3 px-4 font-mono text-slate-400">{r.date}</td>
                  <td className="py-3 px-4 font-bold text-slate-100">{r.title}</td>
                  <td className="py-3 px-4 text-amber-300 font-medium">{r.vendorName}</td>
                  <td className="py-3 px-4 font-mono font-bold text-slate-100">{(r.estimatedAmount ?? 0).toLocaleString()} ج.م</td>
                  <td className="py-3 px-4">
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-950 text-emerald-400 border border-emerald-800/40">
                      <CheckCircle2 className="w-3 h-3" />
                      <span>مطابقة ثلاثية معتمدة</span>
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
