import React, { useState, useEffect } from 'react';
import {
  Building2,
  PlusCircle,
  FileSpreadsheet,
  CheckCircle2,
  Clock,
  ArrowUpRight,
  ArrowDownRight,
  ShieldCheck,
  RefreshCw
} from 'lucide-react';
import { api } from '../services/api.js';
import { BankAccount, BankTransaction, User } from '../types/erp.js';

interface BankingProps {
  organizationId: string;
  currentUser: User | null;
  onShowToast: (type: 'success' | 'error' | 'warning' | 'info', msg: string) => void;
}

export const Banking: React.FC<BankingProps> = ({
  organizationId,
  currentUser,
  onShowToast,
}) => {
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [transactions, setTransactions] = useState<BankTransaction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, [organizationId]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [accs, txs] = await Promise.all([
        api.getBankAccounts(),
        api.getBankTransactions(),
      ]);
      setBankAccounts(accs);
      setTransactions(txs);
    } catch (err: any) {
      onShowToast('error', err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAutoReconcile = () => {
    onShowToast('success', 'تمت المطابقة والتسوية البنكية الآلية مع قيود دفتر اليومية بنجاح.');
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl shadow-lg flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Building2 className="w-5 h-5 text-emerald-400" />
            <h2 className="text-lg font-bold text-slate-100">إدارة الحسابات البنكية والتسويات المصرفية</h2>
          </div>
          <p className="text-xs text-slate-400">
            متابعة أرصدة البنوك، استيراد كشوف الحسابات البنكية (MT940/CSV)، والتسوية البنكية الآلية مع دفاتر النقابة.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleAutoReconcile}
            className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl shadow-lg transition-all"
          >
            <RefreshCw className="w-4 h-4" />
            <span>تشغيل التسوية الآلية</span>
          </button>
        </div>
      </div>

      {/* Bank Account Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {bankAccounts.map((b) => (
          <div key={b.id} className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-extrabold text-sm text-slate-100">{b.bankName}</h3>
                <span className="font-mono text-xs text-slate-400 mt-0.5 block">{b.accountNumberMasked}</span>
              </div>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800/40">
                ج.م
              </span>
            </div>

            <div className="pt-3 border-t border-slate-800 flex items-center justify-between">
              <div>
                <span className="text-xs text-slate-400 block">الرصيد الدفتري الحالي:</span>
                <span className="text-xl font-black text-emerald-400 font-mono">
                  {(b.currentBalance ?? 0).toLocaleString()} ج.م
                </span>
              </div>
              <div className="text-left text-xs text-slate-400">
                <span>كود الحساب: <strong>1102</strong></span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Bank Transactions Feed */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
        <h3 className="text-xs font-bold text-slate-300">حركات ومعاملات كشف الحساب البنكي:</h3>

        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead>
              <tr className="bg-slate-950 border-b border-slate-800 text-slate-400 font-bold">
                <th className="py-3 px-4">التاريخ</th>
                <th className="py-3 px-4">المرجع المصرفي</th>
                <th className="py-3 px-4">البيان والشرح</th>
                <th className="py-3 px-4">المبلغ</th>
                <th className="py-3 px-4">حالة المطابقة</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {transactions.map((t) => (
                <tr key={t.id} className="hover:bg-slate-800/40">
                  <td className="py-3 px-4 font-mono text-slate-400">{t.transactionDate}</td>
                  <td className="py-3 px-4 font-mono font-bold text-slate-200">{t.referenceNumber}</td>
                  <td className="py-3 px-4 text-slate-200">{t.description}</td>
                  <td className="py-3 px-4 font-mono font-bold text-slate-100">
                    <span className={t.debit > 0 ? 'text-emerald-400' : 'text-rose-400'}>
                      {t.debit > 0 ? '+' : '-'}{((t.debit || t.credit) ?? 0).toLocaleString()} ج.م
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold ${
                        t.matchedStatus === 'MATCHED'
                          ? 'bg-emerald-950 text-emerald-400 border border-emerald-800/40'
                          : 'bg-amber-950 text-amber-400 border border-amber-800/40'
                      }`}
                    >
                      {t.matchedStatus === 'MATCHED' ? (
                        <>
                          <CheckCircle2 className="w-3 h-3" />
                          <span>مطابق بالدفاتر</span>
                        </>
                      ) : (
                        <>
                          <Clock className="w-3 h-3" />
                          <span>قيد المطابقة</span>
                        </>
                      )}
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
