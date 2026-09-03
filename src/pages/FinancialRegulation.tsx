import React, { useState, useEffect } from 'react';
import {
  ScrollText,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Gavel,
  FileText,
  Download,
  Eye,
  Lock,
  Award,
  RefreshCw,
} from 'lucide-react';
import { api } from '../services/api.js';
import { User } from '../types/erp.js';
import { Combobox } from '../components/Combobox.js';

interface RegulationRule {
  ruleId: string;
  descriptionAr: string;
  value: number | string | null;
  articleNo: string | null;
  enabled: boolean;
  severity: 'BLOCK' | 'WARN';
}

interface RegulationArticle {
  articleNo: string;
  title: string;
  text: string;
  category: string;
  keywords: string[];
}

interface RegulationData {
  document: string;
  articles: RegulationArticle[];
  status: {
    articlesCount: number;
    activeRules: RegulationRule[];
    pendingRules: RegulationRule[];
    isEnforcing: boolean;
  };
}

interface FinancialRegulationProps {
  organizationId: string;
  currentUser: User | null;
  onShowToast: (type: 'success' | 'error' | 'warning' | 'info', msg: string) => void;
}

export const FinancialRegulation: React.FC<FinancialRegulationProps> = ({
  organizationId,
  onShowToast,
}) => {
  const [data, setData] = useState<RegulationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [regulationDoc, setRegulationDoc] = useState<any | null>(null);
  const [docLoading, setDocLoading] = useState(false);
  const [showDoc, setShowDoc] = useState(false);

  useEffect(() => {
    loadRegulation();
    loadRegulationFile();
  }, [organizationId]);

  const loadRegulation = async () => {
    setLoading(true);
    try {
      const reg = await api.getRegulation();
      setData(reg);
    } catch (err: any) {
      onShowToast('error', err.message);
    } finally {
      setLoading(false);
    }
  };

  const loadRegulationFile = async () => {
    setDocLoading(true);
    try {
      const doc = await api.getRegulationDocument();
      setRegulationDoc(doc);
    } catch (err: any) {
      // اللائحة غير مؤرشفة بعد — لا تُظهر خطأ للمستخدم
      setRegulationDoc(null);
    } finally {
      setDocLoading(false);
    }
  };

  const downloadRegulation = () => {
    if (!regulationDoc) return;
    const dataUrl = regulationDoc.fileData?.startsWith('data:')
      ? regulationDoc.fileData
      : `data:${regulationDoc.fileType || 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'};base64,${regulationDoc.fileData}`;
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = regulationDoc.fileName || 'لائحة_النظام_الاساسي.docx';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const filteredArticles = (data?.articles ?? []).filter((a) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      a.title.toLowerCase().includes(q) ||
      a.text.toLowerCase().includes(q) ||
      a.category.toLowerCase().includes(q) ||
      a.keywords.some((k) => k.toLowerCase().includes(q)) ||
      a.articleNo.includes(q)
    );
  });

  const formatValue = (rule: RegulationRule) => {
    if (rule.value === null || rule.value === '') return '—';
    if (typeof rule.value === 'number') return rule.value.toLocaleString('en-US');
    try {
      const parsed = JSON.parse(String(rule.value));
      if (typeof parsed === 'object') {
        return Object.entries(parsed).map(([k, v]) => `${k}: ${v}%`).join('، ');
      }
    } catch {
      /* قيمة نصية */
    }
    return String(rule.value);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-slate-400 text-sm">
        جارٍ تحميل اللائحة المالية...
      </div>
    );
  }

  const active = data?.status.activeRules ?? [];
  const pending = data?.status.pendingRules ?? [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl shadow-lg flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <ScrollText className="w-5 h-5 text-amber-400" />
            <h2 className="text-lg font-bold text-slate-100">اللائحة المالية والرقابة</h2>
          </div>
          <p className="text-xs text-slate-400">
            {data?.document ?? 'اللائحة المالية المرفقة'} — تُنفَّذ القواعد الآلية من نصوص المواد مباشرة حسب حالة الترقيم.
          </p>
        </div>

        <div
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold ${
            data?.status.isEnforcing
              ? 'bg-emerald-950/60 border border-emerald-800/40 text-emerald-300'
              : 'bg-amber-950/60 border border-amber-800/40 text-amber-300'
          }`}
        >
          {data?.status.isEnforcing ? (
            <ShieldCheck className="w-4 h-4" />
          ) : (
            <Clock className="w-4 h-4" />
          )}
          <span>
            {data?.status.isEnforcing
              ? `اللائحة نافذة (${active.length} قاعدة مفعّلة)`
              : 'بانتظار تفعيل القواعد'}
          </span>
        </div>
      </div>

      {/* لائحة النظام الأساسي المؤرشفة */}
      {regulationDoc && (
        <div className="bg-slate-900/90 border border-indigo-800/50 rounded-2xl p-5 shadow-lg overflow-hidden">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-indigo-500/20 text-indigo-400 rounded-xl border border-indigo-500/30">
                <FileText className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-bold text-sm text-white flex items-center gap-2">
                  لائحة النظام الأساسي للنقابة العامة
                  {regulationDoc.isSealed && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 rounded text-[10px] font-semibold">
                      <Lock className="w-3 h-3" />
                      مختومة إلكترونياً
                    </span>
                  )}
                </h3>
                <p className="text-[11px] text-slate-400 mt-1 flex items-center gap-1.5">
                  <span className="font-mono">{regulationDoc.fileName}</span>
                  <span>•</span>
                  <span>{((regulationDoc.fileSize || 0) / 1024 / 1024).toFixed(2)} MB</span>
                  {regulationDoc.sealedBy && (
                    <>
                      <span>•</span>
                      <span>ختم بواسطة: {regulationDoc.sealedBy}</span>
                    </>
                  )}
                </p>
                <p className="text-[10px] font-mono text-slate-500 mt-1 truncate max-w-[420px]">
                  SHA-256: {regulationDoc.sha256}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={downloadRegulation}
                className="px-3.5 py-2 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 text-white font-medium rounded-xl text-xs flex items-center gap-2 transition-all shadow-lg shadow-indigo-950/40"
              >
                <Download className="w-4 h-4" />
                تحميل اللائحة
              </button>
              <button
                onClick={() => setShowDoc(!showDoc)}
                className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium rounded-xl text-xs flex items-center gap-2 transition-all border border-slate-700"
              >
                <Eye className="w-4 h-4" />
                {showDoc ? 'إخفاء المعاينة' : 'معاينة'}
              </button>
            </div>
          </div>

          {showDoc && (
            <div className="mt-4 border-t border-slate-800 pt-4">
              <iframe
                src={regulationDoc.fileData?.startsWith('data:') ? regulationDoc.fileData : `data:${regulationDoc.fileType || 'application/pdf'};base64,${regulationDoc.fileData}`}
                className="w-full h-[480px] rounded-xl border border-slate-800 bg-white"
                title="لائحة النظام الأساسي"
              />
              <p className="text-[10px] text-slate-500 mt-2 flex items-center gap-1.5">
                <Award className="w-3.5 h-3.5 text-amber-400" />
                محفوظة في قاعدة البيانات المركزية PostgreSQL مع بصمة SHA-256 مضادة للتلاعب
              </p>
            </div>
          )}
        </div>
      )}

      {!regulationDoc && !docLoading && (
        <div className="bg-slate-900/70 border border-dashed border-slate-700 rounded-2xl p-4 flex items-center justify-between">
          <p className="text-xs text-slate-400 flex items-center gap-2">
            <Clock className="w-4 h-4 text-slate-500" />
            لم يُرفع ملف لائحة النظام الأساسي بعد. يمكن رفعه من إدارة المستندات.
          </p>
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-950/70 border border-amber-800/40 flex items-center justify-center">
            <Gavel className="w-5 h-5 text-amber-400" />
          </div>
          <div>
            <div className="text-2xl font-extrabold text-slate-100">{data?.status.articlesCount ?? 0}</div>
            <div className="text-[11px] text-slate-400">مادة مُعبأة بالملخص التنفيذي</div>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-950/70 border border-emerald-800/40 flex items-center justify-center">
            <CheckCircle2 className="w-5 h-5 text-emerald-400" />
          </div>
          <div>
            <div className="text-2xl font-extrabold text-slate-100">{active.length}</div>
            <div className="text-[11px] text-slate-400">قاعدة إنفاذ نافذة بقيمة معتمدة</div>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center">
            <Clock className="w-5 h-5 text-slate-400" />
          </div>
          <div>
            <div className="text-2xl font-extrabold text-slate-100">{pending.length}</div>
            <div className="text-[11px] text-slate-400">قاعدة تنتظر القيمة/الاعتماد</div>
          </div>
        </div>
      </div>

      {/* Active rules table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-800 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-emerald-400" />
          <h3 className="font-bold text-sm text-slate-100">القواعد النافذة برمجياً</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead>
              <tr className="text-slate-400 border-b border-slate-800">
                <th className="px-4 py-2.5 font-semibold">القاعدة</th>
                <th className="px-4 py-2.5 font-semibold">المادة</th>
                <th className="px-4 py-2.5 font-semibold">القيمة المعتمدة</th>
                <th className="px-4 py-2.5 font-semibold">الصرامة</th>
              </tr>
            </thead>
            <tbody>
              {active.map((rule) => (
                <tr key={rule.ruleId} className="border-b border-slate-800/60 last:border-0 hover:bg-slate-800/40">
                  <td className="px-4 py-2.5 text-slate-200">
                    <div className="font-mono text-[10px] text-slate-500">{rule.ruleId}</div>
                    <div>{rule.descriptionAr}</div>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="font-mono text-amber-300 bg-amber-950/60 border border-amber-800/40 px-2 py-0.5 rounded">
                      م{rule.articleNo}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 font-mono text-slate-100">{formatValue(rule)}</td>
                  <td className="px-4 py-2.5">
                    {rule.severity === 'BLOCK' ? (
                      <span className="text-rose-300 bg-rose-950/60 border border-rose-800/40 px-2 py-0.5 rounded">مانعة</span>
                    ) : (
                      <span className="text-amber-300 bg-amber-950/60 border border-amber-800/40 px-2 py-0.5 rounded">تحذير</span>
                    )}
                  </td>
                </tr>
              ))}
              {active.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-slate-500">
                    لا توجد قواعد نافذة حالياً.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Search + Articles */}
      <Combobox
        value={searchQuery}
        onChange={setSearchQuery}
        onSelect={(o) => setSearchQuery(o.id as string)}
        placeholder="بحث في مواد اللائحة بالكلمة المفتاحية أو رقم المادة..."
        options={(data?.articles ?? []).map((a) => ({
          id: String(a.articleNo),
          label: `المادة ${a.articleNo}`,
          sub: a.title,
        }))}
        className="relative max-w-md"
        inputClassName="w-full pl-4 pr-10 py-2 bg-slate-900 border border-slate-800 focus:border-amber-500 rounded-xl text-xs text-slate-200 placeholder:text-slate-500 outline-hidden"
      />

      <div className="space-y-3">
        {filteredArticles.map((article) => (
          <div key={article.articleNo} className="bg-slate-900 border border-slate-800 rounded-2xl p-4 hover:border-slate-700 transition-all space-y-2">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <span className="font-mono text-[11px] text-amber-300 font-bold bg-amber-950/70 border border-amber-800/40 px-2 py-0.5 rounded">
                  المادة {article.articleNo}
                </span>
                <h4 className="font-bold text-xs text-slate-100">{article.title}</h4>
              </div>
              <span className="text-[10px] text-slate-500 bg-slate-800 px-2 py-0.5 rounded">{article.category}</span>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">{article.text}</p>
            {article.keywords.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {article.keywords.map((kw) => (
                  <span key={kw} className="text-[10px] text-slate-500 bg-slate-800/80 px-2 py-0.5 rounded">
                    {kw}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
        {filteredArticles.length === 0 && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 text-center text-slate-500 text-xs">
            لا نتائج مطابقة لبحثك.
          </div>
        )}
      </div>
    </div>
  );
};

export default FinancialRegulation;