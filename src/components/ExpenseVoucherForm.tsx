import React, { useState } from 'react';
import { Printer, Receipt } from 'lucide-react';
import { User } from '../types/erp.js';

interface ExpenseVoucherFormProps {
  currentUser: User | null;
  entryNumber?: string;
  onShowToast: (type: 'success' | 'error' | 'warning' | 'info', msg: string) => void;
}

const amountToWords = (num: number): string => {
  if (isNaN(num) || num <= 0) return '';
  const ones = ['', 'واحد', 'اثنان', 'ثلاثة', 'أربعة', 'خمسة', 'ستة', 'سبعة', 'ثمانية', 'تسعة', 'عشرة', 'أحد عشر', 'اثنا عشر', 'ثلاثة عشر', 'أربعة عشر', 'خمسة عشر', 'ستة عشر', 'سبعة عشر', 'ثمانية عشر', 'تسعة عشر'];
  const tens = ['', '', 'عشرون', 'ثلاثون', 'أربعون', 'خمسون', 'ستون', 'سبعون', 'ثمانون', 'تسعون'];
  const hundreds = ['', 'مائة', 'مائتان', 'ثلاثمائة', 'أربعمائة', 'خمسمائة', 'ستمائة', 'سبعمائة', 'ثمانمائة', 'تسعمائة'];

  const threeDigits = (n: number): string => {
    let res = '';
    const h = Math.floor(n / 100);
    const t = n % 100;
    if (h) res += hundreds[h] + ' ';
    if (t < 20) res += ones[t] + ' ';
    else {
      const te = Math.floor(t / 10);
      const o = t % 10;
      res += (o ? ones[o] + ' و' : '') + tens[te] + ' ';
    }
    return res.trim();
  };

  let result = '';
  const billions = Math.floor(num / 1e9);
  const millions = Math.floor((num % 1e9) / 1e6);
  const thousands = Math.floor((num % 1e6) / 1000);
  const rest = Math.floor(num % 1000);

  if (billions) result += threeDigits(billions) + ' مليار ';
  if (millions) result += threeDigits(millions) + ' مليون ';
  if (thousands) result += threeDigits(thousands) + ' ألف ';
  if (rest) result += threeDigits(rest);

  return result.trim() + ' جنيهاً مصرياً فقط لا غير';
};

