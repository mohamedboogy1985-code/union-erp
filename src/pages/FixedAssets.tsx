import React, { useState, useEffect } from 'react';
import {
  Boxes,
  PlusCircle,
  TrendingDown,
  Building,
  CheckCircle2
} from 'lucide-react';
import { api } from '../services/api.js';
import { FixedAsset, User } from '../types/erp.js';

interface FixedAssetsProps {
  organizationId: string;
  currentUser: User | null;
  onShowToast: (type: 'success' | 'error' | 'warning' | 'info', msg: string) => void;
}

export const FixedAssets: React.FC<FixedAssetsProps> = ({
  organizationId,
  currentUser,
  onShowToast,
}) => {
  const [assets, setAssets] = useState<FixedAsset[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAssets();
  }, [organizationId]);

  const loadAssets = async () => {
    setLoading(true);
    try {
      const data = await api.getFixedAssets();
      setAssets(data);
    } catch (err: any) {
      onShowToast('error', err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl shadow-lg flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Boxes className="w-5 h-5 text-emerald-400" />
            <h2 className="text-lg font-bold text-slate-100">سجل الأصول الثابتة وجداول الإهلاك</h2>
          </div>
          <p className="text-xs text-slate-400">
            حصر مقرات ومباني وتجهيزات وسيارات النقابة العامة واحتساب مخصص الإهلاك المحاسبي الدوري.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {assets.map((a) => (
          <div key={a.id} className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <span className="font-mono text-[10px] text-emerald-400 font-bold bg-emerald-950 px-2 py-0.5 rounded border border-emerald-800/40">
                  {a.assetCode}
                </span>
                <h3 className="font-bold text-sm text-slate-100 mt-1">{a.name}</h3>
                <span className="text-xs text-slate-400">تاريخ الشراء: {a.purchaseDate}</span>
              </div>
              <span className="text-xs text-slate-400">معدل الإهلاك: <strong className="text-amber-400 font-mono">%{a.depreciationRate}</strong></span>
            </div>

            <div className="pt-3 border-t border-slate-800 grid grid-cols-3 gap-2 text-xs">
              <div>
                <span className="text-slate-400 block">التكلفة التاريخية:</span>
                <span className="font-mono font-bold text-slate-200">{(a.purchaseCost ?? 0).toLocaleString()} ج.م</span>
              </div>
              <div>
                <span className="text-slate-400 block">مجمع الإهلاك:</span>
                <span className="font-mono font-bold text-rose-400">{(a.accumulatedDepreciation ?? 0).toLocaleString()} ج.م</span>
              </div>
              <div>
                <span className="text-slate-400 block">القيمة الدفترية:</span>
                <span className="font-mono font-bold text-emerald-400">{(a.bookValue ?? 0).toLocaleString()} ج.م</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
