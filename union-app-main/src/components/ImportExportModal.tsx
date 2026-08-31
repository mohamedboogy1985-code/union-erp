import React, { useState } from 'react';
import {
  FileSpreadsheet,
  Download,
  Upload,
  CheckCircle2,
  AlertTriangle,
  FileCheck,
  X,
  FileText,
  HelpCircle,
  RefreshCw,
  Layers,
  Users,
  BookOpen,
} from 'lucide-react';
import { ImportValidationResult, ValidationError } from '../types/erp.js';
import { dataImportExport } from '../services/dataImportExport.js';
import { api } from '../services/api.js';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export const ImportExportModal: React.FC<Props> = ({ isOpen, onClose, onSuccess }) => {
  const [selectedEntity, setSelectedEntity] = useState<'SUBLEDGER_1301' | 'MEMBERS' | 'ACCOUNTS'>('SUBLEDGER_1301');
  const [rawInputText, setRawInputText] = useState('');
  const [fileName, setFileName] = useState('');
  const [isValidating, setIsValidating] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [validationResult, setValidationResult] = useState<ImportValidationResult | null>(null);
  const [parsedRows, setParsedRows] = useState<any[]>([]);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleDownloadTemplate = () => {
    const { filename, content } = dataImportExport.getSampleTemplate(selectedEntity);
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setFileName(file.name);
      const reader = new FileReader();
      reader.onload = () => {
        const text = reader.result as string;
        setRawInputText(text);
        validateText(text);
      };
      reader.readAsText(file);
    }
  };

  const validateText = async (textToValidate?: string) => {
    const text = textToValidate ?? rawInputText;
    if (!text.trim()) {
      setErrorMessage('يرجى لصق البيانات أو اختيار ملف أولاً.');
      return;
    }

    setIsValidating(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const rows = dataImportExport.parseCSVText(text, selectedEntity);
      setParsedRows(rows);

      if (rows.length === 0) {
        setErrorMessage('لم يتم العثور على صفوف صالحة للقراءة. تأكد من وجود صف العناوين الأول.');
        setValidationResult(null);
        return;
      }

      const result = await api.validateImport(selectedEntity, rows);
      setValidationResult(result);
    } catch (err: any) {
      setErrorMessage(err.message || 'حدث خطأ أثناء فحص وتدقيق البيانات.');
    } finally {
      setIsValidating(false);
    }
  };

  const handleExecuteImport = async () => {
    if (!parsedRows.length) return;

    setIsExecuting(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const res = await api.executeImport(selectedEntity, parsedRows);
      setSuccessMessage(res.message || 'تم استيراد البيانات بنجاح!');
      setValidationResult(null);
      setRawInputText('');
      setFileName('');
      setParsedRows([]);
      if (onSuccess) onSuccess();
    } catch (err: any) {
      setErrorMessage(err.message || 'فشل استيراد البيانات إلى النظام.');
    } finally {
      setIsExecuting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-700 w-full max-w-4xl rounded-2xl shadow-2xl overflow-hidden text-slate-100 animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="px-6 py-4 bg-slate-800/80 border-b border-slate-700 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-500/20 text-emerald-400 rounded-lg border border-emerald-500/30">
              <FileSpreadsheet className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                نظام استيراد وتصدير البيانات المتطور (Data Import & Verification Engine)
              </h2>
              <p className="text-xs text-slate-400">
                استيراد كشوف الحسابات وسجلات الأعضاء من ملفات Excel مباشرة مع الفحص والتدقيق التلقائي قبل الإدخال
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

        {/* Entity Selector Tabs */}
        <div className="px-6 py-3 bg-slate-800/40 border-b border-slate-700 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setSelectedEntity('SUBLEDGER_1301');
                setValidationResult(null);
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
                selectedEntity === 'SUBLEDGER_1301'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-950/40'
                  : 'bg-slate-800 hover:bg-slate-750 text-slate-300'
              }`}
            >
              <BookOpen className="w-4 h-4" />
              أستاذ مساعد 1301 (المدينين والموردين)
            </button>

            <button
              onClick={() => {
                setSelectedEntity('MEMBERS');
                setValidationResult(null);
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
                selectedEntity === 'MEMBERS'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-950/40'
                  : 'bg-slate-800 hover:bg-slate-750 text-slate-300'
              }`}
            >
              <Users className="w-4 h-4" />
              سجل الأعضاء والاشتراكات
            </button>

            <button
              onClick={() => {
                setSelectedEntity('ACCOUNTS');
                setValidationResult(null);
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
                selectedEntity === 'ACCOUNTS'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-950/40'
                  : 'bg-slate-800 hover:bg-slate-750 text-slate-300'
              }`}
            >
              <Layers className="w-4 h-4" />
              دليل الحسابات الموحد
            </button>
          </div>

          <button
            onClick={handleDownloadTemplate}
            className="px-3 py-1.5 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            تحميل النموذج القياسي (CSV / Excel)
          </button>
        </div>

        {/* Notifications */}
        {successMessage && (
          <div className="mx-6 mt-4 p-3.5 bg-emerald-950/40 border border-emerald-500/40 rounded-xl flex items-center gap-3 text-xs text-emerald-300">
            <CheckCircle2 className="w-5 h-5 shrink-0" />
            <span>{successMessage}</span>
          </div>
        )}

        {errorMessage && (
          <div className="mx-6 mt-4 p-3.5 bg-rose-950/40 border border-rose-500/40 rounded-xl flex items-center gap-3 text-xs text-rose-300">
            <AlertTriangle className="w-5 h-5 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Body */}
        <div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto">
          {/* File Upload Box */}
          <div className="border-2 border-dashed border-slate-700 hover:border-indigo-500/60 rounded-xl p-5 text-center bg-slate-800/30 relative transition-all">
            <input
              type="file"
              accept=".csv,.txt,.tsv"
              onChange={handleFileUpload}
              className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
            />
            <div className="flex flex-col items-center justify-center gap-2">
              <Upload className="w-8 h-8 text-indigo-400" />
              <p className="text-xs text-slate-200 font-semibold">
                {fileName ? `تم اختيار الملف: ${fileName}` : 'اسحب ملف الـ CSV/Excel هنا أو انقر للاختيار'}
              </p>
              <p className="text-[11px] text-slate-500">
                يدعم تنسيقات CSV المتوافقة مع ترميز UTF-8 واللغة العربية
              </p>
            </div>
          </div>

          {/* Or Paste Textarea */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs text-slate-300 font-medium">أو قم بلصق بيانات الجدول مباشرة من Excel:</label>
              <button
                onClick={() => validateText()}
                disabled={isValidating || !rawInputText.trim()}
                className="text-xs text-indigo-400 hover:text-indigo-300 font-semibold flex items-center gap-1 disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isValidating ? 'animate-spin' : ''}`} />
                فحص وتدقيق البيانات الآن
              </button>
            </div>
            <textarea
              rows={4}
              value={rawInputText}
              onChange={(e) => setRawInputText(e.target.value)}
              placeholder="الصق بيانات الجدول هنا مع الحفاظ على صف العناوين..."
              className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs font-mono text-slate-200 placeholder-slate-600 focus:outline-none focus:border-indigo-500"
            />
          </div>

          {/* Validation Report */}
          {validationResult && (
            <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-white flex items-center gap-2">
                  <FileCheck className="w-4 h-4 text-emerald-400" />
                  تقرير التدقيق والفحص التلقائي
                </h3>
                <div className="flex items-center gap-3 text-xs font-mono">
                  <span className="text-slate-300">الإجمالي: {validationResult.totalRows}</span>
                  <span className="text-emerald-400 font-bold">صالحة: {validationResult.validRows}</span>
                  {validationResult.invalidRows > 0 && (
                    <span className="text-rose-400 font-bold">بها أخطاء: {validationResult.invalidRows}</span>
                  )}
                </div>
              </div>

              {/* Errors list if any */}
              {validationResult.errors && validationResult.errors.length > 0 && (
                <div className="space-y-1.5 max-h-36 overflow-y-auto">
                  {validationResult.errors.map((err, i) => (
                    <div
                      key={i}
                      className={`p-2 rounded-lg text-xs flex items-center justify-between ${
                        err.severity === 'ERROR'
                          ? 'bg-rose-950/30 border border-rose-500/30 text-rose-300'
                          : 'bg-amber-950/30 border border-amber-500/30 text-amber-300'
                      }`}
                    >
                      <span>
                        الصف #{err.row} [{err.column}]: {err.message}
                      </span>
                      <span className="font-mono text-[10px] opacity-75">{err.severity}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Preview Table */}
              {validationResult.previewData && validationResult.previewData.length > 0 && (
                <div className="border border-slate-700/80 rounded-lg overflow-x-auto">
                  <table className="w-full text-right text-xs">
                    <thead className="bg-slate-800 text-slate-300 border-b border-slate-700">
                      <tr>
                        {Object.keys(validationResult.previewData[0]).map((key) => (
                          <th key={key} className="p-2 font-semibold">
                            {key}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800 text-slate-300">
                      {validationResult.previewData.map((row, idx) => (
                        <tr key={idx} className="hover:bg-slate-800/40">
                          {Object.values(row).map((val: any, vIdx) => (
                            <td key={vIdx} className="p-2 text-[11px] truncate max-w-[150px]">
                              {String(val)}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-slate-950 border-t border-slate-800 flex items-center justify-between">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs rounded-lg transition-colors"
          >
            إلغاء
          </button>

          <button
            onClick={handleExecuteImport}
            disabled={!validationResult || validationResult.validRows === 0 || isExecuting}
            className="px-6 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-bold rounded-lg shadow-lg shadow-emerald-950/40 transition-all flex items-center gap-2"
          >
            {isExecuting ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                جاري ترحيل واستيراد البيانات...
              </>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4" />
                اعتماد واستيراد {validationResult?.validRows ?? 0} سجل إلى النظام
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