export const ExpenseVoucherForm: React.FC<ExpenseVoucherFormProps> = ({
  currentUser,
  entryNumber = '',
  onShowToast,
}) => {
  const now = new Date();
  const today = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}/${String(now.getDate()).padStart(2, '0')}`;

  const [voucherNo, setVoucherNo] = useState(entryNumber || '');
  const [voucherDate, setVoucherDate] = useState(today);
  const [payee, setPayee] = useState('');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [notes, setNotes] = useState('');

  const numericAmount = Number(amount.replace(/,/g, ''));
  const formattedAmount = isNaN(numericAmount)
    ? ''
    : numericAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const amountWords = isNaN(numericAmount) ? '' : amountToWords(numericAmount);

  const unionName = 'النقابة العامة للعاملين بصناعات البناء والأخشاب وصنع مواد البناء';
  const centerName = 'مركز التدريب المهني المتطور';

  const handlePrint = () => {
    onShowToast('success', 'سيتم فتح نافذة الطباعة لنموذج إذن الصرف.');
    window.print();
  };

  const userName = currentUser?.fullName || currentUser?.username || '';

  const labelCls = 'block text-[11px] font-bold text-slate-400 mb-1';
  const inputCls =
    'w-full px-2.5 py-1.5 bg-white text-slate-900 border border-slate-300 rounded text-sm focus:outline-none focus:border-sky-600 text-right';

  return (
    <div className="space-y-4">
      {/* شريط الأدوات (لا يُطبع) */}
      <div className="no-print flex items-center justify-between gap-3 pb-2 border-b border-slate-800">
        <div className="flex items-center gap-2 text-emerald-400">
          <Receipt className="w-4 h-4" />
          <span className="text-xs font-bold text-slate-200">نموذج إذن صرف — تعبئة تفاعلية وطباعة</span>
        </div>
        <button
          onClick={handlePrint}
          className="flex items-center gap-2 px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold rounded-xl transition-colors"
        >
          <Printer className="w-4 h-4" />
          طباعة النموذج
        </button>
      </div>

      {/* ورقة النموذج القابلة للطباعة */}
      <div id="expense-voucher-print-area" className="bg-white text-slate-900 rounded-xl p-6 shadow-xl print-area">
        {/* الترويسة */}
        <div className="border-b-2 border-slate-800 pb-3 text-center">
          <div className="text-lg font-black text-slate-900">{unionName}</div>
          <div className="text-sm font-bold text-slate-700 mt-1">{centerName}</div>
        </div>

        <div className="mt-4 flex items-center justify-center">
          <div className="text-2xl font-black text-slate-900 border-2 border-slate-900 px-10 py-2 tracking-widest">
            إذن صرف
          </div>
        </div>

        {/* رقم وتاريخ */}
        <div className="mt-4 grid grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>رقم الإذن</label>
            <input
              value={voucherNo}
              onChange={(e) => setVoucherNo(e.target.value)}
              placeholder="....."
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>التاريخ</label>
            <input
              value={voucherDate}
              onChange={(e) => setVoucherDate(e.target.value)}
              className={inputCls}
            />
          </div>
        </div>

        {/* المطلوب صرفه إلى */}
        <div className="mt-4">
          <label className={labelCls}>المطلوب صرفه إلى السيد / السيدة</label>
          <input
            value={payee}
            onChange={(e) => setPayee(e.target.value)}
            placeholder="بيان المستفيد"
            className={inputCls}
          />
        </div>

        {/* المبلغ */}
        <div className="mt-4 grid grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>المبلغ (بالأرقام)</label>
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0000.00"
              inputMode="decimal"
              className={`${inputCls} text-left font-mono`}
            />
            {formattedAmount && <div className="text-[11px] text-slate-500 mt-1 font-mono text-left">{formattedAmount}</div>}
          </div>
          <div>
            <label className={labelCls}>المبلغ (بالحروف)</label>
            <div className="flex items-center min-h-[34px] px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded text-sm text-slate-700 text-right">
              {amountWords || '...............'}
            </div>
          </div>
        </div>

        {/* البيان */}
        <div className="mt-4">
          <label className={labelCls}>البيان / الصرف على الوجه التالي</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            placeholder="تفصيل الغرض من الصرف"
            className="w-full px-2.5 py-1.5 bg-white text-slate-900 border border-slate-300 rounded text-sm focus:outline-none focus:border-sky-600 text-right resize-none"
          />
        </div>

        {/* ملاحظات */}
        <div className="mt-3">
          <label className={labelCls}>ملاحظات</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="إيضاحات إضافية (اختياري)"
            className="w-full px-2.5 py-1.5 bg-white text-slate-900 border border-slate-300 rounded text-sm focus:outline-none focus:border-sky-600 text-right resize-none"
          />
        </div>

        {/* التوقيعات */}
        <div className="mt-8 grid grid-cols-3 gap-4 text-center">
          <div>
            <div className="h-12"></div>
            <div className="border-t border-slate-800 pt-2 text-sm font-bold text-slate-800">صرف نقدية</div>
          </div>
          <div>
            <div className="h-12"></div>
            <div className="border-t border-slate-800 pt-2 text-sm font-bold text-slate-800">مراجعة الحسابات</div>
          </div>
          <div>
            <div className="h-12"></div>
            <div className="border-t border-slate-800 pt-2 text-sm font-bold text-slate-800">الاعتماد</div>
          </div>
        </div>

        {userName && (
          <div className="mt-6 pt-3 border-t border-slate-200 text-[11px] text-slate-500">
            أُعد بواسطة: {userName} — {today}
          </div>
        )}
      </div>
    </div>
  );
};

export default ExpenseVoucherForm;
