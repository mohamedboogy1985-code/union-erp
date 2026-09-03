import React, { useEffect, useState } from 'react';
import {
  FileText,
  UploadCloud,
  CheckCircle2,
  ShieldCheck,
  Award,
  Download,
  Trash2,
  AlertCircle,
  X,
  FileCheck,
  Lock,
  RefreshCw,
} from 'lucide-react';
import { DocumentAttachment } from '../types/erp.js';
import { api } from '../services/api.js';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  entityType: 'JOURNAL_ENTRY' | 'RECEIPT' | 'MEMBER' | 'ASSET' | 'BUDGET' | 'REGULATION';
  entityId: string;
  entityTitle: string;
}

export const DocumentManagerModal: React.FC<Props> = ({
  isOpen,
  onClose,
  entityType,
  entityId,
  entityTitle,
}) => {
  const [documents, setDocuments] = useState<DocumentAttachment[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [uploadDescription, setUploadDescription] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileBase64, setFileBase64] = useState<string>('');
  const [isUploading, setIsUploading] = useState(false);
  const [signingDocId, setSigningDocId] = useState<string | null>(null);
  const [signNotes, setSignNotes] = useState('');
  const [verifiedDoc, setVerifiedDoc] = useState<any | null>(null);
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fetchDocs = async () => {
    if (!entityId) return;
    setIsLoading(true);
    try {
      const data = await api.getDocuments({ entityType, entityId });
      setDocuments(data);
    } catch (err: any) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && entityId) {
      fetchDocs();
      setStatusMsg(null);
      setSelectedFile(null);
      setFileBase64('');
    }
  }, [isOpen, entityId]);

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setSelectedFile(file);
      const reader = new FileReader();
      reader.onload = () => {
        setFileBase64(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) return;

    setIsUploading(true);
    setStatusMsg(null);
    try {
      await api.uploadDocument({
        entityType,
        entityId,
        fileName: selectedFile.name,
        fileSize: selectedFile.size,
        fileType: selectedFile.type,
        dataUrl: fileBase64,
        description: uploadDescription || 'مستند مؤيد معتمد للمعاملة',
        autoSign: true,
      });

      setStatusMsg({ type: 'success', text: 'تم رفع المستند وأرشفته إلكترونياً بنجاح مع الختم المشفر.' });
      setSelectedFile(null);
      setFileBase64('');
      setUploadDescription('');
      fetchDocs();
    } catch (err: any) {
      setStatusMsg({ type: 'error', text: err.message || 'فشل في رفع المستند' });
    } finally {
      setIsUploading(false);
    }
  };

  const handleSign = async (docId: string) => {
    try {
      await api.signDocument(docId, signNotes || 'تم التحقق من الفاتورة ومطابقة المبالغ مع الحسابات المساعدة');
      setStatusMsg({ type: 'success', text: 'تم تثبيت التوقيع الرقمي والختم الإلكتروني بنجاح.' });
      setSigningDocId(null);
      setSignNotes('');
      fetchDocs();
    } catch (err: any) {
      setStatusMsg({ type: 'error', text: err.message || 'فشل في التوقيع الرقمي' });
    }
  };

  const handleVerify = async (docId: string) => {
    try {
      const res = await api.verifyDocument(docId);
      setVerifiedDoc(res);
    } catch (err: any) {
      setStatusMsg({ type: 'error', text: 'فشل في التحقق من المستند' });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-700 w-full max-w-4xl rounded-2xl shadow-2xl overflow-hidden text-slate-100 animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="px-6 py-4 bg-slate-800/80 border-b border-slate-700 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-500/20 text-indigo-400 rounded-lg border border-indigo-500/30">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                نظام إدارة الوثائق والمرفقات الرقمية (DMS & Electronic Seal)
              </h2>
              <p className="text-xs text-slate-400">
                المستندات المؤيدة والأختام الإلكترونية المشفرة لـ: <span className="text-indigo-300 font-semibold">{entityTitle}</span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-700/60 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {statusMsg && (
          <div
            className={`mx-6 mt-4 p-3 rounded-xl flex items-center gap-3 text-sm ${
              statusMsg.type === 'success'
                ? 'bg-emerald-950/40 border border-emerald-500/30 text-emerald-300'
                : 'bg-rose-950/40 border border-rose-500/30 text-rose-300'
            }`}
          >
            {statusMsg.type === 'success' ? <CheckCircle2 className="w-5 h-5 shrink-0" /> : <AlertCircle className="w-5 h-5 shrink-0" />}
            <span>{statusMsg.text}</span>
          </div>
        )}

        <div className="p-6 grid grid-cols-1 md:grid-cols-12 gap-6 max-h-[75vh] overflow-y-auto">
          {/* Left / Upload Area */}
          <div className="md:col-span-5 flex flex-col gap-4">
            <div className="bg-slate-800/40 border border-slate-700/60 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-slate-200 mb-3 flex items-center gap-2">
                <UploadCloud className="w-4 h-4 text-indigo-400" />
                أرشفة ورفع مستند مؤيد جديد
              </h3>

              <form onSubmit={handleUpload} className="space-y-3">
                <div className="border-2 border-dashed border-slate-700 hover:border-indigo-500/60 rounded-xl p-4 text-center cursor-pointer transition-colors bg-slate-900/40 relative">
                  <input
                    type="file"
                    accept=".pdf,.png,.jpg,.jpeg,.xlsx,.docx"
                    onChange={handleFileChange}
                    className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                  />
                  <div className="flex flex-col items-center justify-center gap-2">
                    <FileText className="w-8 h-8 text-indigo-400/80" />
                    {selectedFile ? (
                      <div>
                        <p className="text-xs font-semibold text-indigo-300 truncate max-w-[200px]">{selectedFile.name}</p>
                        <p className="text-[10px] text-slate-400">{(selectedFile.size / 1024).toFixed(1)} كيلوبايت</p>
                      </div>
                    ) : (
                      <>
                        <p className="text-xs text-slate-300">اسحب الملف هنا أو انقر للاختيار</p>
                        <p className="text-[10px] text-slate-500">يدعم PDF، الصور الضوئية، الفواتير الإلكترونية</p>
                      </>
                    )}
                  </div>
                </div>

                <div>
                  <label className="block text-xs text-slate-300 mb-1">وصف المستند / رقم الفاتورة</label>
                  <input
                    type="text"
                    value={uploadDescription}
                    onChange={(e) => setUploadDescription(e.target.value)}
                    placeholder="مثال: فاتورة توريد شركة الأمل رقم 4022"
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <button
                  type="submit"
                  disabled={!selectedFile || isUploading}
                  className="w-full py-2.5 px-4 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-lg text-xs transition-all flex items-center justify-center gap-2 shadow-lg shadow-indigo-950/40"
                >
                  {isUploading ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      جاري التشفير والأرشفة...
                    </>
                  ) : (
                    <>
                      <Lock className="w-4 h-4" />
                      تشفير وتوثيق المستند
                    </>
                  )}
                </button>
              </form>
            </div>

            {/* Cryptographic Verification info */}
            <div className="bg-slate-800/30 border border-slate-700/40 rounded-xl p-3.5 text-xs text-slate-400 space-y-2">
              <div className="flex items-center gap-2 text-indigo-300 font-semibold">
                <Award className="w-4 h-4 text-amber-400" />
                معايير الأمان والأرشفة القانونية
              </div>
              <p className="text-[11px] leading-relaxed">
                يتم توليد بصمة تجزئة مشفرة (SHA-256 Hash) لكل ملف فور رفعه، مع توثيق الختم الإلكتروني للمدير المالي لمنع التعديل بعد الاعتماد وضمان الحجية المحاسبية أمام جهات المراجعة المركزية.
              </p>
            </div>
          </div>

          {/* Right / Document List */}
          <div className="md:col-span-7 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                <FileCheck className="w-4 h-4 text-emerald-400" />
                المستندات المؤيدة المؤرشفة ({documents.length})
              </h3>
              <button
                onClick={fetchDocs}
                className="text-xs text-slate-400 hover:text-white flex items-center gap-1 transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                تحديث
              </button>
            </div>

            {isLoading ? (
              <div className="p-8 text-center text-slate-400 text-xs flex flex-col items-center gap-2">
                <RefreshCw className="w-5 h-5 animate-spin text-indigo-400" />
                جاري استدعاء الأرشيف...
              </div>
            ) : documents.length === 0 ? (
              <div className="p-8 border border-dashed border-slate-700/60 rounded-xl text-center text-slate-400 text-xs">
                لا توجد مرفقات مسجلة لهذه المعاملة حالياً. يمكنك رفع الفاتورة أو إشعار التحويل من النموذج المجاور.
              </div>
            ) : (
              <div className="space-y-3">
                {documents.map((doc) => (
                  <div
                    key={doc.id}
                    className="bg-slate-800/50 border border-slate-700/80 rounded-xl p-3.5 hover:border-slate-600 transition-all flex flex-col gap-2.5"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <div className="p-2 bg-slate-700/50 text-indigo-400 rounded-lg">
                          <FileText className="w-5 h-5" />
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-white">{doc.fileName}</p>
                          <p className="text-[11px] text-slate-400">{doc.description}</p>
                          <p className="text-[10px] text-slate-500 mt-0.5">
                            المرفوع بواسطة: {doc.uploadedByName} • {(doc.fileSize / 1024).toFixed(1)} KB
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          onClick={() => handleVerify(doc.id)}
                          className="px-2 py-1 bg-slate-700/60 hover:bg-slate-750 text-slate-200 rounded text-[11px] flex items-center gap-1 transition-colors"
                          title="فحص صحة الختم والتجزئة المشفرة"
                        >
                          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                          فحص
                        </button>
                      </div>
                    </div>

                    {/* Digital Signature Badge */}
                    {doc.digitalSignature ? (
                      <div className="bg-emerald-950/30 border border-emerald-500/30 rounded-lg p-2 flex items-center justify-between text-[11px]">
                        <div className="flex items-center gap-2 text-emerald-300">
                          <Award className="w-4 h-4 text-emerald-400 shrink-0" />
                          <div>
                            <span className="font-semibold">مختوم إلكترونياً: </span>
                            <span>{doc.digitalSignature.signerName} ({doc.digitalSignature.signerRole})</span>
                            <span className="text-[10px] text-emerald-400/80 block">{doc.digitalSignature.sealCode}</span>
                          </div>
                        </div>
                        <span className="px-1.5 py-0.5 bg-emerald-500/20 text-emerald-300 rounded text-[10px] font-mono">
                          صالح قانونياً
                        </span>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between bg-amber-950/20 border border-amber-500/20 rounded-lg p-2 text-[11px]">
                        <span className="text-amber-300">بانتظار الختم والتوقيع الإلكتروني</span>
                        <button
                          onClick={() => setSigningDocId(doc.id)}
                          className="px-2.5 py-1 bg-amber-600 hover:bg-amber-500 text-white rounded text-[10px] font-medium"
                        >
                          ختم وتوقيع المستند
                        </button>
                      </div>
                    )}

                    {/* SHA256 Fingerprint */}
                    <div className="bg-slate-900/60 px-2.5 py-1 rounded text-[10px] font-mono text-slate-400 truncate flex items-center justify-between">
                      <span>SHA-256: {doc.sha256Hash}</span>
                    </div>

                    {/* Signing Box Drawer */}
                    {signingDocId === doc.id && (
                      <div className="bg-slate-900 border border-amber-500/40 rounded-lg p-2.5 mt-2 space-y-2">
                        <label className="block text-[11px] text-slate-300">ملاحظات الاعتماد المالي والتوقيع</label>
                        <input
                          type="text"
                          value={signNotes}
                          onChange={(e) => setSignNotes(e.target.value)}
                          placeholder="ملاحظات الاعتماد والختم..."
                          className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-white"
                        />
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => setSigningDocId(null)}
                            className="px-2 py-1 text-slate-400 hover:text-white text-xs"
                          >
                            إلغاء
                          </button>
                          <button
                            onClick={() => handleSign(doc.id)}
                            className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded"
                          >
                            تأكيد التوقيع والختم
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Verification Modal / Drawer */}
        {verifiedDoc && (
          <div className="p-4 bg-slate-950 border-t border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-3 text-xs">
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
              <div>
                <p className="text-white font-semibold">نتيجة التحقق الرقمي: المستند سليم ولم يتعرض لأي تعديل</p>
                <p className="text-slate-400 text-[11px]">
                  البصمة المشفرة مطابقة لسجلات الخادم المركزي • كود الختم: {verifiedDoc.digitalSignature?.sealCode || 'N/A'}
                </p>
              </div>
            </div>
            <button
              onClick={() => setVerifiedDoc(null)}
              className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs"
            >
              إغلاق الفحص
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
