import React, { useState } from 'react';
import {
  Globe,
  Terminal,
  FileSpreadsheet,
  Folder,
  Eye,
  Maximize2,
  Minimize2,
  X,
  Search,
  RotateCw,
  Plus,
  Trash2,
  Download,
  CheckCircle,
  ExternalLink,
  Shield,
  FileText,
  Clock,
  Wifi,
  Volume2,
  ChevronRight,
  HardDrive
} from 'lucide-react';
import { ProductPriceItem } from '../types/swarm';
import { DesktopFile } from '../utils/desktopMock';

interface WindowsDesktopWorkspaceProps {
  files: DesktopFile[];
  products: ProductPriceItem[];
  terminalLogs: string[];
  browserUrl: string;
  onRunTerminalCommand: (cmd: string) => void;
  onCreateFile: (name: string, content: string) => void;
  onDeleteFile: (fileId: string) => void;
  onExportCsv: () => void;
}

type WindowType = 'browser' | 'terminal' | 'excel' | 'files' | 'vision';

export const WindowsDesktopWorkspace: React.FC<WindowsDesktopWorkspaceProps> = ({
  files,
  products,
  terminalLogs,
  browserUrl,
  onRunTerminalCommand,
  onCreateFile,
  onDeleteFile,
  onExportCsv,
}) => {
  const [activeWindow, setActiveWindow] = useState<WindowType>('excel');
  const [openWindows, setOpenWindows] = useState<WindowType[]>(['browser', 'excel', 'terminal', 'files']);
  const [manualCmd, setManualCmd] = useState('');
  const [searchFilter, setSearchFilter] = useState('');
  const [newFileName, setNewFileName] = useState('');
  const [selectedFile, setSelectedFile] = useState<DesktopFile | null>(files[0] || null);

  const toggleWindow = (win: WindowType) => {
    if (openWindows.includes(win)) {
      if (activeWindow === win) {
        // minimize
        setActiveWindow(openWindows.find((w) => w !== win) || 'excel');
      } else {
        setActiveWindow(win);
      }
    } else {
      setOpenWindows([...openWindows, win]);
      setActiveWindow(win);
    }
  };

  const closeWindow = (win: WindowType) => {
    setOpenWindows(openWindows.filter((w) => w !== win));
  };

  const handleTerminalSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualCmd.trim()) return;
    onRunTerminalCommand(manualCmd.trim());
    setManualCmd('');
  };

  const filteredProducts = products.filter((p) =>
    p.brand.toLowerCase().includes(searchFilter.toLowerCase()) ||
    p.retailer.toLowerCase().includes(searchFilter.toLowerCase())
  );

  return (
    <div className="relative h-[650px] bg-slate-950 rounded-2xl border border-slate-800 shadow-2xl overflow-hidden flex flex-col">
      {/* Windows 11 Desktop Background Canvas */}
      <div className="flex-1 relative overflow-hidden bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950/60 p-4">
        {/* Ambient Desktop Glow */}
        <div className="absolute top-1/4 left-1/3 w-96 h-96 bg-indigo-600/10 rounded-full blur-3xl pointer-events-none"></div>
        <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-cyan-600/10 rounded-full blur-3xl pointer-events-none"></div>

        {/* Desktop Pinned Icons */}
        <div className="absolute top-4 right-4 flex flex-col gap-4 select-none z-0">
          <div
            onClick={() => toggleWindow('excel')}
            className="flex flex-col items-center gap-1 p-2 rounded-xl hover:bg-white/5 cursor-pointer w-20 text-center transition-all group"
          >
            <div className="w-10 h-10 rounded-lg bg-emerald-950 border border-emerald-700/60 flex items-center justify-center shadow-lg group-hover:scale-105 transition-all">
              <FileSpreadsheet className="w-6 h-6 text-emerald-400" />
            </div>
            <span className="text-[11px] text-slate-200 group-hover:text-emerald-300 line-clamp-1">
              مقارنة RTX 5090
            </span>
          </div>

          <div
            onClick={() => toggleWindow('browser')}
            className="flex flex-col items-center gap-1 p-2 rounded-xl hover:bg-white/5 cursor-pointer w-20 text-center transition-all group"
          >
            <div className="w-10 h-10 rounded-lg bg-cyan-950 border border-cyan-700/60 flex items-center justify-center shadow-lg group-hover:scale-105 transition-all">
              <Globe className="w-6 h-6 text-cyan-400" />
            </div>
            <span className="text-[11px] text-slate-200 group-hover:text-cyan-300 line-clamp-1">
              متصفح Chrome
            </span>
          </div>

          <div
            onClick={() => toggleWindow('terminal')}
            className="flex flex-col items-center gap-1 p-2 rounded-xl hover:bg-white/5 cursor-pointer w-20 text-center transition-all group"
          >
            <div className="w-10 h-10 rounded-lg bg-slate-900 border border-slate-700 flex items-center justify-center shadow-lg group-hover:scale-105 transition-all">
              <Terminal className="w-6 h-6 text-indigo-400" />
            </div>
            <span className="text-[11px] text-slate-200 group-hover:text-indigo-300 line-clamp-1">
              PowerShell
            </span>
          </div>

          <div
            onClick={() => toggleWindow('files')}
            className="flex flex-col items-center gap-1 p-2 rounded-xl hover:bg-white/5 cursor-pointer w-20 text-center transition-all group"
          >
            <div className="w-10 h-10 rounded-lg bg-amber-950 border border-amber-700/60 flex items-center justify-center shadow-lg group-hover:scale-105 transition-all">
              <Folder className="w-6 h-6 text-amber-400" />
            </div>
            <span className="text-[11px] text-slate-200 group-hover:text-amber-300 line-clamp-1">
              مستعرض الملفات
            </span>
          </div>

          <div
            onClick={() => toggleWindow('vision')}
            className="flex flex-col items-center gap-1 p-2 rounded-xl hover:bg-white/5 cursor-pointer w-20 text-center transition-all group"
          >
            <div className="w-10 h-10 rounded-lg bg-purple-950 border border-purple-700/60 flex items-center justify-center shadow-lg group-hover:scale-105 transition-all">
              <Eye className="w-6 h-6 text-purple-400" />
            </div>
            <span className="text-[11px] text-slate-200 group-hover:text-purple-300 line-clamp-1">
              فاحص الرؤية UI
            </span>
          </div>
        </div>

        {/* ACTIVE WINDOWS CONTAINER */}
        <div className="relative w-full h-full z-10">
          {/* WINDOW 1: EXCEL COMPARISON SHEET */}
          {openWindows.includes('excel') && (
            <div
              onClick={() => setActiveWindow('excel')}
              className={`absolute top-2 left-4 right-28 bottom-2 rounded-xl border flex flex-col shadow-2xl transition-all duration-200 overflow-hidden ${
                activeWindow === 'excel'
                  ? 'border-emerald-500/80 ring-1 ring-emerald-500/30 z-30 bg-slate-900/95 backdrop-blur-md'
                  : 'border-slate-800 bg-slate-950/80 z-20 opacity-90'
              }`}
            >
              {/* Window Header */}
              <div className="bg-emerald-950/70 border-b border-emerald-900/60 px-3 py-2 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
                  <span className="text-xs font-bold text-slate-100 font-mono">
                    RTX5090_Comparison.xlsx - Microsoft Excel
                  </span>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-900/80 text-emerald-200 font-mono">
                    تم الحفظ والتحقق بنجاح
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={onExportCsv}
                    className="flex items-center gap-1 px-2.5 py-1 rounded bg-emerald-700 hover:bg-emerald-600 text-white text-[11px] font-semibold transition-all shadow-sm"
                    title="تصدير جدول المقارنة بصيغة CSV"
                  >
                    <Download className="w-3 h-3" />
                    <span>تصدير CSV</span>
                  </button>
                  <button
                    onClick={() => closeWindow('excel')}
                    className="p-1 hover:bg-red-600 hover:text-white rounded text-slate-400 transition-all"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Table Toolbar */}
              <div className="bg-slate-950/60 border-b border-slate-800 px-3 py-2 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 flex-1 max-w-sm">
                  <Search className="w-3.5 h-3.5 text-slate-500" />
                  <input
                    type="text"
                    value={searchFilter}
                    onChange={(e) => setSearchFilter(e.target.value)}
                    placeholder="تصفية الموديلات أو المتاجر..."
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1 text-xs text-slate-200 placeholder-slate-500 outline-none focus:border-emerald-500"
                  />
                </div>
                <div className="text-[11px] font-mono text-slate-400 flex items-center gap-2">
                  <span>إجمالي السجلات: {filteredProducts.length}</span>
                  <span className="text-emerald-400">• دقة المطابقة 96.4%</span>
                </div>
              </div>

              {/* Table Body */}
              <div className="flex-1 overflow-auto">
                <table className="w-full text-right text-xs border-collapse">
                  <thead className="bg-slate-950/80 text-slate-400 font-mono text-[11px] sticky top-0 border-b border-slate-800">
                    <tr>
                      <th className="p-2.5 border-l border-slate-800">الموديل / الكارت</th>
                      <th className="p-2.5 border-l border-slate-800">المتجر / الوكيل</th>
                      <th className="p-2.5 border-l border-slate-800">السعر (USD)</th>
                      <th className="p-2.5 border-l border-slate-800">الذاكرة VRAM</th>
                      <th className="p-2.5 border-l border-slate-800">حالة التوفر</th>
                      <th className="p-2.5 border-l border-slate-800">المصدر الموثوق</th>
                      <th className="p-2.5">مؤشر الثقة</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-sans">
                    {filteredProducts.map((item) => (
                      <tr key={item.id} className="hover:bg-slate-800/40 transition-colors">
                        <td className="p-2.5 font-semibold text-slate-100 border-l border-slate-800/50">
                          {item.brand}
                        </td>
                        <td className="p-2.5 text-cyan-300 font-medium border-l border-slate-800/50">
                          {item.retailer}
                        </td>
                        <td className="p-2.5 font-mono font-bold text-emerald-400 text-sm border-l border-slate-800/50">
                          {item.price}
                        </td>
                        <td className="p-2.5 font-mono text-slate-300 border-l border-slate-800/50">
                          {item.vram}
                        </td>
                        <td className="p-2.5 text-slate-300 border-l border-slate-800/50">
                          <span className="px-2 py-0.5 rounded-full bg-slate-800 text-[10px] text-slate-300 border border-slate-700">
                            {item.availability}
                          </span>
                        </td>
                        <td className="p-2.5 text-slate-400 text-[11px] border-l border-slate-800/50">
                          {item.verifiedSource}
                        </td>
                        <td className="p-2.5 font-mono text-emerald-400 font-bold">
                          {(item.confidence * 100).toFixed(0)}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* WINDOW 2: BROWSER SWARM (CHROME/EDGE) */}
          {openWindows.includes('browser') && (
            <div
              onClick={() => setActiveWindow('browser')}
              className={`absolute top-6 left-12 right-16 bottom-10 rounded-xl border flex flex-col shadow-2xl transition-all duration-200 overflow-hidden ${
                activeWindow === 'browser'
                  ? 'border-cyan-500/80 ring-1 ring-cyan-500/30 z-30 bg-slate-900/95 backdrop-blur-md'
                  : 'border-slate-800 bg-slate-950/80 z-20 opacity-90'
              }`}
            >
              {/* Browser Header & URL bar */}
              <div className="bg-slate-950 border-b border-slate-800 px-3 py-2 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 flex-1">
                  <Globe className="w-4 h-4 text-cyan-400 shrink-0" />
                  <div className="flex-1 bg-slate-900 border border-slate-700/80 rounded-lg px-3 py-1 flex items-center gap-2 text-xs font-mono text-cyan-300">
                    <span className="text-emerald-400 text-[10px]">🔒 https://</span>
                    <span className="truncate">{browserUrl}</span>
                  </div>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-950 border border-cyan-800 text-cyan-300 shrink-0">
                    Playwright CDP Connected
                  </span>
                </div>
                <button
                  onClick={() => closeWindow('browser')}
                  className="p-1 hover:bg-red-600 hover:text-white rounded text-slate-400 transition-all"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Rendered Search Results */}
              <div className="flex-1 overflow-auto p-4 space-y-4 bg-slate-950/90">
                <div className="flex items-center justify-between text-xs text-slate-400 border-b border-slate-800 pb-2">
                  <span>تم استخراج النتائج آلياً بواسطة وكيل المتصفح (Browser Swarm Agent)</span>
                  <span className="font-mono text-cyan-400">Response 200 OK (140ms)</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {products.map((item) => (
                    <div
                      key={item.id}
                      className="bg-slate-900/80 p-3 rounded-xl border border-slate-800 space-y-2 hover:border-cyan-500/50 transition-all"
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <span className="text-[10px] font-mono text-cyan-400 uppercase">
                            {item.retailer}
                          </span>
                          <h4 className="text-xs font-bold text-slate-100">{item.brand}</h4>
                        </div>
                        <span className="text-sm font-bold font-mono text-emerald-400">
                          {item.price}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1 border-t border-slate-800">
                        <span>الذاكرة: {item.vram}</span>
                        <span className="text-emerald-300 text-[10px] font-mono">
                          ✓ تم التحقق المستقل ({ (item.confidence * 100).toFixed(0) }%)
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* WINDOW 3: POWERSHELL TERMINAL */}
          {openWindows.includes('terminal') && (
            <div
              onClick={() => setActiveWindow('terminal')}
              className={`absolute top-10 left-8 right-20 bottom-8 rounded-xl border flex flex-col shadow-2xl transition-all duration-200 overflow-hidden ${
                activeWindow === 'terminal'
                  ? 'border-indigo-500/80 ring-1 ring-indigo-500/30 z-30 bg-slate-950/95 backdrop-blur-md'
                  : 'border-slate-800 bg-slate-950/80 z-20 opacity-90'
              }`}
            >
              {/* Terminal Title Bar */}
              <div className="bg-slate-900 border-b border-slate-800 px-3 py-1.5 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Terminal className="w-3.5 h-3.5 text-indigo-400" />
                  <span className="text-xs font-mono font-bold text-slate-200">
                    Windows PowerShell Core (Administrator)
                  </span>
                </div>
                <button
                  onClick={() => closeWindow('terminal')}
                  className="p-1 hover:bg-red-600 hover:text-white rounded text-slate-400 transition-all"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Terminal Logs & Interactive Prompt */}
              <div className="flex-1 p-3 font-mono text-xs overflow-auto space-y-1.5 text-slate-300 select-text">
                <div className="text-slate-500">
                  Windows PowerShell [Version 10.0.22631.3007]
                  <br />
                  (c) Microsoft Corporation. AetherSwarm Agent Bridge active.
                </div>

                {terminalLogs.map((log, idx) => (
                  <div key={idx} className="leading-relaxed">
                    {log.startsWith('[') ? (
                      <span className="text-cyan-400">{log}</span>
                    ) : log.includes('error') || log.includes('Error') ? (
                      <span className="text-red-400">{log}</span>
                    ) : log.includes('success') || log.includes('verified') ? (
                      <span className="text-emerald-400">{log}</span>
                    ) : (
                      <span>{log}</span>
                    )}
                  </div>
                ))}

                {/* Live Prompt Input */}
                <form onSubmit={handleTerminalSubmit} className="flex items-center gap-2 pt-2">
                  <span className="text-indigo-400 font-bold shrink-0">
                    PS C:\Users\Workspace&gt;
                  </span>
                  <input
                    type="text"
                    value={manualCmd}
                    onChange={(e) => setManualCmd(e.target.value)}
                    placeholder="اكتب أمر PowerShell لتنفيذه عبر وكيل ويندوز..."
                    className="flex-1 bg-transparent border-none outline-none text-emerald-300 font-mono text-xs"
                  />
                </form>
              </div>
            </div>
          )}

          {/* WINDOW 4: FILE EXPLORER */}
          {openWindows.includes('files') && (
            <div
              onClick={() => setActiveWindow('files')}
              className={`absolute top-12 left-16 right-24 bottom-12 rounded-xl border flex flex-col shadow-2xl transition-all duration-200 overflow-hidden ${
                activeWindow === 'files'
                  ? 'border-amber-500/80 ring-1 ring-amber-500/30 z-30 bg-slate-900/95 backdrop-blur-md'
                  : 'border-slate-800 bg-slate-950/80 z-20 opacity-90'
              }`}
            >
              {/* File Explorer Header */}
              <div className="bg-slate-950 border-b border-slate-800 px-3 py-2 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Folder className="w-4 h-4 text-amber-400" />
                  <span className="text-xs font-bold text-slate-100 font-mono">
                    File Explorer - C:\Users\Workspace\Documents
                  </span>
                </div>
                <button
                  onClick={() => closeWindow('files')}
                  className="p-1 hover:bg-red-600 hover:text-white rounded text-slate-400 transition-all"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Explorer Content */}
              <div className="flex-1 flex overflow-hidden">
                {/* Left Tree */}
                <div className="w-48 bg-slate-950/80 border-l border-slate-800 p-2.5 space-y-1 text-xs select-none">
                  <span className="text-[10px] text-slate-500 font-mono block px-2 mb-1">
                    الأقراص السريعة
                  </span>
                  <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-slate-800/80 text-amber-300">
                    <Folder className="w-3.5 h-3.5" />
                    <span>Documents</span>
                  </div>
                  <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-slate-400 hover:bg-slate-800/40">
                    <Folder className="w-3.5 h-3.5" />
                    <span>Downloads</span>
                  </div>
                  <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-slate-400 hover:bg-slate-800/40">
                    <Folder className="w-3.5 h-3.5" />
                    <span>Projects</span>
                  </div>
                  <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-slate-400 hover:bg-slate-800/40">
                    <HardDrive className="w-3.5 h-3.5 text-slate-400" />
                    <span>Local Disk (C:)</span>
                  </div>
                </div>

                {/* Right Files Grid */}
                <div className="flex-1 p-3 overflow-auto space-y-2">
                  <div className="grid grid-cols-1 gap-1.5">
                    {files.map((file) => (
                      <div
                        key={file.id}
                        onClick={() => setSelectedFile(file)}
                        className={`p-2 rounded-lg border flex items-center justify-between text-xs cursor-pointer transition-all ${
                          selectedFile?.id === file.id
                            ? 'bg-amber-950/40 border-amber-500/70 text-amber-200'
                            : 'bg-slate-950/50 border-slate-800/70 text-slate-300 hover:bg-slate-800/50'
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          {file.type === 'folder' ? (
                            <Folder className="w-4 h-4 text-amber-400" />
                          ) : file.name.endsWith('.xlsx') ? (
                            <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
                          ) : (
                            <FileText className="w-4 h-4 text-cyan-400" />
                          )}
                          <div>
                            <span className="font-semibold block">{file.name}</span>
                            <span className="text-[10px] text-slate-500 font-mono">
                              {file.path}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-3">
                          <span className="text-[11px] font-mono text-slate-400">
                            {file.size}
                          </span>
                          <span className="text-[10px] text-slate-500">
                            {file.modified}
                          </span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onDeleteFile(file.id);
                            }}
                            className="p-1 text-slate-500 hover:text-red-400"
                            title="حذف (يخضع لبوابة الأمان)"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* WINDOW 5: COMPUTER VISION INSPECTOR */}
          {openWindows.includes('vision') && (
            <div
              onClick={() => setActiveWindow('vision')}
              className={`absolute top-14 left-14 right-20 bottom-14 rounded-xl border flex flex-col shadow-2xl transition-all duration-200 overflow-hidden ${
                activeWindow === 'vision'
                  ? 'border-purple-500/80 ring-1 ring-purple-500/30 z-30 bg-slate-900/95 backdrop-blur-md'
                  : 'border-slate-800 bg-slate-950/80 z-20 opacity-90'
              }`}
            >
              {/* Vision Header */}
              <div className="bg-purple-950/70 border-b border-purple-900/60 px-3 py-2 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Eye className="w-4 h-4 text-purple-400" />
                  <span className="text-xs font-bold text-slate-100 font-mono">
                    Computer Vision Agent - Semantic UI Grounding Frame
                  </span>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-purple-900/80 text-purple-200 font-mono">
                    Frame Buffer: 1920x1080 (32-bit)
                  </span>
                </div>
                <button
                  onClick={() => closeWindow('vision')}
                  className="p-1 hover:bg-red-600 hover:text-white rounded text-slate-400 transition-all"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Vision Screen Inspection Canvas */}
              <div className="flex-1 p-4 bg-slate-950 flex flex-col justify-between relative overflow-hidden">
                <div className="border border-purple-800/40 rounded-xl p-4 bg-slate-900/40 relative flex-1 flex flex-col justify-center items-center text-center space-y-4">
                  <div className="space-y-1">
                    <span className="text-xs font-bold text-purple-300">
                      التعرف الدلالي على عناصر الشاشة (Semantic Target Detection)
                    </span>
                    <p className="text-[11px] text-slate-400 max-w-md mx-auto">
                      بدلاً من الاعتماد على إحداثيات شاشة صلبة click(x,y)، يكتشف الوكيل العناصر دلالياً بالاسم والغرض للتكيف مع تغيير أحجام النوافذ.
                    </p>
                  </div>

                  {/* Simulated Detected Bounding Boxes */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 w-full max-w-lg">
                    <div className="border-2 border-dashed border-emerald-400/80 bg-emerald-950/20 p-2.5 rounded-lg text-right">
                      <span className="text-[10px] font-mono text-emerald-400 block font-bold">
                        [Button: Save File]
                      </span>
                      <span className="text-[10px] text-slate-300">Rect: [140, 90, 80, 32]</span>
                      <span className="text-[9px] text-emerald-300 block font-mono">ثقة 99.2%</span>
                    </div>

                    <div className="border-2 border-dashed border-cyan-400/80 bg-cyan-950/20 p-2.5 rounded-lg text-right">
                      <span className="text-[10px] font-mono text-cyan-400 block font-bold">
                        [Input: Search Retailers]
                      </span>
                      <span className="text-[10px] text-slate-300">Rect: [320, 90, 240, 32]</span>
                      <span className="text-[9px] text-cyan-300 block font-mono">ثقة 97.8%</span>
                    </div>

                    <div className="border-2 border-dashed border-purple-400/80 bg-purple-950/20 p-2.5 rounded-lg text-right">
                      <span className="text-[10px] font-mono text-purple-400 block font-bold">
                        [Grid: Comparison Table]
                      </span>
                      <span className="text-[10px] text-slate-300">Rect: [140, 140, 900, 480]</span>
                      <span className="text-[9px] text-purple-300 block font-mono">ثقة 98.6%</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Windows 11 Taskbar */}
      <div className="h-12 bg-slate-950/95 border-t border-slate-800 flex items-center justify-between px-3 select-none z-30">
        {/* Left Side: System Tray / Clock */}
        <div className="flex items-center gap-3 text-slate-400 text-xs">
          <div className="flex items-center gap-2">
            <Wifi className="w-3.5 h-3.5 text-cyan-400" />
            <Volume2 className="w-3.5 h-3.5" />
          </div>
          <div className="text-right text-[11px] leading-tight font-mono text-slate-300">
            <div>12:24 PM</div>
            <div className="text-[9px] text-slate-500">2026/09/25</div>
          </div>
        </div>

        {/* Center: Pinned Taskbar Apps */}
        <div className="flex items-center gap-1.5 bg-slate-900/80 px-2 py-1 rounded-xl border border-slate-800">
          {/* Windows Start Button */}
          <button
            onClick={() => toggleWindow('excel')}
            className="p-1.5 rounded-lg hover:bg-slate-800 transition-all text-cyan-400"
            title="Start Menu"
          >
            <div className="grid grid-cols-2 gap-0.5 w-4 h-4">
              <span className="bg-cyan-400 rounded-sm"></span>
              <span className="bg-cyan-400 rounded-sm"></span>
              <span className="bg-cyan-400 rounded-sm"></span>
              <span className="bg-cyan-400 rounded-sm"></span>
            </div>
          </button>

          <button
            onClick={() => toggleWindow('browser')}
            className={`p-1.5 rounded-lg transition-all relative ${
              activeWindow === 'browser' && openWindows.includes('browser')
                ? 'bg-slate-800 text-cyan-400'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
            title="Google Chrome / Edge"
          >
            <Globe className="w-4 h-4" />
            {openWindows.includes('browser') && (
              <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-2 h-0.5 rounded-full bg-cyan-400"></span>
            )}
          </button>

          <button
            onClick={() => toggleWindow('excel')}
            className={`p-1.5 rounded-lg transition-all relative ${
              activeWindow === 'excel' && openWindows.includes('excel')
                ? 'bg-slate-800 text-emerald-400'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
            title="Microsoft Excel"
          >
            <FileSpreadsheet className="w-4 h-4" />
            {openWindows.includes('excel') && (
              <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-2 h-0.5 rounded-full bg-emerald-400"></span>
            )}
          </button>

          <button
            onClick={() => toggleWindow('terminal')}
            className={`p-1.5 rounded-lg transition-all relative ${
              activeWindow === 'terminal' && openWindows.includes('terminal')
                ? 'bg-slate-800 text-indigo-400'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
            title="PowerShell"
          >
            <Terminal className="w-4 h-4" />
            {openWindows.includes('terminal') && (
              <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-2 h-0.5 rounded-full bg-indigo-400"></span>
            )}
          </button>

          <button
            onClick={() => toggleWindow('files')}
            className={`p-1.5 rounded-lg transition-all relative ${
              activeWindow === 'files' && openWindows.includes('files')
                ? 'bg-slate-800 text-amber-400'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
            title="File Explorer"
          >
            <Folder className="w-4 h-4" />
            {openWindows.includes('files') && (
              <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-2 h-0.5 rounded-full bg-amber-400"></span>
            )}
          </button>

          <button
            onClick={() => toggleWindow('vision')}
            className={`p-1.5 rounded-lg transition-all relative ${
              activeWindow === 'vision' && openWindows.includes('vision')
                ? 'bg-slate-800 text-purple-400'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
            title="Computer Vision Inspector"
          >
            <Eye className="w-4 h-4" />
            {openWindows.includes('vision') && (
              <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-2 h-0.5 rounded-full bg-purple-400"></span>
            )}
          </button>
        </div>

        {/* Right Side: Windows OS Status */}
        <div className="flex items-center gap-2 text-xs font-mono text-slate-400">
          <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
          <span>Windows 11 Agent Active</span>
        </div>
      </div>
    </div>
  );
};
