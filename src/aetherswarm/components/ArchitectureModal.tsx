import React from 'react';
import {
  Network,
  Cpu,
  Brain,
  ShieldCheck,
  Layers,
  Monitor,
  Terminal,
  Database,
  Eye,
  GitCompare,
  ArrowDown,
  ArrowRight,
  ExternalLink,
  Lock,
  Globe
} from 'lucide-react';

export const ArchitectureModal: React.FC = () => {
  return (
    <div className="bg-slate-900/90 rounded-2xl border border-slate-800 p-5 space-y-6">
      {/* Title */}
      <div className="border-b border-slate-800 pb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold text-white flex items-center gap-2">
            <Network className="w-4 h-4 text-cyan-400" />
            المعمارية الهندسية لمنظومة وكيل ويندوز وسرب الذكاء الاصطناعي (Agent Swarm Architecture)
          </h2>
          <p className="text-xs text-slate-400">
            تصميم Modular متكيف يعتمد على مبدأ عدم الوثوق بوكيل منفرد والتحقق المستقل عبر الأدلة
          </p>
        </div>
        <span className="text-xs font-mono px-2.5 py-1 rounded-lg bg-indigo-950 border border-indigo-800 text-indigo-300">
          AetherSwarm Core Architecture
        </span>
      </div>

      {/* Visual Architectural Map */}
      <div className="space-y-4 max-w-4xl mx-auto text-xs font-sans">
        {/* Layer 1: User & Interface */}
        <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 text-center space-y-2">
          <span className="text-[10px] font-mono text-cyan-400 uppercase tracking-widest block">
            المستوى 1: التفاعل الصوتي والمرئي
          </span>
          <div className="inline-flex items-center gap-4 bg-slate-900 px-4 py-2 rounded-xl border border-slate-700 text-slate-200 font-semibold shadow">
            <span>المستخدم (صوت / نص / صور الشاشة)</span>
            <span className="text-slate-500">↔</span>
            <span>Desktop UI (React + Voice Web Speech + Taskbar)</span>
          </div>
        </div>

        <div className="flex justify-center text-slate-500">
          <ArrowDown className="w-5 h-5 animate-bounce" />
        </div>

        {/* Layer 2: Supreme Orchestrator */}
        <div className="bg-gradient-to-r from-indigo-950/40 via-purple-950/40 to-slate-950 p-4 rounded-xl border border-indigo-800/80 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono text-indigo-400 uppercase tracking-widest">
              المستوى 2: العقل المركزي والتخطيط (Supreme Orchestrator)
            </span>
            <span className="font-mono text-[10px] text-purple-300 bg-purple-950 px-2 py-0.5 rounded border border-purple-800">
              Cognitive Engine
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 text-center">
            <div className="bg-slate-900/90 p-2.5 rounded-lg border border-slate-800">
              <span className="font-bold text-slate-200 block">Task Analyzer</span>
              <span className="text-[10px] text-slate-400">تفكيك الهدف إلى Task Graph</span>
            </div>
            <div className="bg-slate-900/90 p-2.5 rounded-lg border border-slate-800">
              <span className="font-bold text-slate-200 block">Risk Analyzer</span>
              <span className="text-[10px] text-slate-400">تصنيف الأمان (Safe/Assisted/Critical)</span>
            </div>
            <div className="bg-slate-900/90 p-2.5 rounded-lg border border-slate-800">
              <span className="font-bold text-slate-200 block">Context & 5-Layer Memory</span>
              <span className="text-[10px] text-slate-400">الذاكرة العاملة والخبرات السابقة</span>
            </div>
          </div>
        </div>

        <div className="flex justify-center text-slate-500">
          <ArrowDown className="w-5 h-5" />
        </div>

        {/* Layer 3: Dynamic Swarm & Agent Factory */}
        <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono text-cyan-400 uppercase tracking-widest">
              المستوى 3: سرب الوكلاء الديناميكي واللوحة المشتركة (Swarm & Blackboard)
            </span>
            <span className="text-[10px] font-mono text-slate-400">Agent DNA Engine</span>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-center text-[11px]">
            <div className="bg-slate-900 p-2 rounded-lg border border-slate-800 text-cyan-300">
              <Globe className="w-4 h-4 mx-auto mb-1 text-cyan-400" />
              <span className="font-semibold block">Browser Swarm</span>
              <span className="text-[10px] text-slate-500">Playwright CDP</span>
            </div>
            <div className="bg-slate-900 p-2 rounded-lg border border-slate-800 text-emerald-300">
              <ShieldCheck className="w-4 h-4 mx-auto mb-1 text-emerald-400" />
              <span className="font-semibold block">Critic & Verifier</span>
              <span className="text-[10px] text-slate-500">كشف التناقضات والأدلة</span>
            </div>
            <div className="bg-slate-900 p-2 rounded-lg border border-slate-800 text-blue-300">
              <Monitor className="w-4 h-4 mx-auto mb-1 text-blue-400" />
              <span className="font-semibold block">Windows Operator</span>
              <span className="text-[10px] text-slate-500">PowerShell & Win32</span>
            </div>
            <div className="bg-slate-900 p-2 rounded-lg border border-slate-800 text-purple-300">
              <Eye className="w-4 h-4 mx-auto mb-1 text-purple-400" />
              <span className="font-semibold block">Computer Vision</span>
              <span className="text-[10px] text-slate-500">Semantic UI Grounding</span>
            </div>
          </div>
        </div>

        <div className="flex justify-center text-slate-500">
          <ArrowDown className="w-5 h-5" />
        </div>

        {/* Layer 4: Evidence & Verification Gate */}
        <div className="bg-emerald-950/20 p-4 rounded-xl border border-emerald-800/80 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono text-emerald-400 uppercase tracking-widest">
              المستوى 4: محرك الأدلة وبوابة التحقق المستقلة (Evidence & Verification Gate)
            </span>
            <span className="text-emerald-300 font-mono text-[10px]">Zero Unverified Execution</span>
          </div>
          <p className="text-slate-300 leading-relaxed">
            يتم فحص مخرجات كل وكيل عبر محقق الأدلة (Evidence Engine)، واحتساب نسبة الثقة. وإذا وُجد تعارض بين مصدرين يتدخل (Conflict Resolver) لتحديد السبب الجذري قبل إعطاء إذن التنفيذ لنظام ويندوز.
          </p>
        </div>

        <div className="flex justify-center text-slate-500">
          <ArrowDown className="w-5 h-5" />
        </div>

        {/* Layer 5: Windows Control & Security Policy */}
        <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono text-amber-400 uppercase tracking-widest">
              المستوى 5: طبقة أمان ويندوز وسجل الأدوات (Tool Registry & Permission Layer)
            </span>
            <span className="font-mono text-[10px] text-amber-300 bg-amber-950 px-2 py-0.5 rounded border border-amber-800">
              Safe / Confirm / Block Policy
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-center">
            <div className="bg-slate-900/90 p-2.5 rounded-lg border border-slate-800">
              <span className="text-emerald-400 font-bold block">Safe Mode</span>
              <span className="text-[10px] text-slate-400">تصفح، قراءة ملفات، استعلام</span>
            </div>
            <div className="bg-slate-900/90 p-2.5 rounded-lg border border-slate-800">
              <span className="text-amber-400 font-bold block">Confirm Mode</span>
              <span className="text-[10px] text-slate-400">كتابة، تشغيل PowerShell، تعديل</span>
            </div>
            <div className="bg-slate-900/90 p-2.5 rounded-lg border border-slate-800">
              <span className="text-red-400 font-bold block">Strict Block</span>
              <span className="text-[10px] text-slate-400">منع تعطيل الحماية أو تهيئة الأقراص</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
