import React from 'react';
import {
  ShieldAlert,
  ShieldCheck,
  Shield,
  Activity,
  Layers,
  Volume2,
  VolumeX,
  AlertTriangle,
  Cpu,
  Monitor,
  Database,
  FileText,
  Network,
  Bot,
  Radio,
  FileAudio,
  User as UserIcon
} from 'lucide-react';
import { User } from 'firebase/auth';
import { AutonomyMode } from '../types/swarm';

interface HeaderProps {
  activeTab: 'desktop' | 'swarm' | 'chat' | 'memory' | 'audit' | 'architecture';
  setActiveTab: (tab: 'desktop' | 'swarm' | 'chat' | 'memory' | 'audit' | 'architecture') => void;
  autonomyMode: AutonomyMode;
  setAutonomyMode: (mode: AutonomyMode) => void;
  onEmergencyStop: () => void;
  isExecuting: boolean;
  activeAgentsCount: number;
  overallConfidence: number;
  soundEnabled: boolean;
  setSoundEnabled: (val: boolean) => void;
  onOpenLiveVoice: () => void;
  onOpenTranscribe: () => void;
  onOpenAuth: () => void;
  currentUser: User | null;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  autonomyMode,
  setAutonomyMode,
  onEmergencyStop,
  isExecuting,
  activeAgentsCount,
  overallConfidence,
  soundEnabled,
  setSoundEnabled,
  onOpenLiveVoice,
  onOpenTranscribe,
  onOpenAuth,
  currentUser,
}) => {
  return (
    <header className="border-b border-slate-800 bg-slate-900/95 backdrop-blur-md sticky top-0 z-40 px-4 py-2.5 shadow-xl">
      <div className="flex flex-wrap items-center justify-between gap-3 max-w-[1700px] mx-auto">
        {/* Brand & Status */}
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-600 via-indigo-600 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/20 ring-1 ring-white/20">
              <Cpu className="w-6 h-6 text-white animate-pulse" />
            </div>
            {isExecuting && (
              <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-cyan-500 border border-slate-900"></span>
              </span>
            )}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold text-white tracking-wide flex items-center gap-1.5">
                AetherSwarm <span className="text-cyan-400 font-mono text-xs px-1.5 py-0.5 rounded bg-cyan-950/80 border border-cyan-800">OS 2.0</span>
              </h1>
              <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-slate-800 border border-slate-700 text-slate-300">
                Windows General Agent
              </span>
            </div>
            <p className="text-xs text-slate-400">
              العقل المركزي وسرب الذكاء الاصطناعي مع Live API والتحقق المستقل وقاعدة بيانات Firebase
            </p>
          </div>
        </div>

        {/* View Navigation Tabs */}
        <nav className="flex items-center gap-1 bg-slate-950/70 p-1 rounded-xl border border-slate-800/80 overflow-x-auto no-scrollbar">
          <button
            onClick={() => setActiveTab('desktop')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all shrink-0 ${
              activeTab === 'desktop'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <Monitor className="w-4 h-4" />
            <span>سطح مكتب ويندوز</span>
          </button>

          <button
            onClick={() => setActiveTab('swarm')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all shrink-0 ${
              activeTab === 'swarm'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>سرب الوكلاء واللوحة</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
              {activeAgentsCount}
            </span>
          </button>

          {/* New Gemini Chatbot tab */}
          <button
            onClick={() => setActiveTab('chat')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all shrink-0 ${
              activeTab === 'chat'
                ? 'bg-gradient-to-r from-cyan-600 to-indigo-600 text-white shadow-md shadow-indigo-600/30 font-bold'
                : 'text-slate-400 hover:text-cyan-300 hover:bg-slate-800/60'
            }`}
          >
            <Bot className="w-4 h-4 text-cyan-400" />
            <span>شات Gemini الذكي</span>
            <span className="text-[9px] px-1.5 py-0.2 rounded bg-indigo-950 text-indigo-300 border border-indigo-800 font-mono">
              3 Models
            </span>
          </button>

          <button
            onClick={() => setActiveTab('memory')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all shrink-0 ${
              activeTab === 'memory'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <Database className="w-4 h-4" />
            <span>الذاكرة الخماسية</span>
          </button>

          <button
            onClick={() => setActiveTab('audit')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all shrink-0 ${
              activeTab === 'audit'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>سجل التدقيق</span>
          </button>

          <button
            onClick={() => setActiveTab('architecture')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all shrink-0 ${
              activeTab === 'architecture'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <Network className="w-4 h-4" />
            <span>معمارية النظام</span>
          </button>
        </nav>

        {/* Feature Action Buttons: Live Voice, Transcribe, Firebase Auth */}
        <div className="flex items-center gap-2">
          {/* Live Voice API (gemini-3.8-live) Button */}
          <button
            onClick={onOpenLiveVoice}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-cyan-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 text-white text-xs font-bold transition-all shadow-md shadow-cyan-600/20"
            title="بدء محادثة صوتية لحظية بواسطة Gemini Live API (gemini-3.8-live)"
          >
            <Radio className="w-3.5 h-3.5 animate-pulse text-cyan-200" />
            <span className="hidden sm:inline">صوت حي (Live API)</span>
          </button>

          {/* Transcribe Audio (gemini-3.5-transcribe) Button */}
          <button
            onClick={onOpenTranscribe}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-slate-700 text-xs font-medium transition-all shadow-sm"
            title="نسخ الصوت من الميكروفون عبر نموذج gemini-3.5-transcribe"
          >
            <FileAudio className="w-3.5 h-3.5 text-cyan-400" />
            <span className="hidden sm:inline">نسخ الصوت</span>
          </button>

          {/* Firebase Auth / Account Profile Button */}
          <button
            onClick={onOpenAuth}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-medium transition-all ${
              currentUser
                ? 'bg-indigo-950/80 border-indigo-800 text-indigo-200'
                : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-300'
            }`}
            title="حساب المستخدم وقاعدة بيانات Firebase"
          >
            {currentUser?.photoURL ? (
              <img
                src={currentUser.photoURL}
                alt=""
                className="w-4 h-4 rounded-full border border-indigo-400"
              />
            ) : (
              <UserIcon className="w-3.5 h-3.5 text-indigo-400" />
            )}
            <span className="hidden md:inline">
              {currentUser ? currentUser.displayName?.split(' ')[0] : 'دخول Google'}
            </span>
          </button>

          {/* Autonomy Level Mode Selector */}
          <div className="hidden lg:flex items-center bg-slate-950/80 border border-slate-800 rounded-lg p-0.5 text-xs font-medium">
            <button
              onClick={() => setAutonomyMode('SAFE')}
              title="آمن: طلب موافقة على كل كتابة أو تشغيل برنامج"
              className={`flex items-center gap-1 px-2.5 py-1 rounded-md transition-all ${
                autonomyMode === 'SAFE'
                  ? 'bg-emerald-600 text-white font-semibold shadow'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-300" />
              <span>آمن</span>
            </button>
            <button
              onClick={() => setAutonomyMode('ASSISTED')}
              title="مساعد: طلب موافقة فقط للعمليات الحساسة"
              className={`flex items-center gap-1 px-2.5 py-1 rounded-md transition-all ${
                autonomyMode === 'ASSISTED'
                  ? 'bg-amber-600 text-white font-semibold shadow'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Shield className="w-3.5 h-3.5 text-amber-300" />
              <span>مساعد</span>
            </button>
            <button
              onClick={() => setAutonomyMode('AUTONOMOUS')}
              title="استقلالية كاملة"
              className={`flex items-center gap-1 px-2.5 py-1 rounded-md transition-all ${
                autonomyMode === 'AUTONOMOUS'
                  ? 'bg-purple-600 text-white font-semibold shadow'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <ShieldAlert className="w-3.5 h-3.5 text-purple-300" />
              <span>مستقل</span>
            </button>
          </div>

          {/* Sound / TTS Toggle */}
          <button
            onClick={() => setSoundEnabled(!soundEnabled)}
            className={`p-2 rounded-lg border transition-all ${
              soundEnabled
                ? 'bg-cyan-950/60 border-cyan-800 text-cyan-400 hover:bg-cyan-900/60'
                : 'bg-slate-900 border-slate-800 text-slate-500 hover:text-slate-300'
            }`}
            title={soundEnabled ? 'تعطيل الصوت التلقائي' : 'تفعيل النطق الصوتي'}
          >
            {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          </button>

          <span
            className="hidden lg:inline-flex items-center px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-[11px] text-slate-400"
            title="واجهة السرب مدمجة في النظام المحاسبي دون تنفيذ أوامر على الجهاز"
          >
            داخل النظام المحاسبي
          </span>

          {/* Emergency Kill Switch */}
          <button
            onClick={onEmergencyStop}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-bold transition-all shadow-lg shadow-red-600/20 active:scale-95 border border-red-500"
            title="إيقاف فوري لكافة الوكلاء والعمليات دون استثناء"
          >
            <AlertTriangle className="w-4 h-4 animate-bounce" />
            <span className="hidden sm:inline">KILL</span>
          </button>
        </div>
      </div>
    </header>
  );
};
