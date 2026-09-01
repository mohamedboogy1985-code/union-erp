import React from 'react';
import { Modal } from './Modal.js';
import { Printer, ShieldCheck, CheckCircle2, Download, Copy } from 'lucide-react';

interface QRCodeModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  data: {
    type: 'RECEIPT' | 'CERTIFICATE';
    number: string;
    date: string;
    entityName: string;
    beneficiaryName: string;
    amount?: number;
    paymentMethod?: string;
    token: string;
    sha256Hash?: string;
    expiryDate?: string;
    notes?: string;
  } | null;
}

export const QRCodeModal: React.FC<QRCodeModalProps> = ({ isOpen, onClose, title, data }) => {
  if (!data) return null;

  const handlePrint = () => {
    window.print();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} maxWidth="2xl">
      <div id="printable-document" className="space-y-6 text-slate-200">
        {/* Official Header */}
        <div className="border-b-2 border-emerald-500/40 pb-4 text-center">
          <div className="flex items-center justify-between">
            <div className="text-right">
              <h2 className="text-xl font-black text-emerald-400">جمهورية مصر العربية</h2>
              <p className="text-sm font-semibold text-slate-300">الاتحاد العام لنقابات عمال مصر</p>
              <p className="text-xs text-slate-400">النقابة العامة للعاملين - الشؤون المالية والإدارية</p>
            </div>
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-500 flex items-center justify-center shadow-lg border border-emerald-400/40">
              <ShieldCheck className="w-10 h-10 text-white" />
            </div>
            <div className="text-left text-xs text-slate-400">
              <p>الرقم المسلسل: <span className="font-mono font-bold text-slate-200">{data.number}</span></p>
              <p>التاريخ: <span className="font-mono text-slate-200">{data.date}</span></p>
              <p>الحالة: <span className="text-emerald-400 font-bold">معتمد رسمياً</span></p>
            </div>
          </div>
        </div>

        {/* Certificate / Receipt Title Banner */}
        <div className="text-center py-2 bg-emerald-950/40 border border-emerald-800/40 rounded-xl">
          <h1 className="text-lg font-bold text-emerald-300">
            {data.type === 'RECEIPT' ? 'إيصال تحصيل نقدية وإيرادات رسمي' : 'شهادة قيد وتجديد عضوية نقابية رسمية'}
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">مستند رسمي محمي بنظام البصمة المشفرة ورمز الاستجابة السريع</p>
        </div>

        {/* Content Details Grid */}
        <div className="grid grid-cols-2 gap-4 bg-slate-950/50 p-4 rounded-xl border border-slate-800 text-sm">
          <div>
            <span className="text-slate-400 text-xs block">الجهة المصدرة:</span>
            <span className="font-bold text-slate-100">{data.entityName}</span>
          </div>
          <div>
            <span className="text-slate-400 text-xs block">{data.type === 'RECEIPT' ? 'المستلم منه (الدافع):' : 'اسم العضو المقيد:'}</span>
            <span className="font-bold text-slate-100">{data.beneficiaryName}</span>
          </div>

          {data.amount !== undefined && (
            <div>
              <span className="text-slate-400 text-xs block">المبلغ المحصل:</span>
              <span className="text-lg font-black text-emerald-400">{(data.amount ?? 0).toLocaleString()} ج.م</span>
            </div>
          )}

          {data.paymentMethod && (
            <div>
              <span className="text-slate-400 text-xs block">طريقة الدفع:</span>
              <span className="font-semibold text-slate-200">{data.paymentMethod}</span>
            </div>
          )}

          {data.expiryDate && (
            <div>
              <span className="text-slate-400 text-xs block">تاريخ انتهاء الصلاحية:</span>
              <span className="font-bold text-amber-400">{data.expiryDate}</span>
            </div>
          )}

          {data.notes && (
            <div className="col-span-2">
              <span className="text-slate-400 text-xs block">البيان والغرض:</span>
              <span className="text-slate-300 text-xs">{data.notes}</span>
            </div>
          )}
        </div>

        {/* QR Simulation & Cryptographic Seal */}
        <div className="flex items-center justify-between p-4 bg-slate-900 border border-slate-800 rounded-xl">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span className="text-xs font-bold text-slate-200">رمز التحقق الإلكتروني (Verification Token):</span>
            </div>
            <div className="font-mono text-sm font-bold text-emerald-400 bg-slate-950 px-3 py-1.5 rounded-lg border border-slate-800 inline-block">
              {data.token}
            </div>
            {data.sha256Hash && (
              <div className="mt-2">
                <span className="text-[10px] text-slate-500 block">بصمة المستند الرقمية (SHA-256 Hash):</span>
                <span className="font-mono text-[10px] text-slate-400 break-all">{data.sha256Hash}</span>
              </div>
            )}
          </div>

          {/* SVG Vector QR Code */}
          <div className="p-2 bg-white rounded-xl shadow-md shrink-0 flex flex-col items-center">
            <svg className="w-24 h-24" viewBox="0 0 100 100" fill="currentColor">
              {/* QR Pattern Representation */}
              <rect x="0" y="0" width="30" height="30" fill="#064e3b" />
              <rect x="5" y="5" width="20" height="20" fill="#ffffff" />
              <rect x="10" y="10" width="10" height="10" fill="#064e3b" />

              <rect x="70" y="0" width="30" height="30" fill="#064e3b" />
              <rect x="75" y="5" width="20" height="20" fill="#ffffff" />
              <rect x="80" y="10" width="10" height="10" fill="#064e3b" />

              <rect x="0" y="70" width="30" height="30" fill="#064e3b" />
              <rect x="5" y="75" width="20" height="20" fill="#ffffff" />
              <rect x="10" y="80" width="10" height="10" fill="#064e3b" />

              {/* Data Blocks */}
              <rect x="35" y="10" width="10" height="10" fill="#064e3b" />
              <rect x="50" y="15" width="10" height="10" fill="#064e3b" />
              <rect x="35" y="35" width="15" height="15" fill="#064e3b" />
              <rect x="55" y="35" width="10" height="10" fill="#064e3b" />
              <rect x="70" y="45" width="15" height="10" fill="#064e3b" />
              <rect x="40" y="60" width="10" height="15" fill="#064e3b" />
              <rect x="60" y="65" width="15" height="10" fill="#064e3b" />
              <rect x="80" y="75" width="10" height="15" fill="#064e3b" />
            </svg>
            <span className="text-[9px] text-slate-700 font-bold mt-1">امسح للتحقق</span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-semibold rounded-xl transition-colors"
          >
            إغلاق
          </button>
          <button
            onClick={handlePrint}
            className="flex items-center gap-2 px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold rounded-xl shadow-lg transition-all"
          >
            <Printer className="w-4 h-4" />
            طباعة المستند الرسمي
          </button>
        </div>
      </div>
    </Modal>
  );
};
