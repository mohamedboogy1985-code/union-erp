import React, { useState, useEffect, useMemo } from 'react';
import {
  Cpu,
  Activity,
  HardDrive,
  Zap,
  Play,
  Pause,
  Trash2,
  CheckCircle2,
  Globe,
  Monitor,
  Eye,
  FileSpreadsheet,
  ShieldAlert,
  ChevronDown,
  ChevronUp,
  Sliders,
  Filter
} from 'lucide-react';
import { AgentDNA } from '../types/swarm';

export interface AgentResourceMetric {
  agentId: string;
  name: string;
  archetype: string;
  status: 'idle' | 'working' | 'verifying' | 'done' | 'error';
  cpuPercent: number;
  cpuPeak: number;
  ramMb: number;
  ramMaxMb: number;
  threads: number;
  networkKbps: number;
  cpuHistory: number[];
  ramHistory: number[];
  lastUpdated: string;
}

interface AgentMonitorProps {
  agents: AgentDNA[];
  isExecuting?: boolean;
  className?: string;
  defaultSimple?: boolean;
}

export const AgentMonitor: React.FC<AgentMonitorProps> = ({
  agents,
  isExecuting = false,
  className = '',
  defaultSimple = true,
}) => {
  const [isLive, setIsLive] = useState<boolean>(true);
  const [viewMode, setViewMode] = useState<'simple' | 'detailed'>(defaultSimple ? 'simple' : 'detailed');
  const [refreshInterval, setRefreshInterval] = useState<number>(1500); // 1.5 seconds
  const [filterArchetype, setFilterArchetype] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [gcNotice, setGcNotice] = useState<string | null>(null);
  const [isCollapsed, setIsCollapsed] = useState<boolean>(false);

  // Initialize and simulate real-time metrics per agent
  const [metrics, setMetrics] = useState<Record<string, AgentResourceMetric>>(() => {
    const initial: Record<string, AgentResourceMetric> = {};
    agents.forEach((agent) => {
      const isWorking = agent.status === 'working' || isExecuting;
      const baseCpu = isWorking ? 58 + Math.random() * 28 : 5 + Math.random() * 8;
      const baseRamMax = agent.archetype === 'BrowserWorker' ? 1536 : 1024;
      const baseRam = agent.archetype === 'BrowserWorker'
        ? (isWorking ? 650 : 340) + Math.random() * 110
        : (isWorking ? 390 : 180) + Math.random() * 70;

      initial[agent.id] = {
        agentId: agent.id,
        name: agent.name,
        archetype: agent.archetype,
        status: agent.status,
        cpuPercent: Math.round(baseCpu),
        cpuPeak: Math.round(baseCpu + 6),
        ramMb: Math.round(baseRam),
        ramMaxMb: baseRamMax,
        threads: isWorking ? (agent.archetype === 'BrowserWorker' ? 6 : 4) : 1,
        networkKbps: isWorking ? Math.round(140 + Math.random() * 200) : Math.round(3 + Math.random() * 6),
        cpuHistory: Array.from({ length: 12 }, () => Math.max(3, Math.round(baseCpu + (Math.random() * 10 - 5)))),
        ramHistory: Array.from({ length: 12 }, () => Math.round(baseRam + (Math.random() * 16 - 8))),
        lastUpdated: new Date().toLocaleTimeString(),
      };
    });
    return initial;
  });

  // Real-time simulated heartbeats
  useEffect(() => {
    if (!isLive) return;

    const timer = setInterval(() => {
      setMetrics((prev) => {
        const next: Record<string, AgentResourceMetric> = { ...prev };

        agents.forEach((agent) => {
          const current = next[agent.id] || {
            agentId: agent.id,
            name: agent.name,
            archetype: agent.archetype,
            status: agent.status,
            cpuPercent: 5,
            cpuPeak: 12,
            ramMb: 200,
            ramMaxMb: 1024,
            threads: 1,
            networkKbps: 4,
            cpuHistory: [5, 5, 5, 5],
            ramHistory: [200, 200, 200, 200],
            lastUpdated: new Date().toLocaleTimeString(),
          };

          const isWorking = agent.status === 'working' || isExecuting;
          const isVerifying = agent.status === 'verifying';

          let targetCpu = 5;
          let targetRam = 210;
          let targetThreads = 1;
          let targetNet = 4;

          if (agent.archetype === 'BrowserWorker') {
            targetCpu = isWorking ? 68 + Math.random() * 25 : (isVerifying ? 35 : 7 + Math.random() * 7);
            targetRam = isWorking ? 720 + Math.random() * 220 : 360 + Math.random() * 50;
            targetThreads = isWorking ? 8 : 2;
            targetNet = isWorking ? 360 + Math.random() * 450 : 14;
          } else if (agent.archetype === 'VisionInspector') {
            targetCpu = isWorking ? 78 + Math.random() * 18 : (isVerifying ? 42 : 5 + Math.random() * 6);
            targetRam = isWorking ? 590 + Math.random() * 160 : 310 + Math.random() * 40;
            targetThreads = isWorking ? 6 : 1;
            targetNet = isWorking ? 210 + Math.random() * 180 : 7;
          } else if (agent.archetype === 'WindowsExecutive') {
            targetCpu = isWorking ? 52 + Math.random() * 32 : 8 + Math.random() * 9;
            targetRam = isWorking ? 430 + Math.random() * 110 : 250 + Math.random() * 30;
            targetThreads = isWorking ? 4 : 2;
            targetNet = isWorking ? 95 + Math.random() * 80 : 5;
          } else if (agent.archetype === 'DataSpecialist') {
            targetCpu = isWorking ? 48 + Math.random() * 28 : 5 + Math.random() * 6;
            targetRam = isWorking ? 470 + Math.random() * 140 : 240 + Math.random() * 25;
            targetThreads = isWorking ? 4 : 1;
            targetNet = isWorking ? 85 + Math.random() * 60 : 3;
          } else if (agent.archetype === 'FactChecker') {
            targetCpu = isWorking || isVerifying ? 59 + Math.random() * 24 : 6 + Math.random() * 8;
            targetRam = isWorking || isVerifying ? 395 + Math.random() * 105 : 215 + Math.random() * 30;
            targetThreads = isWorking ? 4 : 1;
            targetNet = isWorking ? 165 + Math.random() * 135 : 9;
          } else {
            // Orchestrator
            targetCpu = isWorking ? 36 + Math.random() * 24 : 6 + Math.random() * 7;
            targetRam = isWorking ? 320 + Math.random() * 85 : 195 + Math.random() * 20;
            targetThreads = isWorking ? 4 : 2;
            targetNet = isWorking ? 130 + Math.random() * 100 : 6;
          }

          const newCpu = Math.min(100, Math.max(1, Math.round(current.cpuPercent * 0.35 + targetCpu * 0.65)));
          const newRam = Math.min(current.ramMaxMb, Math.max(50, Math.round(current.ramMb * 0.45 + targetRam * 0.55)));
          const newPeak = Math.max(current.cpuPeak, newCpu);

          const updatedCpuHistory = [...current.cpuHistory.slice(-14), newCpu];
          const updatedRamHistory = [...current.ramHistory.slice(-14), newRam];

          next[agent.id] = {
            ...current,
            status: agent.status,
            name: agent.name,
            archetype: agent.archetype,
            cpuPercent: newCpu,
            cpuPeak: newPeak,
            ramMb: newRam,
            threads: targetThreads,
            networkKbps: Math.round(targetNet),
            cpuHistory: updatedCpuHistory,
            ramHistory: updatedRamHistory,
            lastUpdated: new Date().toLocaleTimeString(),
          };
        });

        return next;
      });
    }, refreshInterval);

    return () => clearInterval(timer);
  }, [isLive, refreshInterval, agents, isExecuting]);

  // Aggregate Metrics
  const aggregate = useMemo(() => {
    const list = Object.values(metrics);
    if (list.length === 0) {
      return { avgCpu: 0, totalRamGb: 0, maxRamGb: 1, activeThreads: 0, peakCpu: 0, highLoadCount: 0 };
    }
    const sumCpu = list.reduce((acc, m) => acc + m.cpuPercent, 0);
    const sumRam = list.reduce((acc, m) => acc + m.ramMb, 0);
    const sumMaxRam = list.reduce((acc, m) => acc + m.ramMaxMb, 0);
    const sumThreads = list.reduce((acc, m) => acc + m.threads, 0);
    const maxPeak = Math.max(...list.map((m) => m.cpuPeak), 0);
    const highLoad = list.filter((m) => m.cpuPercent >= 75 || (m.ramMb / m.ramMaxMb) >= 0.8).length;

    return {
      avgCpu: Math.round(sumCpu / list.length),
      totalRamGb: Number((sumRam / 1024).toFixed(2)),
      maxRamGb: Number((sumMaxRam / 1024).toFixed(2)),
      activeThreads: sumThreads,
      peakCpu: maxPeak,
      highLoadCount: highLoad,
    };
  }, [metrics]);

  // Simulate garbage collection
  const handleGarbageCollection = () => {
    setMetrics((prev) => {
      const next: Record<string, AgentResourceMetric> = {};
      Object.entries(prev).forEach(([id, m]) => {
        const reducedRam = Math.max(120, Math.round(m.ramMb * 0.72));
        next[id] = {
          ...m,
          ramMb: reducedRam,
          ramHistory: [...m.ramHistory.slice(-14), reducedRam],
        };
      });
      return next;
    });

    setGcNotice('تم تفريغ ذاكرة التخزين المؤقت وحاويات التصفح (V8 Heap & Memory Buffers) بنجاح (-28%)');
    setTimeout(() => setGcNotice(null), 3500);
  };

  // Helper for agent archetype icon
  const getAgentIcon = (archetype: string) => {
    switch (archetype) {
      case 'BrowserWorker':
        return <Globe className="w-4 h-4 text-cyan-400" />;
      case 'FactChecker':
        return <CheckCircle2 className="w-4 h-4 text-emerald-400" />;
      case 'WindowsExecutive':
        return <Monitor className="w-4 h-4 text-blue-400" />;
      case 'VisionInspector':
        return <Eye className="w-4 h-4 text-purple-400" />;
      case 'DataSpecialist':
        return <FileSpreadsheet className="w-4 h-4 text-green-400" />;
      case 'SecurityGate':
        return <ShieldAlert className="w-4 h-4 text-red-400" />;
      default:
        return <Cpu className="w-4 h-4 text-indigo-400" />;
    }
  };

  // Filtered agent list
  const filteredMetrics = useMemo(() => {
    return Object.values(metrics).filter((m) => {
      const matchesArchetype = filterArchetype === 'ALL' || m.archetype === filterArchetype;
      const matchesSearch = !searchQuery || m.name.toLowerCase().includes(searchQuery.toLowerCase()) || m.archetype.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesArchetype && matchesSearch;
    });
  }, [metrics, filterArchetype, searchQuery]);

  // Helper for CPU color class
  const getCpuColor = (cpu: number) => {
    if (cpu >= 80) return 'text-rose-400 bg-rose-500';
    if (cpu >= 50) return 'text-amber-400 bg-amber-400';
    return 'text-emerald-400 bg-emerald-400';
  };

  // Helper for RAM color class
  const getRamColor = (percent: number) => {
    if (percent >= 85) return 'text-rose-400 bg-rose-500';
    if (percent >= 65) return 'text-purple-400 bg-purple-500';
    return 'text-cyan-400 bg-cyan-400';
  };

  return (
    <div className={`bg-slate-900/95 border border-slate-800 rounded-2xl p-4 shadow-xl backdrop-blur-md space-y-3 ${className}`} dir="rtl">
      {/* Component Header / Toolbar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-indigo-950/80 border border-indigo-700/60 rounded-xl text-indigo-400 shadow-inner">
            <Activity className="w-5 h-5 animate-pulse text-cyan-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-white tracking-wide">
                مراقب الموارد اللحظي لوكلاء السرب (AgentMonitor)
              </h2>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-cyan-950/80 border border-cyan-800 text-cyan-300">
                LIVE
              </span>
              {isLive && (
                <span className="flex items-center gap-1 text-[10px] text-emerald-400 font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                  بث لحظي
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5">
              محاكاة حية لاستهلاك المعالج (CPU) والذاكرة (RAM) لكل وكيل من وكلاء السرب بواجهة رسومية مباشرة.
            </p>
          </div>
        </div>

        {/* Header Controls */}
        <div className="flex items-center gap-2 self-stretch sm:self-auto justify-end">
          {/* View Mode Toggle: Simple vs Detailed */}
          <div className="flex items-center bg-slate-950 border border-slate-800 rounded-lg p-0.5 text-xs">
            <button
              onClick={() => setViewMode('simple')}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                viewMode === 'simple'
                  ? 'bg-indigo-600 text-white shadow'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              واجهة بسيطة
            </button>
            <button
              onClick={() => setViewMode('detailed')}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                viewMode === 'detailed'
                  ? 'bg-indigo-600 text-white shadow'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              متقدمة
            </button>
          </div>

          {/* Pause / Resume */}
          <button
            onClick={() => setIsLive(!isLive)}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium border transition-all ${
              isLive
                ? 'bg-amber-950/60 border-amber-700/60 text-amber-300 hover:bg-amber-900/60'
                : 'bg-emerald-950/60 border-emerald-700/60 text-emerald-300 hover:bg-emerald-900/60'
            }`}
            title={isLive ? 'إيقاف مؤقت' : 'استئناف'}
          >
            {isLive ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
            <span className="hidden md:inline">{isLive ? 'إيقاف' : 'استئناف'}</span>
          </button>

          {/* Flush Memory (GC) */}
          <button
            onClick={handleGarbageCollection}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-all hover:text-white"
            title="تفريغ الذاكرة المؤقتة"
          >
            <Trash2 className="w-3 h-3 text-cyan-400" />
            <span className="hidden md:inline">تفريغ RAM</span>
          </button>

          {/* Collapse / Expand */}
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-white transition-colors"
            title={isCollapsed ? 'توسيع' : 'طي'}
          >
            {isCollapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* GC Notification */}
      {gcNotice && (
        <div className="p-2 bg-emerald-950/80 border border-emerald-700/70 rounded-xl text-xs text-emerald-300 flex items-center justify-between">
          <span className="flex items-center gap-2">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            {gcNotice}
          </span>
          <button onClick={() => setGcNotice(null)} className="text-emerald-400 hover:text-white">✕</button>
        </div>
      )}

      {/* Aggregate KPI Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        {/* Total Average CPU */}
        <div className="bg-slate-950/70 border border-slate-800/80 rounded-xl p-2.5">
          <div className="flex items-center justify-between text-slate-400 text-[11px] mb-1">
            <span className="flex items-center gap-1">
              <Cpu className="w-3 h-3 text-cyan-400" />
              متوسط معالج السرب
            </span>
            <span className="font-mono text-cyan-400 font-bold">{aggregate.avgCpu}%</span>
          </div>
          <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
            <div
              className={`h-full transition-all duration-500 rounded-full ${
                aggregate.avgCpu > 70 ? 'bg-rose-500' : aggregate.avgCpu > 40 ? 'bg-amber-400' : 'bg-cyan-400'
              }`}
              style={{ width: `${aggregate.avgCpu}%` }}
            />
          </div>
        </div>

        {/* Total Active RAM */}
        <div className="bg-slate-950/70 border border-slate-800/80 rounded-xl p-2.5">
          <div className="flex items-center justify-between text-slate-400 text-[11px] mb-1">
            <span className="flex items-center gap-1">
              <HardDrive className="w-3 h-3 text-purple-400" />
              إجمالي الذاكرة النشطة
            </span>
            <span className="font-mono text-purple-300 font-bold">{aggregate.totalRamGb.toFixed(2)} GB</span>
          </div>
          <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
            <div
              className="bg-purple-400 h-full transition-all duration-500 rounded-full"
              style={{ width: `${Math.min(100, (aggregate.totalRamGb / Math.max(0.1, aggregate.maxRamGb)) * 100)}%` }}
            />
          </div>
        </div>

        {/* Active Threads */}
        <div className="bg-slate-950/70 border border-slate-800/80 rounded-xl p-2.5">
          <div className="flex items-center justify-between text-slate-400 text-[11px] mb-1">
            <span className="flex items-center gap-1">
              <Zap className="w-3 h-3 text-amber-400" />
              خيوط التنفيذ النشطة
            </span>
            <span className="font-mono text-amber-300 font-bold">{aggregate.activeThreads} th</span>
          </div>
          <div className="text-[10px] text-emerald-400 font-mono">توزيع متوازن عبر الوكلاء</div>
        </div>

        {/* System Health */}
        <div className="bg-slate-950/70 border border-slate-800/80 rounded-xl p-2.5">
          <div className="flex items-center justify-between text-slate-400 text-[11px] mb-1">
            <span>حالة السرب الإجمالية:</span>
            <span className={`font-bold text-xs ${aggregate.highLoadCount > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
              {aggregate.highLoadCount > 0 ? `ضغط مرتفع (${aggregate.highLoadCount})` : 'مستقر ومثالي'}
            </span>
          </div>
          <div className="text-[10px] text-slate-400 font-mono">
            {Object.keys(metrics).length} وكيل يعمل بتزامن
          </div>
        </div>
      </div>

      {/* Main Agent List (When Not Collapsed) */}
      {!isCollapsed && (
        <>
          {/* Archetype Quick Filter Pills (Optional) */}
          {viewMode === 'detailed' && (
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-800/70">
              <div className="flex flex-wrap items-center gap-1 text-[11px]">
                <span className="text-slate-400 ml-1">تصفية:</span>
                {['ALL', 'BrowserWorker', 'WindowsExecutive', 'FactChecker', 'DataSpecialist', 'VisionInspector', 'Orchestrator'].map((type) => (
                  <button
                    key={type}
                    onClick={() => setFilterArchetype(type)}
                    className={`px-2 py-0.5 rounded text-[10px] font-mono transition-colors ${
                      filterArchetype === type ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200 bg-slate-950'
                    }`}
                  >
                    {type === 'ALL' ? 'الكل' : type}
                  </button>
                ))}
              </div>
              <input
                type="text"
                placeholder="بحث..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-slate-950 border border-slate-800 rounded px-2 py-0.5 text-xs text-slate-200 outline-none w-32"
              />
            </div>
          )}

          {/* Simple Graphical Grid for Agents' CPU/RAM */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 pt-1">
            {filteredMetrics.map((item) => {
              const ramPercent = Math.round((item.ramMb / item.ramMaxMb) * 100);
              const isWorking = item.status === 'working' || isExecuting;
              const cpuClass = getCpuColor(item.cpuPercent);
              const ramClass = getRamColor(ramPercent);

              return (
                <div
                  key={item.agentId}
                  onClick={() => setSelectedAgentId(selectedAgentId === item.agentId ? null : item.agentId)}
                  className={`bg-slate-950/80 rounded-xl border p-3 transition-all cursor-pointer hover:border-slate-700 ${
                    selectedAgentId === item.agentId
                      ? 'border-indigo-500 ring-1 ring-indigo-500/40 bg-indigo-950/20'
                      : 'border-slate-800'
                  }`}
                >
                  {/* Top Bar: Icon, Name & Status */}
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 rounded-lg bg-slate-900 border border-slate-800">
                        {getAgentIcon(item.archetype)}
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-slate-200 line-clamp-1">{item.name}</h4>
                        <span className="text-[10px] font-mono text-slate-400 block">{item.archetype}</span>
                      </div>
                    </div>

                    <span
                      className={`text-[9px] font-mono px-2 py-0.5 rounded-full border ${
                        isWorking
                          ? 'bg-cyan-950/80 text-cyan-300 border-cyan-800 animate-pulse'
                          : item.status === 'verifying'
                          ? 'bg-emerald-950/80 text-emerald-300 border-emerald-800'
                          : 'bg-slate-900 text-slate-400 border-slate-800'
                      }`}
                    >
                      {isWorking ? 'RUNNING' : item.status.toUpperCase()}
                    </span>
                  </div>

                  {/* Graphical Bar 1: CPU Usage */}
                  <div className="space-y-1 mb-2">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-slate-400 flex items-center gap-1">
                        <Cpu className="w-3 h-3 text-cyan-400" />
                        المعالج (CPU):
                      </span>
                      <span className={`font-mono font-bold text-xs ${cpuClass.split(' ')[0]}`}>
                        {item.cpuPercent}%
                      </span>
                    </div>
                    <div className="w-full bg-slate-900 rounded-full h-2 overflow-hidden border border-slate-800">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${cpuClass.split(' ')[1]}`}
                        style={{ width: `${item.cpuPercent}%` }}
                      />
                    </div>
                  </div>

                  {/* Graphical Bar 2: RAM Usage */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-slate-400 flex items-center gap-1">
                        <HardDrive className="w-3 h-3 text-purple-400" />
                        الذاكرة (RAM):
                      </span>
                      <span className={`font-mono font-bold text-xs ${ramClass.split(' ')[0]}`}>
                        {item.ramMb} MB <span className="text-[9px] text-slate-500 font-normal">({ramPercent}%)</span>
                      </span>
                    </div>
                    <div className="w-full bg-slate-900 rounded-full h-2 overflow-hidden border border-slate-800">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${ramClass.split(' ')[1]}`}
                        style={{ width: `${ramPercent}%` }}
                      />
                    </div>
                  </div>

                  {/* Detailed Mode Extras: Threads, Network, Peak */}
                  {viewMode === 'detailed' && (
                    <div className="mt-2.5 pt-2 border-t border-slate-900 flex items-center justify-between text-[10px] font-mono text-slate-400">
                      <span>خيوط: <strong className="text-amber-300">{item.threads}</strong></span>
                      <span>شبكة: <strong className="text-emerald-300">{item.networkKbps} KB/s</strong></span>
                      <span>ذروة: <strong className="text-rose-300">{item.cpuPeak}%</strong></span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
};
