import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  FolderOpen,
  Search,
  Upload,
  RefreshCw,
  FileText,
  FileSpreadsheet,
  Image as ImageIcon,
  File as FileIcon,
  Download,
  Eye,
  Printer,
  Trash2,
  Pencil,
  X,
  Bot,
  Sparkles,
  Send,
  Mic,
  Square,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  FilePlus2,
  LockIcon,
  LockOpenIcon,
  LayoutGrid,
  List,
  Filter,
  ArrowUpDown,
  Save,
  FileEdit,
  Plus,
  ExternalLink,
} from 'lucide-react';
import { api } from '../services/api.js';
import type { User } from '../types/erp.js';
import { streamGlobalAiChat } from '../services/ai-stream.js';

interface ModelsViewerProps {
  organizationId: string;
  currentUser: User | null;
  onShowToast: (type: 'success' | 'error' | 'warning' | 'info', msg: string) => void;
}

interface ModelFile {
  name: string;
  size: number;
  modifiedAt: string;
  ext: string;
  kind: 'image' | 'pdf' | 'office' | 'text' | 'archive' | 'other';
}

interface ChatMsg {
  role: 'user' | 'assistant';
  text: string;
}

const KIND_META: Record<string, { label: string; icon: React.ComponentType<{ className?: string }>; color: string; bg: string; chip: string }> = {
  image: { label: 'صورة', icon: ImageIcon, color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/30', chip: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' },
  pdf: { label: 'PDF', icon: FileText, color: 'text-rose-400', bg: 'bg-rose-500/10 border-rose-500/30', chip: 'bg-rose-500/15 text-rose-300 border-rose-500/30' },
  office: { label: 'Office', icon: FileSpreadsheet, color: 'text-sky-400', bg: 'bg-sky-500/10 border-sky-500/30', chip: 'bg-sky-500/15 text-sky-300 border-sky-500/30' },
  text: { label: 'نص', icon: FileText, color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/30', chip: 'bg-amber-500/15 text-amber-300 border-amber-500/30' },
  archive: { label: 'أرشيف', icon: FileIcon, color: 'text-violet-400', bg: 'bg-violet-500/10 border-violet-500/30', chip: 'bg-violet-500/15 text-violet-300 border-violet-500/30' },
  other: { label: 'ملف', icon: FileIcon, color: 'text-slate-400', bg: 'bg-slate-500/10 border-slate-500/30', chip: 'bg-slate-500/15 text-slate-300 border-slate-500/30' },
};

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(2)} MB`;
}

const isPreviewable = (kind: string) => kind === 'image' || kind === 'pdf' || kind === 'office' || kind === 'text';
const isTextEditable = (kind: string, ext: string) => kind === 'text' || ['txt','md','csv','json','xml','log'].includes(ext.toLowerCase());

export const ModelsViewer: React.FC<ModelsViewerProps> = ({ organizationId, currentUser, onShowToast }) => {
  const [files, setFiles] = useState<ModelFile[]>([]);
  const [directory, setDirectory] = useState('');
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // View modes
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [kindFilter, setKindFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'name' | 'date' | 'size'>('date');

  // Modals
  const [previewFile, setPreviewFile] = useState<ModelFile | null>(null);
  const [printFile, setPrintFile] = useState<ModelFile | null>(null);
  const [deleteFile, setDeleteFile] = useState<ModelFile | null>(null);
  const [editFile, setEditFile] = useState<ModelFile | null>(null);
  const [editTab, setEditTab] = useState<'preview' | 'text' | 'rename' | 'replace'>('preview');
  const [addOpen, setAddOpen] = useState(false);

  // Upload / edit state
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [newName, setNewName] = useState('');

  // Text editor state
  const [textContent, setTextContent] = useState('');
  const [textLoading, setTextLoading] = useState(false);
  const [textSaving, setTextSaving] = useState(false);
  const [newDocName, setNewDocName] = useState('');
  const [newDocContent, setNewDocContent] = useState('');
  const [newDocSaving, setNewDocSaving] = useState(false);

  // AI Assistant state
  const [aiOpen, setAiOpen] = useState(false);
  const [aiMessages, setAiMessages] = useState<ChatMsg[]>([]);
  const [aiInput, setAiInput] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const recognitionRef = useRef<any>(null);
  const aiBodyRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const contentInputRef = useRef<HTMLInputElement>(null);

  // Lock
  const [locked, setLocked] = useState<boolean>(false);
  const [showUnlock, setShowUnlock] = useState<boolean>(false);
  const [password, setPassword] = useState('');
  const [unlockError, setUnlockError] = useState<string | null>(null);
  const [unlocking, setUnlocking] = useState(false);

  const loadData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const data = await api.getModels();
      setFiles(data.files);
      setDirectory(data.directory);
      const isLockedNow = !!data.locked;
      setLocked(isLockedNow);
      if (isLockedNow && !showUnlock) setShowUnlock(true);
      else if (!isLockedNow) setShowUnlock(false);
    } catch (err) {
      console.error('Failed to load models:', err);
      onShowToast('error', 'تعذر تحميل ملفات النماذج');
    } finally {
      setLoading(false);
    }
  }, [onShowToast, showUnlock]);

  useEffect(() => {
    if (!locked) setShowUnlock(false);
  }, [locked]);

  const handleUnlock = async () => {
    if (!password.trim() || unlocking) return;
    setUnlocking(true);
    setUnlockError(null);
    try {
      const res = await api.unlockModels(password.trim());
      if (res.unlocked) {
        setLocked(false);
        setShowUnlock(false);
        setPassword('');
        onShowToast('success', 'تم فتح مكتبة النماذج');
      } else {
        setUnlockError('كلمة المرور غير صحيحة');
      }
    } catch (err: any) {
      setUnlockError(err?.message || 'تعذر فتح المكتبة');
    } finally {
      setUnlocking(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (aiBodyRef.current) aiBodyRef.current.scrollTop = aiBodyRef.current.scrollHeight;
  }, [aiMessages, aiLoading]);

  useEffect(() => {
    if (!aiOpen) return;
    if (aiMessages.length === 0) {
      const greeting = files.length > 0
        ? `أهلاً بك في لوحة ذكاء مكتبة النماذج. يوجد حالياً ${files.length} ملفاً في المكتبة. اطلب مني مثلاً: «اشرح لي ما هذه النماذج»، أو «ما أفضل نموذج لتقديم استمارة تأمين؟».`
        : `أهلاً بك في لوحة ذكاء مكتبة النماذج. المكتبة فارغة حالياً — يمكنك رفع ملفات بالضغط على زر «إضافة نموذج».`;
      setAiMessages([{ role: 'assistant', text: greeting }]);
    }
  }, [aiOpen, files.length, aiMessages.length]);

  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
        recognitionRef.current = null;
      }
    };
  }, []);

  // Derived filtered + sorted
  const filtered = files.filter((f) => {
    const q = searchQuery.trim().toLowerCase();
    const matchesSearch = !q || f.name.toLowerCase().includes(q) || (KIND_META[f.kind]?.label.toLowerCase().includes(q));
    const matchesKind = kindFilter === 'all' || f.kind === kindFilter;
    return matchesSearch && matchesKind;
  }).sort((a,b)=>{
    if (sortBy === 'name') return a.name.localeCompare(b.name, 'ar');
    if (sortBy === 'size') return b.size - a.size;
    return new Date(b.modifiedAt).getTime() - new Date(a.modifiedAt).getTime();
  });

  const guardUnlock = useCallback((): boolean => {
    if (locked) {
      setShowUnlock(true);
      onShowToast('info', 'مكتبة النماذج مقفلة — أدخل كلمة المرور أولاً');
      return false;
    }
    return true;
  }, [locked, onShowToast]);

  const openPreview = useCallback((f: ModelFile) => {
    if (!guardUnlock()) return;
    setEditTab(isTextEditable(f.kind, f.ext) ? 'text' : 'preview');
    setPreviewFile(f);
    if (isTextEditable(f.kind, f.ext)) {
      loadTextFileContent(f);
    }
  }, [guardUnlock]);

  const openPrint = useCallback((f: ModelFile) => {
    if (!guardUnlock()) return;
    setPrintFile(f);
  }, [guardUnlock]);

  const openDownload = useCallback((f: ModelFile) => {
    if (!guardUnlock()) return;
    window.open(api.modelDownloadUrl(f.name), '_blank');
  }, [guardUnlock]);

  const handleUploadFile = async (file: File) => {
    if (!guardUnlock()) return;
    setUploading(true);
    try {
      const base64 = await fileToBase64(file);
      const info = await api.uploadModel(file.name, base64);
      onShowToast('success', `تمت إضافة النموذج «${info.name}»`);
      setAddOpen(false);
      loadData(true);
    } catch (err: any) {
      onShowToast('error', err?.message || 'تعذر رفع الملف');
    } finally {
      setUploading(false);
    }
  };

  const handleReplaceContent = async (file: ModelFile, blob: File) => {
    if (!guardUnlock()) return;
    setUploading(true);
    try {
      const base64 = await fileToBase64(blob);
      await api.replaceModelContent(file.name, base64);
      onShowToast('success', `تم تحديث محتوى «${file.name}»`);
      setEditFile(null);
      loadData(true);
    } catch (err: any) {
      onShowToast('error', err?.message || 'تعذر تحديث المحتوى');
    } finally {
      setUploading(false);
    }
  };

  const handleRename = async () => {
    if (!editFile || !newName.trim()) return;
    setRenaming(true);
    try {
      await api.renameModel(editFile.name, newName.trim());
      onShowToast('success', 'تمت إعادة تسمية النموذج');
      setEditFile(null);
      setNewName('');
      loadData(true);
    } catch (err: any) {
      onShowToast('error', err?.message || 'تعذر إعادة التسمية');
    } finally {
      setRenaming(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteFile) return;
    setDeleting(true);
    try {
      await api.deleteModel(deleteFile.name);
      onShowToast('success', `تم حذف «${deleteFile.name}»`);
      setDeleteFile(null);
      loadData(true);
    } catch (err: any) {
      onShowToast('error', err?.message || 'تعذر حذف الملف');
    } finally {
      setDeleting(false);
    }
  };

  const handleOpenInDefaultApp = async (file: ModelFile) => {
    if (!guardUnlock()) return;
    try {
      const res = await api.openModel(file.name);
      if (res.opened) {
        onShowToast('info', `تم فتح «${file.name}» بالبرنامج الافتراضي`);
      } else if (res.fallback === 'download') {
        window.open(api.modelDownloadUrl(file.name), '_blank');
        onShowToast('info', 'جارٍ تنزيل الملف لفتحه وطباعته ببرنامجه');
      } else if (res.temp) {
        onShowToast('info', 'الملف جاهز في مكان مؤقت — التعديل لا يُحفظ إلا عبر رفع نسخة محدثة');
      }
    } catch (err: any) {
      if (err?.status === 423) {
        setLocked(true);
        setShowUnlock(true);
        onShowToast('info', 'مكتبة النماذج مقفلة — أدخل كلمة المرور');
      } else {
        onShowToast('error', err?.message || 'تعذر فتح الملف');
      }
    }
  };

  // ===== Text Editor inside screen =====
  const loadTextFileContent = async (file: ModelFile) => {
    setTextLoading(true);
    setTextContent('');
    try {
      const res = await fetch(api.modelDownloadUrl(file.name));
      if (!res.ok) throw new Error('فشل تحميل المحتوى');
      const buf = await res.arrayBuffer();
      const text = new TextDecoder('utf-8').decode(buf);
      // If binary (too many null chars) warn
      if (text.includes('\u0000')) {
        setTextContent('⚠️ هذا الملف ثنائي لا يمكن تحريره كنص. استخدم استبدال الملف.');
      } else {
        setTextContent(text.slice(0, 200000)); // limit 200k chars
      }
    } catch (e: any) {
      setTextContent(`خطأ في تحميل الملف: ${e.message}`);
    } finally {
      setTextLoading(false);
    }
  };

  const saveTextContent = async () => {
    if (!previewFile) return;
    if (!isTextEditable(previewFile.kind, previewFile.ext)) {
      onShowToast('warning', 'هذا النوع لا يدعم التحرير النصي المباشر');
      return;
    }
    setTextSaving(true);
    try {
      const base64 = btoa(unescape(encodeURIComponent(textContent)));
      await api.replaceModelContent(previewFile.name, base64);
      onShowToast('success', `تم حفظ تعديلات «${previewFile.name}»`);
      loadData(true);
    } catch (err: any) {
      onShowToast('error', err?.message || 'تعذر حفظ المحتوى');
    } finally {
      setTextSaving(false);
    }
  };

  const handleCreateTextDoc = async () => {
    if (!newDocName.trim()) {
      onShowToast('warning', 'أدخل اسم الملف أولاً');
      return;
    }
    let name = newDocName.trim();
    if (!name.includes('.')) name += '.txt';
    setNewDocSaving(true);
    try {
      const base64 = btoa(unescape(encodeURIComponent(newDocContent || '')));
      await api.uploadModel(name, base64);
      onShowToast('success', `تم إنشاء «${name}»`);
      setNewDocName('');
      setNewDocContent('');
      setAddOpen(false);
      loadData(true);
    } catch (err: any) {
      onShowToast('error', err?.message || 'تعذر إنشاء الملف');
    } finally {
      setNewDocSaving(false);
    }
  };

  // ===== AI =====
  const sendAi = async (text?: string) => {
    const bodyText = (text ?? aiInput).trim();
    if (!bodyText || aiLoading) return;
    setAiMessages((m) => [...m, { role: 'user', text: bodyText }]);
    setAiInput('');
    setAiLoading(true);
    try {
      const history = aiMessages.map((m) => ({ role: m.role, text: m.text }));
      const contextNote = files.length
        ? `لدى النقابة مكتبة نماذج تحتوي هذه الملفات (الاسم — النوع): ${files
            .map((f) => `${f.name} (${KIND_META[f.kind]?.label || f.kind})`)
            .join('، ')}.`
        : 'مكتبة النماذج فارغة حالياً.';
      const assistantText = await streamGlobalAiChat(
        { message: `${contextNote}\n\nسؤال المستخدم: ${bodyText}`, organizationId: organizationId || undefined, history },
        {}
      );
      setAiMessages((m) => [...m, { role: 'assistant', text: assistantText || 'تمت المعالجة.' }]);
    } catch (err: any) {
      setAiMessages((m) => [...m, { role: 'assistant', text: `حدث خطأ: ${err.message || 'غير معروف'}` }]);
    } finally {
      setAiLoading(false);
    }
  };

  const handleVoiceToggle = () => {
    setVoiceError(null);
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      return;
    }
    recognitionRef.current?.abort();
    recognitionRef.current = null;
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      const recognition = new SpeechRecognition();
      recognition.lang = 'ar-EG';
      recognition.continuous = true;
      recognition.interimResults = false;
      let spoken = '';
      recognitionRef.current = recognition;
      setIsListening(true);
      recognition.onresult = (event: any) => {
        let t = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          if (event.results[i].isFinal || event.results[i].length) t += event.results[i][0].transcript + ' ';
        }
        if (t.trim()) spoken = (spoken + ' ' + t).trim();
      };
      recognition.onend = () => {
        recognitionRef.current = null;
        setIsListening(false);
        if (spoken.trim()) sendAi(spoken.trim());
      };
      recognition.onerror = (event: any) => {
        recognitionRef.current = null;
        setIsListening(false);
        if (event.error === 'not-allowed' || event.error === 'service-not-allowed')
          setVoiceError('تم رفض إذن الميكروفون');
        else if (event.error !== 'aborted') setVoiceError(`فشل التقاط الصوت: ${event.error}`);
      };
      try {
        recognition.start();
      } catch (err: any) {
        recognitionRef.current = null;
        setIsListening(false);
        setVoiceError(err?.message || 'تعذر بدء التعرف الصوتي.');
      }
    } else {
      setVoiceError('التعرف الصوتي غير مدعوم في هذا المتصفح.');
    }
  };

  const totalSize = files.reduce((s, f) => s + f.size, 0);
  const kindCounts = files.reduce((acc: Record<string, number>, f)=>{ acc[f.kind]=(acc[f.kind]||0)+1; return acc; }, {} as any);

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-2xl bg-indigo-500/15 flex items-center justify-center border border-indigo-500/20">
            <FolderOpen className="h-6 w-6 text-indigo-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">مكتبة النماذج والمستندات</h1>
            <p className="text-sm text-slate-400">
              عرض أوضح للملفات — تحرير نصي مباشر، إعادة تسمية، استبدال، طباعة، ومساعد ذكي
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => loadData()}
            className="inline-flex items-center gap-2 px-3 py-2 text-sm rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 transition"
          >
            <RefreshCw className="w-4 h-4" />
            تحديث
          </button>
          <button
            onClick={() => {
              if (locked) {
                setShowUnlock(true);
              } else {
                api.lockModels().then(() => {
                  setLocked(true);
                  onShowToast('info', 'تم قفل مكتبة النماذج');
                });
              }
            }}
            className={`inline-flex items-center gap-2 px-3 py-2 text-sm rounded-xl border transition ${
              locked
                ? 'bg-amber-950/40 hover:bg-amber-900/60 border-amber-700/50 text-amber-300'
                : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-300'
            }`}
          >
            {locked ? <LockIcon className="w-4 h-4" /> : <LockOpenIcon className="w-4 h-4" />}
            {locked ? 'مقفلة' : 'قفل'}
          </button>
          <button
            onClick={() => setAiOpen((o) => !o)}
            className={`inline-flex items-center gap-2 px-3 py-2 text-sm rounded-xl border transition ${
              aiOpen
                ? 'bg-purple-600 border-purple-500 text-white'
                : 'bg-purple-950/50 hover:bg-purple-900/70 border-purple-700/50 text-purple-300'
            }`}
          >
            <Bot className="w-4 h-4" />
            المساعد
          </button>
          <button
            onClick={() => {
              if (!guardUnlock()) return;
              setAddOpen(true);
            }}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white transition shadow-lg shadow-indigo-600/20"
          >
            <Upload className="w-4 h-4" />
            إضافة نموذج
          </button>
        </div>
      </div>

      {/* Stats + Filters */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="rounded-xl bg-slate-900 border border-slate-800 px-4 py-3">
          <div className="text-2xl font-bold text-indigo-300 font-mono">{files.length}</div>
          <div className="text-[11px] text-slate-400">إجمالي الملفات</div>
        </div>
        <div className="rounded-xl bg-slate-900 border border-slate-800 px-4 py-3">
          <div className="text-2xl font-bold text-sky-300 font-mono">{formatSize(totalSize)}</div>
          <div className="text-[11px] text-slate-400">الحجم الإجمالي</div>
        </div>
        <div className="rounded-xl bg-slate-900 border border-slate-800 px-4 py-3">
          <div className="text-2xl font-bold text-emerald-300 font-mono">{kindCounts['office']||0}</div>
          <div className="text-[11px] text-slate-400">Office</div>
        </div>
        <div className="rounded-xl bg-slate-900 border border-slate-800 px-4 py-3">
          <div className="text-2xl font-bold text-amber-300 font-mono">{kindCounts['text']||0}</div>
          <div className="text-[11px] text-slate-400">نصية قابلة للتحرير</div>
        </div>
        <div className="rounded-xl bg-slate-900 border border-slate-800 px-4 py-3 cursor-default" title={directory}>
          <div className="text-[13px] font-bold text-slate-200 truncate">{directory.split(/[\\/]/).slice(-2).join('/') || 'نماذج'}</div>
          <div className="text-[11px] text-slate-400">المسار المصدر</div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col md:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="ابحث باسم الملف أو النوع..."
            className="w-full pr-10 pl-4 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-slate-200 text-sm focus:outline-none focus:border-indigo-500 placeholder:text-slate-500"
          />
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-900 border border-slate-800">
            <button onClick={()=>setViewMode('grid')} className={`p-2 rounded-lg transition ${viewMode==='grid' ? 'bg-slate-800 text-indigo-300' : 'text-slate-400 hover:text-slate-200'}`} title="شبكة"><LayoutGrid className="w-4 h-4" /></button>
            <button onClick={()=>setViewMode('list')} className={`p-2 rounded-lg transition ${viewMode==='list' ? 'bg-slate-800 text-indigo-300' : 'text-slate-400 hover:text-slate-200'}`} title="قائمة"><List className="w-4 h-4" /></button>
          </div>
          <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-900 border border-slate-800">
            <Filter className="w-3.5 h-3.5 text-slate-500 mr-1" />
            <select value={kindFilter} onChange={(e)=>setKindFilter(e.target.value)} className="bg-transparent text-xs text-slate-300 focus:outline-none">
              <option value="all">الكل</option>
              <option value="office">Office</option>
              <option value="pdf">PDF</option>
              <option value="image">صور</option>
              <option value="text">نصوص</option>
              <option value="archive">أرشيف</option>
            </select>
          </div>
          <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-900 border border-slate-800">
            <ArrowUpDown className="w-3.5 h-3.5 text-slate-500 mr-1" />
            <select value={sortBy} onChange={(e)=>setSortBy(e.target.value as any)} className="bg-transparent text-xs text-slate-300 focus:outline-none">
              <option value="date">الأحدث</option>
              <option value="name">الاسم</option>
              <option value="size">الحجم</option>
            </select>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
        {/* Main */}
        <div className={`space-y-3 ${aiOpen ? 'lg:col-span-2' : 'lg:col-span-3'}`}>
          <div className="flex items-center justify-between">
            <div className="text-[11px] text-slate-400 font-mono">{filtered.length} من أصل {files.length} ملفاً {kindFilter!=='all' ? `· فلتر: ${kindFilter}` : ''}</div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-slate-500">التعديل الداخلي متاح للملفات النصية</span>
              <FileEdit className="w-3.5 h-3.5 text-amber-400" />
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="animate-spin h-8 w-8 border-2 border-indigo-500 border-t-transparent rounded-full" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center bg-slate-900/50 border border-slate-800 rounded-xl">
              <FolderOpen className="h-12 w-12 text-slate-700 mb-3" />
              <p className="text-slate-400">{files.length === 0 ? 'المكتبة فارغة — أضف أول نموذج' : 'لا توجد نتائج مطابقة'}</p>
              <button onClick={()=>setAddOpen(true)} className="mt-3 inline-flex items-center gap-2 px-3 py-1.5 text-xs rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white"><Plus className="w-3.5 h-3.5"/> إضافة ملف</button>
            </div>
          ) : viewMode === 'grid' ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
              {filtered.map((f)=>{
                const meta = KIND_META[f.kind] || KIND_META.other;
                const Icon = meta.icon;
                const editable = isTextEditable(f.kind, f.ext);
                return (
                  <div key={f.name} className="group rounded-xl bg-slate-900 border border-slate-800 hover:border-indigo-600/40 overflow-hidden transition shadow-sm hover:shadow-indigo-900/20">
                    <div className="p-3 flex items-start gap-3">
                      <div className={`h-11 w-11 rounded-xl border flex items-center justify-center shrink-0 ${meta.bg}`}>
                        <Icon className={`h-5 w-5 ${meta.color}`} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-[13px] font-bold text-slate-100 truncate" title={f.name}>{f.name}</div>
                        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                          <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-mono border ${meta.chip}`}>{f.ext || 'file'} · {meta.label}</span>
                          {editable && <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] bg-amber-500/15 text-amber-300 border border-amber-500/30"><FileEdit className="w-3 h-3"/> قابل للتحرير</span>}
                        </div>
                        <div className="text-[10px] text-slate-500 mt-1 font-mono flex items-center gap-2">
                          <span>{formatSize(f.size)}</span><span>·</span><span>{new Date(f.modifiedAt).toLocaleDateString('ar-EG')}</span>
                        </div>
                      </div>
                    </div>
                    <div className="px-2 py-2 bg-slate-950/50 border-t border-slate-800 flex items-center justify-between gap-1">
                      <div className="flex items-center gap-1">
                        <button title="عرض وتحرير داخلي" onClick={()=>{ setEditFile(f); setNewName(f.name); setEditTab(editable ? 'text' : 'preview'); if(editable) loadTextFileContent(f); else setPreviewFile(f); }} className="p-1.5 rounded-lg text-slate-400 hover:text-sky-300 hover:bg-slate-800 transition"><Eye className="w-4 h-4" /></button>
                        <button title="طباعة" onClick={()=>openPrint(f)} className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-300 hover:bg-slate-800 transition"><Printer className="w-4 h-4" /></button>
                        <button title="تنزيل" onClick={()=>openDownload(f)} className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-300 hover:bg-slate-800 transition"><Download className="w-4 h-4" /></button>
                        <button title="فتح بالبرنامج الافتراضي" onClick={()=>handleOpenInDefaultApp(f)} className="p-1.5 rounded-lg text-slate-400 hover:text-purple-300 hover:bg-slate-800 transition"><ExternalLink className="w-4 h-4" /></button>
                      </div>
                      <div className="flex items-center gap-1">
                        <button title="تعديل (إعادة تسمية/استبدال/تحرير نصي)" onClick={()=>{ setEditFile(f); setNewName(f.name); setEditTab(editable ? 'text' : 'rename'); if(editable) loadTextFileContent(f); }} className="p-1.5 rounded-lg text-slate-400 hover:text-amber-300 hover:bg-slate-800 transition"><Pencil className="w-4 h-4" /></button>
                        <button title="حذف" onClick={()=>setDeleteFile(f)} className="p-1.5 rounded-lg text-slate-400 hover:text-rose-300 hover:bg-slate-800 transition"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="rounded-xl bg-slate-900 border border-slate-800 overflow-hidden">
              <table className="w-full text-right text-sm">
                <thead className="bg-[#1e293b] text-[11px] text-slate-400 font-mono uppercase">
                  <tr>
                    <th className="px-4 py-2.5 font-semibold">الملف</th>
                    <th className="px-3 py-2.5 font-semibold hidden md:table-cell">النوع</th>
                    <th className="px-3 py-2.5 font-semibold hidden md:table-cell">الحجم</th>
                    <th className="px-3 py-2.5 font-semibold hidden sm:table-cell">آخر تعديل</th>
                    <th className="px-3 py-2.5 font-semibold text-left">إجراءات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {filtered.map((f) => {
                    const meta = KIND_META[f.kind] || KIND_META.other;
                    const Icon = meta.icon;
                    const editable = isTextEditable(f.kind, f.ext);
                    return (
                      <tr key={f.name} className="hover:bg-slate-800/40 transition">
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-2.5">
                            <div className={`h-9 w-9 rounded-lg border flex items-center justify-center shrink-0 ${meta.bg}`}>
                              <Icon className={`h-4.5 w-4.5 ${meta.color}`} />
                            </div>
                            <div className="min-w-0">
                              <div className="text-[13px] font-semibold text-slate-100 truncate max-w-[260px] flex items-center gap-1.5">
                                {f.name}
                                {editable && <FileEdit className="w-3 h-3 text-amber-400" />}
                              </div>
                              <span className={`text-[9px] font-mono text-slate-400 bg-slate-800 px-1 py-px rounded`}> .{f.ext || 'file'} </span>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-2.5 hidden md:table-cell"><span className={`text-[10px] px-2 py-0.5 rounded-full border ${meta.chip}`}>{meta.label}</span></td>
                        <td className="px-3 py-2.5 text-[12px] font-mono text-slate-400 hidden md:table-cell">{formatSize(f.size)}</td>
                        <td className="px-3 py-2.5 text-[11px] text-slate-400 hidden sm:table-cell">{new Date(f.modifiedAt).toLocaleDateString('ar-EG')}</td>
                        <td className="px-3 py-2.5">
                          <div className="flex items-center justify-end gap-1">
                            <button title="عرض/تحرير داخلي" onClick={() => { setEditFile(f); setNewName(f.name); setEditTab(editable ? 'text' : 'preview'); if(editable) loadTextFileContent(f); else setPreviewFile(f); }} className="p-1.5 rounded-lg text-slate-400 hover:text-sky-300 hover:bg-slate-800 transition"><Eye className="w-4 h-4" /></button>
                            <button title="طباعة" onClick={() => openPrint(f)} className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-300 hover:bg-slate-800 transition"><Printer className="w-4 h-4" /></button>
                            <button title="تنزيل" onClick={() => openDownload(f)} className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-300 hover:bg-slate-800 transition"><Download className="w-4 h-4" /></button>
                            <button title="تعديل" onClick={() => { setEditFile(f); setNewName(f.name); setEditTab(editable ? 'text' : 'rename'); if(editable) loadTextFileContent(f); }} className="p-1.5 rounded-lg text-slate-400 hover:text-purple-300 hover:bg-slate-800 transition"><Pencil className="w-4 h-4" /></button>
                            <button title="حذف" onClick={() => setDeleteFile(f)} className="p-1.5 rounded-lg text-slate-400 hover:text-rose-300 hover:bg-slate-800 transition"><Trash2 className="w-4 h-4" /></button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* AI Assistant Panel */}
        {aiOpen && (
          <aside className="rounded-xl bg-[#1e293b] border border-purple-800/40 overflow-hidden lg:col-span-1 sticky top-4">
            <div className="px-3 py-2.5 bg-[#1e1b2e] border-b border-purple-800/40 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-purple-600/20 border border-purple-500/40 flex items-center justify-center text-purple-300">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-slate-100">مساعد مكتبة النماذج</h4>
                  <span className="text-[10px] text-slate-400">يساعدك في عرض واختيار النماذج الذكية</span>
                </div>
              </div>
              <button onClick={() => setAiOpen(false)} className="p-1 text-slate-400 hover:text-white rounded"><X className="w-4 h-4" /></button>
            </div>

            <div ref={aiBodyRef} className="max-h-[420px] overflow-y-auto p-3 space-y-2.5 bg-[#151321]">
              {aiMessages.map((m, i) => (
                <div key={i} className={`flex ${m.role === 'user' ? 'justify-start' : 'justify-end'}`}>
                  <div className={`max-w-[90%] px-3 py-2 rounded-xl text-xs whitespace-pre-wrap ${m.role === 'user' ? 'bg-slate-800 text-slate-200 border border-[#334155]' : 'bg-purple-900/40 text-purple-100 border border-purple-800/40'}`}>{m.text}</div>
                </div>
              ))}
              {aiLoading && (
                <div className="flex justify-end">
                  <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-purple-900/40 border border-purple-800/40 text-purple-200 text-xs"><Loader2 className="w-3.5 h-3.5 animate-spin" />يكتب...</div>
                </div>
              )}
            </div>

            <div className="p-3 border-t border-purple-800/40 bg-[#1e1b2e]">
              <div className="flex items-center gap-2">
                <input value={aiInput} onChange={(e) => setAiInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') sendAi(); }} placeholder={isListening ? 'أستمع إليك...' : 'اسأل عن النماذج...'} disabled={aiLoading || isListening} className="flex-1 px-3 py-2 rounded-lg bg-[#151321] border border-purple-900/50 focus:border-purple-500/60 focus:outline-none text-xs text-slate-200 placeholder:text-slate-500 disabled:opacity-50" />
                <button type="button" onClick={handleVoiceToggle} disabled={aiLoading} title="إدخال صوتي" className={`w-9 h-9 flex items-center justify-center rounded-lg border shrink-0 transition-colors ${isListening ? 'bg-rose-600 border-rose-500 text-white animate-pulse' : 'bg-slate-800 border-[#334155] hover:border-rose-500/50 text-slate-300 hover:text-rose-300'} disabled:opacity-40 disabled:cursor-not-allowed`}>{isListening ? <Square className="w-4 h-4" /> : <Mic className="w-4 h-4" />}</button>
                <button type="button" onClick={() => sendAi()} disabled={aiLoading || !aiInput.trim()} className="w-9 h-9 flex items-center justify-center rounded-lg bg-purple-600 hover:bg-purple-500 disabled:opacity-40 disabled:cursor-not-allowed text-white shrink-0"><Send className="w-4 h-4" /></button>
              </div>
              {isListening && (<p className="mt-1.5 text-[10px] text-rose-300 flex items-center gap-1 justify-center"><span className="w-1.5 h-1.5 rounded-full bg-rose-400 animate-pulse" />جارٍ الاستماع... تحدث ثم اضغط ◼️</p>)}
              {voiceError && !isListening && <p className="mt-1.5 text-[10px] text-rose-400 text-center">{voiceError}</p>}
            </div>
          </aside>
        )}
      </div>

      {/* Add New Modal */}
      {addOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/70 backdrop-blur-xs overflow-y-auto">
          <div className="relative w-full max-w-lg bg-[#1e293b] border border-[#334155] text-slate-100 rounded-2xl shadow-2xl overflow-hidden my-4">
            <div className="flex items-center justify-between px-4 py-3 border-b border-[#334155] bg-[#1e293b]">
              <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2"><FilePlus2 className="w-4 h-4 text-indigo-400"/> إضافة نموذج جديد</h3>
              <button onClick={() => setAddOpen(false)} className="p-1 text-slate-400 hover:text-slate-100 hover:bg-slate-800 rounded"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-4 bg-[#0f172a] space-y-4 max-h-[70vh] overflow-y-auto">
              <div className="grid grid-cols-2 gap-2">
                <button onClick={()=>fileInputRef.current?.click()} className="flex flex-col items-center gap-2 p-4 rounded-xl bg-slate-900 border border-slate-700 hover:border-indigo-500/50 hover:bg-slate-800 transition">
                  <Upload className="w-6 h-6 text-indigo-400"/>
                  <span className="text-xs font-bold text-slate-200">رفع ملف من الجهاز</span>
                  <span className="text-[10px] text-slate-500">PDF, Word, Excel, صورة...</span>
                </button>
                <div className="flex flex-col items-center gap-2 p-4 rounded-xl bg-amber-950/20 border border-amber-700/30">
                  <FileEdit className="w-6 h-6 text-amber-400"/>
                  <span className="text-xs font-bold text-amber-200">مستند نصي جديد</span>
                  <span className="text-[10px] text-amber-300/60">إنشاء وتحرير داخل الشاشة</span>
                </div>
              </div>

              <div className="border-t border-slate-800 pt-4 space-y-3">
                <label className="text-[11px] font-mono text-slate-400 uppercase flex items-center gap-2"><FileText className="w-3.5 h-3.5"/> إنشاء مستند نصي جديد (تحرير داخلي)</label>
                <input value={newDocName} onChange={(e)=>setNewDocName(e.target.value)} placeholder="اسم الملف مثلاً: نموذج-طلب.txt" className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-200 text-sm focus:outline-none focus:border-amber-500 placeholder:text-slate-500" />
                <textarea value={newDocContent} onChange={(e)=>setNewDocContent(e.target.value)} placeholder="اكتب محتوى المستند هنا... يدعم العربية بالكامل ويمكنك تعديله لاحقاً من الشاشة" rows={6} className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-200 text-sm focus:outline-none focus:border-amber-500 placeholder:text-slate-500 resize-y font-mono" />
                <button onClick={handleCreateTextDoc} disabled={newDocSaving || !newDocName.trim()} className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-bold"><Save className="w-4 h-4"/>{newDocSaving ? 'جارٍ الحفظ...' : 'إنشاء وحفظ المستند'}</button>
              </div>

              <input ref={fileInputRef} type="file" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUploadFile(f); e.target.value=''; }} />
            </div>
          </div>
        </div>
      )}

      {/* Unlock Modal */}
      {showUnlock && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
          <div className="w-full max-w-sm bg-[#1e293b] border border-indigo-600/40 rounded-2xl shadow-2xl p-5 space-y-4">
            <div className="flex items-center gap-3">
              <div className="h-11 w-11 rounded-2xl bg-indigo-500/15 flex items-center justify-center"><LockIcon className="h-5 w-5 text-indigo-400" /></div>
              <div><h3 className="text-sm font-bold text-slate-100">مكتبة النماذج مقفلة</h3><p className="text-[11px] text-slate-400">أدخل كلمة المرور لعرض ومعاينة الملفات</p></div>
            </div>
            <div className="space-y-1.5">
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') handleUnlock(); }} autoFocus placeholder="كلمة مرور مكتبة النماذج" className="w-full px-3 py-2.5 rounded-lg bg-[#151321] border border-[#334155] focus:border-indigo-500 focus:outline-none text-sm text-slate-200 placeholder:text-slate-500" />
              {unlockError && (<p className="text-[11px] text-rose-400 flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5" />{unlockError}</p>)}
            </div>
            <div className="flex items-center gap-2 pt-1">
              <button onClick={handleUnlock} disabled={unlocking || !password.trim()} className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-xs font-bold text-white">{unlocking ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <LockOpenIcon className="w-3.5 h-3.5" />}فتح المكتبة</button>
              <button onClick={() => setShowUnlock(false)} disabled={unlocking} className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-[#334155] text-xs text-slate-300 disabled:opacity-40">إغلاق</button>
            </div>
            <p className="text-[10px] text-slate-500 leading-relaxed">كلمة المرور تُستخدم لفك تشفير الملفات أثناء العرض ولا تُخزَّن أو تُرفع مع المشروع على GitHub.</p>
          </div>
        </div>
      )}

      {/* Preview / Edit Modal — محرر داخلي متكامل */}
      {(previewFile || editFile) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/70 backdrop-blur-xs overflow-y-auto">
          <div className="relative w-full max-w-5xl bg-[#1e293b] border border-[#334155] text-slate-100 rounded-2xl shadow-2xl overflow-hidden my-4 flex flex-col max-h-[90vh]">
            {(() => {
              const f = (editFile || previewFile)!;
              const meta = KIND_META[f.kind] || KIND_META.other;
              const editable = isTextEditable(f.kind, f.ext);
              return (
                <>
                  <div className="flex items-center justify-between px-4 py-2.5 border-b border-[#334155] bg-[#1e293b] shrink-0">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`h-9 w-9 rounded-lg border flex items-center justify-center ${meta.bg}`}><meta.icon className={`h-4.5 w-4.5 ${meta.color}`} /></div>
                      <div className="min-w-0">
                        <h3 className="text-sm font-bold text-slate-100 truncate max-w-[320px]">{f.name}</h3>
                        <p className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-2"><span>{meta.label} · {formatSize(f.size)} · {new Date(f.modifiedAt).toLocaleDateString('ar-EG')}</span>{editable && <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30 text-[9px]"><FileEdit className="w-3 h-3"/>قابل للتحرير داخلياً</span>}</p>
                      </div>
                    </div>
                    <button onClick={() => { setPreviewFile(null); setEditFile(null); setTextContent(''); }} className="p-1.5 text-slate-400 hover:text-slate-100 hover:bg-slate-800 rounded-lg transition"><X className="w-4 h-4" /></button>
                  </div>

                  {/* Tabs */}
                  <div className="flex items-center gap-1 px-3 py-2 bg-[#0f172a] border-b border-slate-800 shrink-0 overflow-x-auto">
                    <button onClick={()=>{ setEditTab('preview'); if(!previewFile) setPreviewFile(f); }} className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${editTab==='preview' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-slate-200'}`}><Eye className="w-3.5 h-3.5 inline ml-1"/> معاينة</button>
                    {editable && <button onClick={()=>{ setEditTab('text'); loadTextFileContent(f); }} className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${editTab==='text' ? 'bg-amber-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-slate-200'}`}><FileEdit className="w-3.5 h-3.5 inline ml-1"/> تحرير نصي داخلي</button>}
                    <button onClick={()=>setEditTab('rename')} className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${editTab==='rename' ? 'bg-purple-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-slate-200'}`}><Pencil className="w-3.5 h-3.5 inline ml-1"/> إعادة تسمية</button>
                    <button onClick={()=>setEditTab('replace')} className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${editTab==='replace' ? 'bg-sky-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-slate-200'}`}><Upload className="w-3.5 h-3.5 inline ml-1"/> استبدال الملف</button>
                    <div className="mr-auto flex items-center gap-1">
                      <button onClick={()=>handleOpenInDefaultApp(f)} className="px-2.5 py-1.5 rounded-lg text-[11px] bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 flex items-center gap-1"><ExternalLink className="w-3 h-3"/> فتح خارجي</button>
                      <button onClick={()=>window.open(api.modelDownloadUrl(f.name), '_blank')} className="px-2.5 py-1.5 rounded-lg text-[11px] bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 flex items-center gap-1"><Download className="w-3 h-3"/> تنزيل</button>
                    </div>
                  </div>

                  <div className="flex-1 overflow-auto bg-[#0f172a] p-4">
                    {editTab === 'preview' && (
                      <>
                        {isPreviewable(f.kind) ? (
                          <>
                            <iframe src={api.modelViewUrl(f.name)} title={f.name} className="w-full h-[60vh] bg-white rounded-xl border border-slate-700" />
                            {f.kind === 'office' && <p className="mt-2 text-[11px] text-slate-400 text-center">يُعرض النموذج معرّباً كـ PDF. لتحرير النسخة الأصلية اضغط «فتح خارجي» أو «استبدال الملف».</p>}
                          </>
                        ) : (
                          <div className="py-16 flex flex-col items-center gap-3 text-center">
                            <FilePlus2 className="h-12 w-12 text-slate-600" />
                            <p className="text-sm text-slate-300">هذا النوع ({f.ext}) لا يُعرض داخل الشاشة.</p>
                            <p className="text-xs text-slate-400">نزّله أو افتحه بالبرنامج الافتراضي للمعاينة والطباعة.</p>
                            <div className="flex items-center gap-2 mt-1">
                              <button onClick={()=>setPrintFile(f)} className="inline-flex items-center gap-2 px-4 py-2 text-xs rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white"><Printer className="w-4 h-4" /> طباعة / فتح</button>
                              <button onClick={()=>window.open(api.modelDownloadUrl(f.name), '_blank')} className="inline-flex items-center gap-2 px-4 py-2 text-xs rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200"><Download className="w-4 h-4" /> تنزيل</button>
                            </div>
                          </div>
                        )}
                      </>
                    )}

                    {editTab === 'text' && (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <label className="text-[11px] font-mono text-amber-300 uppercase flex items-center gap-2"><FileEdit className="w-4 h-4"/> محرر نصي داخلي — {f.name}</label>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] text-slate-500">{textContent.length} حرفاً</span>
                            <button onClick={saveTextContent} disabled={textSaving || textLoading} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 disabled:opacity-40 text-white text-xs font-bold"><Save className="w-3.5 h-3.5"/>{textSaving ? 'يحفظ...' : 'حفظ التعديلات'}</button>
                          </div>
                        </div>
                        {textLoading ? (
                          <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 text-amber-400 animate-spin" /></div>
                        ) : (
                          <textarea value={textContent} onChange={(e)=>setTextContent(e.target.value)} placeholder="محتوى الملف..." className="w-full h-[50vh] px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-slate-200 text-sm focus:outline-none focus:border-amber-500 placeholder:text-slate-500 resize-y font-mono leading-relaxed" dir="auto" />
                        )}
                        <p className="text-[10px] text-slate-500">💡 يتم حفظ التعديلات مباشرة في مجلد «نماذج» مع الحفاظ على التشفير إن كانت المكتبة مقفلة. للملفات الثنائية استخدم تبويب «استبدال الملف».</p>
                      </div>
                    )}

                    {editTab === 'rename' && (
                      <div className="max-w-md mx-auto space-y-4 py-6">
                        <label className="text-[11px] font-mono text-slate-400 uppercase">إعادة تسمية الملف</label>
                        <input value={newName} onChange={(e) => setNewName(e.target.value)} className="w-full px-3 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-slate-200 text-sm focus:outline-none focus:border-purple-500" />
                        <button onClick={handleRename} disabled={renaming || !newName.trim() || newName.trim() === f.name} className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold">{renaming ? <Loader2 className="w-4 h-4 animate-spin" /> : <Pencil className="w-4 h-4" />}حفظ الاسم الجديد</button>
                        <p className="text-[11px] text-slate-500 text-center">الامتداد مهم — لا تحذف .pdf أو .docx حتى يبقى الملف قابلاً للفتح.</p>
                      </div>
                    )}

                    {editTab === 'replace' && (
                      <div className="max-w-md mx-auto space-y-4 py-6">
                        <label className="text-[11px] font-mono text-slate-400 uppercase">استبدال محتوى الملف</label>
                        <p className="text-xs text-slate-400">اختر نسخة محدّثة من الملف لاستبدال المحتوى الحالي. الاسم يبقى نفسه.</p>
                        <input ref={contentInputRef} type="file" className="w-full text-xs text-slate-300 file:mr-3 file:py-2.5 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-sky-600 file:text-white hover:file:bg-sky-500 cursor-pointer bg-slate-900 border border-slate-700 rounded-xl p-1" onChange={(e) => { const file = e.target.files?.[0]; if (file) handleReplaceContent(f, file); e.target.value=''; }} />
                        {uploading && <div className="flex items-center gap-2 text-xs text-sky-300"><Loader2 className="w-4 h-4 animate-spin"/> جارٍ رفع النسخة الجديدة...</div>}
                      </div>
                    )}
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}

      {/* Print Modal */}
      {printFile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/70 backdrop-blur-xs overflow-y-auto">
          <div className="relative w-full max-w-4xl bg-[#1e293b] border border-[#334155] text-slate-100 rounded-2xl shadow-2xl overflow-hidden my-4">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-[#334155] bg-[#1e293b]">
              <div><h3 className="text-sm font-bold text-slate-100 flex items-center gap-2"><Printer className="w-4 h-4 text-indigo-400" />طباعة {printFile.name}</h3><p className="text-[11px] text-slate-400 mt-0.5">يفتح الملف بالبرنامج الافتراضي حيث يمكن الطباعة أو التعديل</p></div>
              <button onClick={() => setPrintFile(null)} className="p-1 text-slate-400 hover:text-slate-100 hover:bg-slate-800 rounded"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-4 bg-[#0f172a] max-h-[72vh] overflow-auto">
              {isPreviewable(printFile.kind) ? (<iframe src={api.modelViewUrl(printFile.name)} title={printFile.name} className="w-full h-[54vh] bg-white rounded-xl border border-slate-700" />) : (<div className="py-12 flex flex-col items-center gap-2 text-center"><FileIcon className="h-12 w-12 text-slate-600" /><p className="text-sm text-slate-300">سيُفتح الملف ببرنامجه الافتراضي.</p></div>)}
            </div>
            <div className="flex items-center justify-between px-4 py-3 border-t border-[#334155] bg-[#1e293b]">
              <button onClick={() => setPrintFile(null)} className="px-4 py-2 text-xs rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300">إغلاق</button>
              <div className="flex items-center gap-2">
                <button onClick={() => window.open(api.modelDownloadUrl(printFile.name), '_blank')} className="inline-flex items-center gap-2 px-4 py-2 text-xs rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200"><Download className="w-4 h-4" /> تنزيل</button>
                <button onClick={() => handleOpenInDefaultApp(printFile)} className="inline-flex items-center gap-2 px-4 py-2 text-xs rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white"><Printer className="w-4 h-4" /> فتح للطباعة / التعديل</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirm */}
      {deleteFile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
          <div className="w-full max-w-sm bg-[#1e293b] border border-rose-600/40 rounded-2xl shadow-2xl p-4 space-y-3">
            <div className="flex items-center gap-2 text-rose-300 font-bold text-sm"><AlertTriangle className="w-5 h-5" />تأكيد حذف النموذج</div>
            <p className="text-xs text-slate-200">سيُحذف الملف <b className="text-rose-300">{deleteFile.name}</b> نهائياً من مكتبة النماذج. لا يمكن التراجع.</p>
            <div className="flex items-center gap-2 pt-1">
              <button onClick={handleDelete} disabled={deleting} className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 disabled:opacity-40 disabled:cursor-not-allowed text-xs font-bold text-white">{deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}نعم، احذف</button>
              <button onClick={() => setDeleteFile(null)} disabled={deleting} className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-[#334155] text-xs text-slate-300">إلغاء</button>
            </div>
          </div>
        </div>
      )}

      {uploading && (<div className="fixed bottom-5 right-5 z-[80] flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 border border-indigo-600/50 text-slate-200 text-xs shadow-2xl"><Loader2 className="w-4 h-4 text-indigo-400 animate-spin" />جارٍ رفع وتحديث الملفات...</div>)}
    </div>
  );
};

async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const res = reader.result as string;
      const idx = res.indexOf(',');
      resolve(idx === -1 ? res : res.slice(idx + 1));
    };
    reader.onerror = () => reject(new Error('تعذر قراءة الملف'));
    reader.readAsDataURL(file);
  });
}

export default ModelsViewer;
