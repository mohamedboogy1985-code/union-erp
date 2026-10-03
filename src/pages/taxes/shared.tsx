import React from 'react';
import {
  AlertTriangle,
  Calculator,
  CheckCircle2,
  Landmark,
} from 'lucide-react';
import type { User } from '../../types/erp.js';

export interface TaxViewProps {
  organizationId: string;
  currentUser: User | null;
  onShowToast: (
    type: 'success' | 'error' | 'warning' | 'info',
    msg: string,
  ) => void;
}

export const fmt = (value: number | null | undefined): string =>
  (value ?? 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

export const fmtInt = (value: number | null | undefined): string =>
  (value ?? 0).toLocaleString('en-US');

export const Card: React.FC<{
  title: string;
  icon?: React.ElementType;
  children: React.ReactNode;
  tone?: 'slate' | 'amber' | 'emerald' | 'sky';
}> = ({ title, icon: Icon = Calculator, children, tone = 'slate' }) => {
  const tones: Record<string, string> = {
    slate: 'border-slate-800',
    amber: 'border-amber-800/50',
    emerald: 'border-emerald-800/50',
    sky: 'border-sky-800/50',
  };
  const iconTones: Record<string, string> = {
    slate: 'text-slate-400',
    amber: 'text-amber-300',
    emerald: 'text-emerald-300',
    sky: 'text-sky-300',
  };
  return (
    <div
      className={`bg-slate-900 border ${tones[tone]} rounded-2xl p-4 shadow-md space-y-3`}
    >
      <div className="flex items-center gap-2">
        <Icon className={`w-4 h-4 ${iconTones[tone]}`} />
        <h3 className="text-xs font-bold text-slate-100">{title}</h3>
      </div>
      {children}
    </div>
  );
};

export const Field: React.FC<{
  label: string;
  hint?: string;
  children: React.ReactNode;
}> = ({ label, hint, children }) => (
  <label className="block space-y-1">
    <span className="block text-[10px] text-slate-400">{label}</span>
    {children}
    {hint && <span className="block text-[9px] text-slate-500">{hint}</span>}
  </label>
);

export const NumberInput: React.FC<{
  value: number;
  onChange: (value: number) => void;
  placeholder?: string;
  step?: string;
}> = ({ value, onChange, placeholder, step = '0.01' }) => (
  <input
    type="number"
    step={step}
    value={Number.isFinite(value) ? value : 0}
    onChange={(event) => onChange(Number(event.target.value))}
    placeholder={placeholder}
    className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-[12px] text-slate-200 outline-hidden focus:border-teal-700"
  />
);

export const StatBox: React.FC<{
  label: string;
  value: string;
  tone?: 'slate' | 'emerald' | 'amber' | 'sky';
  hint?: string;
}> = ({ label, value, tone = 'slate', hint }) => {
  const tones: Record<string, string> = {
    slate: 'text-slate-100',
    emerald: 'text-emerald-300',
    amber: 'text-amber-300',
    sky: 'text-sky-300',
  };
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950 px-3 py-2">
      <p className="text-[10px] text-slate-500">{label}</p>
      <p className={`text-sm font-bold mt-0.5 ${tones[tone]}`}>{value}</p>
      {hint && <p className="text-[9px] text-slate-500 mt-0.5">{hint}</p>}
    </div>
  );
};

export const BracketTable: React.FC<{
  rows: {
    labelAr: string;
    from: number;
    to: number | null;
    rate: number;
    amountInBracket: number;
    taxAmount: number;
  }[];
  grossLabel?: string;
}> = ({ rows, grossLabel = 'المبلغ الخاضع في الشريحة' }) => (
  <div className="overflow-auto rounded-xl border border-slate-800">
    <table className="w-full text-[11px]">
      <thead className="bg-slate-950 text-slate-400">
        <tr>
          <th className="text-right py-2 px-2 font-medium">الشريحة</th>
          <th className="text-right py-2 px-2 font-medium">نطاق الشريحة (ج)</th>
          <th className="text-right py-2 px-2 font-medium">النسبة</th>
          <th className="text-right py-2 px-2 font-medium">{grossLabel} (ج)</th>
          <th className="text-right py-2 px-2 font-medium">الضريبة (ج)</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr
            key={`${row.from}-${row.to ?? '∞'}`}
            className={`border-t border-slate-800/70 ${row.amountInBracket > 0 ? '' : 'opacity-45'}`}
          >
            <td className="py-1.5 px-2 text-slate-300">
              {row.labelAr || `${row.rate}%`}
            </td>
            <td className="py-1.5 px-2 font-mono text-slate-400">
              {fmtInt(row.from)} — {row.to === null ? 'وأكثر' : fmtInt(row.to)}
            </td>
            <td className="py-1.5 px-2 text-slate-300">{row.rate}%</td>
            <td className="py-1.5 px-2 font-mono text-slate-200">
              {fmt(row.amountInBracket)}
            </td>
            <td className="py-1.5 px-2 font-mono text-emerald-300">
              {fmt(row.taxAmount)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

export const LegalNote: React.FC<{
  children: React.ReactNode;
  tone?: 'amber' | 'sky' | 'emerald';
}> = ({ children, tone = 'sky' }) => {
  const tones: Record<string, string> = {
    amber: 'border-amber-800/50 text-amber-200/90',
    sky: 'border-sky-800/50 text-sky-200/90',
    emerald: 'border-emerald-800/50 text-emerald-200/90',
  };
  return (
    <div
      className={`rounded-xl border bg-slate-950/60 px-3 py-2 text-[10px] leading-5 ${tones[tone]}`}
    >
      <span className="inline-flex items-center gap-1">
        <Landmark className="w-3 h-3" />
      </span>{' '}
      {children}
    </div>
  );
};

export const Toast: React.FC<{
  tone: 'success' | 'error';
  children: React.ReactNode;
}> = ({ tone, children }) => (
  <div
    className={`flex items-start gap-2 rounded-xl border px-3 py-2 text-[11px] ${tone === 'success' ? 'border-emerald-800/50 text-emerald-200' : 'border-rose-800/50 text-rose-200'}`}
  >
    {tone === 'success' ? (
      <CheckCircle2 className="w-3.5 h-3.5 mt-0.5" />
    ) : (
      <AlertTriangle className="w-3.5 h-3.5 mt-0.5" />
    )}
    <span className="leading-5">{children}</span>
  </div>
);
