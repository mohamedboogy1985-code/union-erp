import React, { useState, useEffect, useCallback } from 'react';
import {
  Award,
  Users,
  GraduationCap,
  Bot,
  Calculator,
  Search,
  Plus,
  Filter,
  Sparkles,
  BookOpen,
  TrendingUp,
  ShieldCheck,
  FileSpreadsheet,
  Building2,
  Boxes,
  Mic,
  ScanText,
  Lock,
  PieChart,
  FileCode2,
  Crown,
  Split,
  CheckCircle2,
  Clock,
  X,
  Save,
  Trash2,
  Play,
  Eye,
  BarChart3,
  AlertTriangle,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import { api } from '../services/api.js';
import type { User } from '../types/erp.js';
import type { SkillCategory, SkillLevel } from '../types/erp.js';

interface SkillsHubProps {
  organizationId: string;
  currentUser: User | null;
  onShowToast: (type: 'success' | 'error' | 'warning' | 'info', msg: string) => void;
  initialTab?: SkillTabId;
}

export type SkillTabId = 'catalog' | 'hr' | 'training' | 'ai' | 'accounting' | 'overview';

const CATEGORY_META: Record<string, { label: string; icon: any; color: string; bg: string; border: string }> = {
  HR: { label: 'مهارات الموظفين', icon: Users, color: 'text-sky-400', bg: 'bg-sky-500/10', border: 'border-sky-500/30' },
  TRAINING: { label: 'مهارات تدريبية', icon: GraduationCap, color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30' },
  AI_AGENT: { label: 'مهارات المساعد الذكي', icon: Bot, color: 'text-purple-400', bg: 'bg-purple-500/10', border: 'border-purple-500/30' },
  ACCOUNTING: { label: 'إجراءات محاسبية', icon: Calculator, color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/30' },
};

const LEVEL_META: Record<string, { label: string; color: string }> = {
  BEGINNER: { label: 'مبتدئ', color: 'bg-slate-700 text-slate-300' },
  INTERMEDIATE: { label: 'متوسط', color: 'bg-sky-900/50 text-sky-300 border border-sky-700/30' },
  ADVANCED: { label: 'متقدم', color: 'bg-amber-900/50 text-amber-300 border border-amber-700/30' },
  EXPERT: { label: 'خبير', color: 'bg-purple-900/50 text-purple-300 border border-purple-700/30' },
};

const ICON_MAP: Record<string, any> = {
  Calculator, FileSpreadsheet, ShieldCheck, Users, GraduationCap, PieChart, FileCode2, Crown, Bot, Mic, TrendingUp, ScanText, Lock, Building2, Boxes, Split, Award, BookOpen, BarChart3,
};

export const SkillsHub: React.FC<SkillsHubProps> = ({ organizationId, currentUser, onShowToast, initialTab }) => {
  const [activeTab, setActiveTab] = useState<SkillTabId>(initialTab || 'overview');
  const [skills, setSkills] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [employeeSkills, setEmployeeSkills] = useState<any[]>([]);
  const [trainingPrograms, setTrainingPrograms] = useState<any[]>([]);
  const [enrollments, setEnrollments] = useState<any[]>([]);
  const [aiSkills, setAiSkills] = useState<any[]>([]);
  const [procedures, setProcedures] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

  // Modals
  const [showAddSkill, setShowAddSkill] = useState(false);
  const [showAddEmployeeSkill, setShowAddEmployeeSkill] = useState(false);
  const [showAddTraining, setShowAddTraining] = useState(false);
  const [newSkill, setNewSkill] = useState({ name: '', description: '', category: 'HR' as SkillCategory, level: 'INTERMEDIATE' as SkillLevel, estimatedHours: 10 });
  const [newEmpSkill, setNewEmpSkill] = useState({ employeeId: '', employeeName: '', skillId: '', proficiency: 70, level: 'INTERMEDIATE' as SkillLevel });
  const [newTraining, setNewTraining] = useState({ title: '', description: '', category: 'TRAINING', durationHours: 20, maxParticipants: 20, instructor: '', skillsGranted: [] as string[] });

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [skillsData, summaryData, empSkills, programs, enrs, ai, procs] = await Promise.all([
        api.getSkills(),
        api.getSkillsSummary(),
        api.getEmployeeSkills(),
        api.getTrainingPrograms(),
        api.getTrainingEnrollments(),
        api.getAiAgentSkills(),
        api.getAccountingProcedures(),
      ]);
      setSkills(skillsData);
      setSummary(summaryData);
      setEmployeeSkills(empSkills);
      setTrainingPrograms(programs);
      setEnrollments(enrs);
      setAiSkills(ai);
      setProcedures(procs);
    } catch (err: any) {
      onShowToast('error', err.message || 'تعذر تحميل المهارات');
    } finally {
      setLoading(false);
    }
  }, [onShowToast]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const filteredSkills = skills.filter((s)=>{
    const matchesSearch = !search || s.name.toLowerCase().includes(search.toLowerCase()) || s.code.toLowerCase().includes(search.toLowerCase());
    const matchesCat = categoryFilter === 'all' || s.category === categoryFilter;
    return matchesSearch && matchesCat;
  });

  const handleCreateSkill = async () => {
    if (!newSkill.name.trim()) { onShowToast('warning','أدخل اسم المهارة'); return; }
    try {
      await api.createSkill(newSkill);
      onShowToast('success', `تمت إضافة المهارة «${newSkill.name}»`);
      setShowAddSkill(false);
      setNewSkill({ name: '', description: '', category: 'HR', level: 'INTERMEDIATE', estimatedHours: 10 });
      loadAll();
    } catch (e: any) { onShowToast('error', e.message); }
  };

  const handleAddEmpSkill = async () => {
    if (!newEmpSkill.employeeId || !newEmpSkill.skillId) { onShowToast('warning','حدد الموظف والمهارة'); return; }
    try {
      await api.addEmployeeSkill(newEmpSkill);
      onShowToast('success','تم ربط المهارة بالموظف');
      setShowAddEmployeeSkill(false);
      setNewEmpSkill({ employeeId: '', employeeName: '', skillId: '', proficiency: 70, level: 'INTERMEDIATE' });
      loadAll();
    } catch (e: any) { onShowToast('error', e.message); }
  };

  const handleCreateTraining = async () => {
    if (!newTraining.title.trim()) { onShowToast('warning','أدخل عنوان البرنامج'); return; }
    try {
      await api.createTrainingProgram(newTraining);
      onShowToast('success','تم إنشاء البرنامج التدريبي');
      setShowAddTraining(false);
      setNewTraining({ title: '', description: '', category: 'TRAINING', durationHours: 20, maxParticipants: 20, instructor: '', skillsGranted: [] });
      loadAll();
    } catch (e: any) { onShowToast('error', e.message); }
  };

  const handleExecuteProcedure = async (id: string) => {
    try {
      const res = await api.executeAccountingProcedure(id);
      onShowToast('success', res.message);
    } catch (e: any) { onShowToast('error', e.message); }
  };

  const handleToggleAiSkill = async (id: string) => {
    try {
      await api.toggleAiAgentSkill(id);
      onShowToast('success','تم تغيير حالة مهارة الذكاء');
      loadAll();
    } catch (e: any) { onShowToast('error', e.message); }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-20">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-400" />
        <span className="mr-3 text-slate-400">جارٍ تحميل نظام المهارات الموحد...</span>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-indigo-600 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-600/20">
            <Award className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-2">
              نظام المهارات الموحد
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-500/20 border border-indigo-500/30 text-indigo-300 text-[10px]"><Sparkles className="w-3 h-3"/> Skills</span>
            </h1>
            <p className="text-sm text-slate-400">HR + تدريب + ذكاء اصطناعي + إجراءات محاسبية — متاح في كل البوابات</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={loadAll} className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 text-sm"><RefreshCw className="w-4 h-4"/> تحديث</button>
          <button onClick={()=>setShowAddSkill(true)} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold shadow-lg shadow-indigo-600/20"><Plus className="w-4 h-4"/> إضافة مهارة</button>
        </div>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
          <div className="rounded-xl bg-slate-900 border border-slate-800 p-3">
            <div className="text-xl font-bold text-white font-mono">{summary.totalSkills}</div>
            <div className="text-[11px] text-slate-400">إجمالي المهارات</div>
          </div>
          <div className="rounded-xl bg-sky-950/30 border border-sky-800/30 p-3">
            <div className="text-xl font-bold text-sky-300 font-mono">{summary.byCategory?.HR || 0}</div>
            <div className="text-[11px] text-sky-300/70">موظفين</div>
          </div>
          <div className="rounded-xl bg-emerald-950/30 border border-emerald-800/30 p-3">
            <div className="text-xl font-bold text-emerald-300 font-mono">{summary.byCategory?.TRAINING || 0}</div>
            <div className="text-[11px] text-emerald-300/70">تدريبية</div>
          </div>
          <div className="rounded-xl bg-purple-950/30 border border-purple-800/30 p-3">
            <div className="text-xl font-bold text-purple-300 font-mono">{summary.byCategory?.AI_AGENT || 0}</div>
            <div className="text-[11px] text-purple-300/70">ذكاء اصطناعي</div>
          </div>
          <div className="rounded-xl bg-amber-950/30 border border-amber-800/30 p-3">
            <div className="text-xl font-bold text-amber-300 font-mono">{summary.byCategory?.ACCOUNTING || 0}</div>
            <div className="text-[11px] text-amber-300/70">محاسبية</div>
          </div>
          <div className="rounded-xl bg-slate-900 border border-slate-800 p-3">
            <div className="text-xl font-bold text-indigo-300 font-mono">{summary.totalTrainingPrograms}</div>
            <div className="text-[11px] text-slate-400">برامج تدريبية</div>
          </div>
          <div className="rounded-xl bg-slate-900 border border-slate-800 p-3">
            <div className="text-xl font-bold text-rose-300 font-mono">{summary.totalEmployeeSkills}</div>
            <div className="text-[11px] text-slate-400">ربط موظف-مهارة</div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-900 border border-slate-800 overflow-x-auto">
        {[
          { id: 'overview', label: 'نظرة عامة', icon: BarChart3 },
          { id: 'catalog', label: 'كتالوج المهارات', icon: Award },
          { id: 'hr', label: 'مهارات الموظفين', icon: Users },
          { id: 'training', label: 'برامج التدريب', icon: GraduationCap },
          { id: 'ai', label: 'مهارات AI', icon: Bot },
          { id: 'accounting', label: 'إجراءات محاسبية', icon: Calculator },
        ].map((t)=>{
          const Icon = t.icon;
          return (
            <button key={t.id} onClick={()=>setActiveTab(t.id as any)} className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold whitespace-nowrap transition ${activeTab===t.id ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'}`}>
              <Icon className="w-4 h-4"/>{t.label}
            </button>
          );
        })}
      </div>

      {/* Search + Filter */}
      <div className="flex flex-col md:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input value={search} onChange={(e)=>setSearch(e.target.value)} placeholder="ابحث في المهارات بالاسم أو الكود..." className="w-full pr-10 pl-4 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-slate-200 text-sm focus:outline-none focus:border-indigo-500 placeholder:text-slate-500" />
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-900 border border-slate-800">
            <Filter className="w-3.5 h-3.5 text-slate-500 mr-1" />
            <select value={categoryFilter} onChange={(e)=>setCategoryFilter(e.target.value)} className="bg-transparent text-xs text-slate-300 focus:outline-none">
              <option value="all">كل الفئات</option>
              <option value="HR">موظفين</option>
              <option value="TRAINING">تدريبية</option>
              <option value="AI_AGENT">ذكاء اصطناعي</option>
              <option value="ACCOUNTING">محاسبية</option>
            </select>
          </div>
        </div>
      </div>

      {/* Content */}
      {activeTab === 'overview' && summary && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="rounded-xl bg-slate-900 border border-slate-800 p-4">
            <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2"><TrendingUp className="w-4 h-4 text-indigo-400"/> أكثر المهارات طلباً</h3>
            <div className="space-y-2">
              {summary.topSkills?.length ? summary.topSkills.map((t: any)=>(
                <div key={t.skillId} className="flex items-center justify-between p-2 rounded-lg bg-slate-800/50">
                  <span className="text-xs text-slate-200">{t.skillName}</span>
                  <span className="text-xs font-mono text-indigo-300 bg-indigo-500/15 px-2 py-0.5 rounded-full">{t.count} موظف</span>
                </div>
              )) : <p className="text-xs text-slate-500">لا توجد بيانات بعد</p>}
            </div>
          </div>
          <div className="rounded-xl bg-slate-900 border border-slate-800 p-4">
            <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-amber-400"/> مهارات قاربت على الانتهاء (30 يوم)</h3>
            <div className="space-y-2">
              {summary.expiringSoon?.length ? summary.expiringSoon.map((es: any)=>(
                <div key={es.id} className="flex items-center justify-between p-2 rounded-lg bg-amber-950/20 border border-amber-800/20">
                  <div><div className="text-xs text-amber-200 font-bold">{es.employeeName}</div><div className="text-[11px] text-slate-400">{es.skillName}</div></div>
                  <span className="text-[10px] text-amber-300">{es.expiryDate}</span>
                </div>
              )) : <p className="text-xs text-slate-500">لا توجد مهارات منتهية قريباً</p>}
            </div>
          </div>
          <div className="lg:col-span-2 rounded-xl bg-gradient-to-br from-indigo-950/30 to-purple-950/30 border border-indigo-800/30 p-4">
            <h3 className="text-sm font-bold text-white mb-2">كيف تعمل المهارات في كل البوابات؟</h3>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
              <div className="p-3 rounded-xl bg-sky-950/30 border border-sky-800/20"><Users className="w-5 h-5 text-sky-400 mb-2"/><b className="text-sky-200">HR</b><p className="text-slate-400 mt-1">تتبع مهارات كل موظف ومستوى إتقانه، مع شهادات وتحقق.</p></div>
              <div className="p-3 rounded-xl bg-emerald-950/30 border border-emerald-800/20"><GraduationCap className="w-5 h-5 text-emerald-400 mb-2"/><b className="text-emerald-200">Training</b><p className="text-slate-400 mt-1">برامج تدريبية تمنح مهارات، مع تسجيل وتقدم ودرجات.</p></div>
              <div className="p-3 rounded-xl bg-purple-950/30 border border-purple-800/20"><Bot className="w-5 h-5 text-purple-400 mb-2"/><b className="text-purple-200">AI Agent</b><p className="text-slate-400 mt-1">قدرات المساعد الذكي: تحليل، صوت، تنبؤ، OCR.</p></div>
              <div className="p-3 rounded-xl bg-amber-950/30 border border-amber-800/20"><Calculator className="w-5 h-5 text-amber-400 mb-2"/><b className="text-amber-200">Accounting</b><p className="text-slate-400 mt-1">قوالب إجراءات محاسبية جاهزة للتنفيذ الآلي بضغطة.</p></div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'catalog' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {filteredSkills.map((skill)=>{
            const cat = CATEGORY_META[skill.category] || CATEGORY_META.HR;
            const lvl = LEVEL_META[skill.level] || LEVEL_META.INTERMEDIATE;
            const Icon = ICON_MAP[skill.icon] || Award;
            return (
              <div key={skill.id} className={`rounded-xl bg-slate-900 border ${cat.border} p-4 hover:border-indigo-500/40 transition group`}>
                <div className="flex items-start gap-3">
                  <div className={`h-10 w-10 rounded-xl ${cat.bg} border ${cat.border} flex items-center justify-center shrink-0`}><Icon className={`w-5 h-5 ${cat.color}`} /></div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="text-sm font-bold text-white truncate">{skill.name}</h4>
                      <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${lvl.color}`}>{lvl.label}</span>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-1 line-clamp-2">{skill.description}</p>
                    <div className="flex items-center gap-2 mt-2">
                      <span className="text-[10px] font-mono text-slate-500">{skill.code}</span>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full border ${cat.bg} ${cat.border} ${cat.color}`}>{cat.label}</span>
                      {skill.estimatedHours ? <span className="text-[10px] text-slate-500 flex items-center gap-1"><Clock className="w-3 h-3"/>{skill.estimatedHours}س</span> : null}
                    </div>
                  </div>
                </div>
                <div className="flex items-center justify-between mt-3 pt-2 border-t border-slate-800">
                  <span className={`text-[10px] px-2 py-1 rounded-full ${skill.isActive ? 'bg-emerald-500/15 text-emerald-300' : 'bg-slate-700 text-slate-400'}`}>{skill.isActive ? 'نشط' : 'غير نشط'}</span>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
                    <button onClick={async()=>{ if(confirm('حذف المهارة؟')){ await api.deleteSkill(skill.id); loadAll(); } }} className="p-1.5 rounded-lg text-slate-400 hover:text-rose-300 hover:bg-slate-800"><Trash2 className="w-3.5 h-3.5"/></button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {activeTab === 'hr' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white">مهارات الموظفين — ربط وتتبع</h3>
            <button onClick={()=>setShowAddEmployeeSkill(true)} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold"><Plus className="w-3.5 h-3.5"/> ربط مهارة بموظف</button>
          </div>
          <div className="rounded-xl bg-slate-900 border border-slate-800 overflow-hidden">
            <table className="w-full text-right text-sm">
              <thead className="bg-[#1e293b] text-[11px] text-slate-400">
                <tr><th className="px-4 py-2">الموظف</th><th className="px-3 py-2">المهارة</th><th className="px-3 py-2">المستوى</th><th className="px-3 py-2">الإتقان</th><th className="px-3 py-2">التحقق</th><th className="px-3 py-2 text-left">إجراء</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {employeeSkills.filter((es)=>!search || es.employeeName.includes(search) || es.skillName.includes(search)).map((es)=>(
                  <tr key={es.id} className="hover:bg-slate-800/40">
                    <td className="px-4 py-2.5 text-slate-100 font-bold">{es.employeeName}<span className="text-[10px] text-slate-500 font-mono block">{es.employeeId}</span></td>
                    <td className="px-3 py-2.5"><span className="text-xs text-slate-200">{es.skillName}</span><span className="text-[10px] text-slate-500 block">{es.skillCategory}</span></td>
                    <td className="px-3 py-2.5"><span className={`text-[10px] px-2 py-0.5 rounded-full ${LEVEL_META[es.level]?.color}`}>{LEVEL_META[es.level]?.label || es.level}</span></td>
                    <td className="px-3 py-2.5"><div className="flex items-center gap-2"><div className="w-16 h-1.5 rounded-full bg-slate-800 overflow-hidden"><div className="h-full bg-sky-500" style={{ width: `${es.proficiency}%` }} /></div><span className="text-[11px] font-mono text-sky-300">{es.proficiency}%</span></div></td>
                    <td className="px-3 py-2.5">{es.verified ? <CheckCircle2 className="w-4 h-4 text-emerald-400"/> : <Clock className="w-4 h-4 text-amber-400"/>}</td>
                    <td className="px-3 py-2.5 text-left"><button onClick={async()=>{ await api.deleteEmployeeSkill(es.id); loadAll(); }} className="p-1.5 rounded-lg text-slate-400 hover:text-rose-300 hover:bg-slate-800"><Trash2 className="w-4 h-4"/></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'training' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white">برامج التدريب — مركز التدريب</h3>
            <button onClick={()=>setShowAddTraining(true)} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold"><Plus className="w-3.5 h-3.5"/> برنامج جديد</button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {trainingPrograms.map((prog)=>(
              <div key={prog.id} className="rounded-xl bg-slate-900 border border-slate-800 p-4">
                <div className="flex items-start justify-between">
                  <div><h4 className="text-sm font-bold text-white">{prog.title}</h4><p className="text-[11px] text-slate-400 mt-1">{prog.description}</p></div>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full ${prog.status==='OPEN' ? 'bg-emerald-500/15 text-emerald-300' : prog.status==='IN_PROGRESS' ? 'bg-amber-500/15 text-amber-300' : 'bg-slate-700 text-slate-400'}`}>{prog.status}</span>
                </div>
                <div className="flex items-center gap-3 mt-3 text-[11px] text-slate-400">
                  <span className="flex items-center gap-1"><Clock className="w-3 h-3"/>{prog.durationHours}س</span>
                  <span className="flex items-center gap-1"><Users className="w-3 h-3"/>{prog.maxParticipants} مشارك</span>
                  {prog.instructor && <span>{prog.instructor}</span>}
                </div>
                <div className="mt-2 flex flex-wrap gap-1">
                  {prog.skillsGranted?.map((sid: string)=>{ const s = skills.find((x)=>x.id===sid); return <span key={sid} className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-500/15 text-indigo-300 border border-indigo-500/20">{s?.name || sid}</span>; })}
                </div>
                <div className="mt-3">
                  <div className="text-[11px] text-slate-500 mb-1">المسجلون: {enrollments.filter((e)=>e.programId===prog.id).length}</div>
                  <div className="flex gap-1 flex-wrap">
                    {enrollments.filter((e)=>e.programId===prog.id).slice(0,5).map((e)=>(
                      <span key={e.id} className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-300">{e.employeeName} {e.progress}%</span>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'ai' && (
        <div className="space-y-4">
          <h3 className="text-sm font-bold text-white flex items-center gap-2"><Bot className="w-4 h-4 text-purple-400"/> مهارات المساعد الذكي — Agent Skills</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {aiSkills.map((a)=>(
              <div key={a.id} className="rounded-xl bg-gradient-to-br from-purple-950/20 to-indigo-950/20 border border-purple-800/30 p-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2"><div className="h-9 w-9 rounded-xl bg-purple-600/20 border border-purple-500/30 flex items-center justify-center"><Bot className="w-5 h-5 text-purple-300"/></div><div><h4 className="text-sm font-bold text-purple-100">{a.skillName}</h4><p className="text-[11px] text-purple-300/60">{a.agentName}</p></div></div>
                  <button onClick={()=>handleToggleAiSkill(a.id)} className={`px-2.5 py-1 rounded-full text-[10px] font-bold border ${a.isEnabled ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' : 'bg-slate-700 text-slate-400 border-slate-600'}`}>{a.isEnabled ? 'مفعل' : 'معطل'}</button>
                </div>
                <p className="text-xs text-slate-300 mt-3 leading-relaxed">{a.capability}</p>
                <div className="flex items-center gap-4 mt-3 text-[11px]">
                  <span className="text-slate-400">الاستخدام: <b className="text-white font-mono">{a.usageCount}</b></span>
                  <span className="text-slate-400">النجاح: <b className="text-emerald-300 font-mono">{a.successRate}%</b></span>
                  <div className="flex-1 h-1.5 rounded-full bg-slate-800 overflow-hidden"><div className="h-full bg-purple-500" style={{ width: `${a.successRate}%` }}/></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'accounting' && (
        <div className="space-y-4">
          <h3 className="text-sm font-bold text-white flex items-center gap-2"><Calculator className="w-4 h-4 text-amber-400"/> إجراءات محاسبية — قوالب جاهزة للتنفيذ</h3>
          <div className="grid grid-cols-1 gap-3">
            {procedures.map((proc)=>{
              const catColors: any = { CLOSING: 'text-slate-300 bg-slate-800', RECONCILIATION: 'text-sky-300 bg-sky-900/30', DEPRECIATION: 'text-orange-300 bg-orange-900/30', BUDGET: 'text-indigo-300 bg-indigo-900/30', AUDIT: 'text-amber-300 bg-amber-900/30', REPORT: 'text-emerald-300 bg-emerald-900/30' };
              return (
                <div key={proc.id} className="rounded-xl bg-slate-900 border border-slate-800 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2"><h4 className="text-sm font-bold text-white">{proc.title}</h4><span className={`text-[10px] px-2 py-0.5 rounded-full ${catColors[proc.category] || 'bg-slate-800 text-slate-400'}`}>{proc.category}</span>{proc.isAutomated && <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/20 flex items-center gap-1"><Sparkles className="w-3 h-3"/>آلي</span>}</div>
                      <p className="text-xs text-slate-400 mt-1">{proc.description}</p>
                      <div className="mt-3 space-y-1.5">
                        {proc.steps?.map((st: any)=>(
                          <div key={st.order} className="flex items-start gap-2 text-xs"><span className="h-5 w-5 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-[10px] font-mono text-slate-400 shrink-0">{st.order}</span><div><b className="text-slate-200">{st.title}</b><span className="text-slate-500"> — {st.description}</span>{st.automated && <span className="mr-2 text-[10px] text-emerald-400">⚡ آلي</span>}</div></div>
                        ))}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-2 shrink-0">
                      <span className="text-[11px] text-slate-500 flex items-center gap-1"><Clock className="w-3 h-3"/>{proc.estimatedMinutes} دقيقة</span>
                      <button onClick={()=>handleExecuteProcedure(proc.id)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold"><Play className="w-3.5 h-3.5"/> تنفيذ الآن</button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Add Skill Modal */}
      {showAddSkill && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-md bg-[#1e293b] border border-slate-700 rounded-2xl shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700"><h3 className="text-sm font-bold text-white">إضافة مهارة جديدة</h3><button onClick={()=>setShowAddSkill(false)} className="p-1 text-slate-400 hover:text-white"><X className="w-4 h-4"/></button></div>
            <div className="p-4 space-y-3 bg-[#0f172a]">
              <input value={newSkill.name} onChange={(e)=>setNewSkill({...newSkill, name: e.target.value})} placeholder="اسم المهارة (مثلاً: محاسبة ضريبية)" className="w-full px-3 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-sm text-slate-200 focus:border-indigo-500 focus:outline-none" />
              <textarea value={newSkill.description} onChange={(e)=>setNewSkill({...newSkill, description: e.target.value})} placeholder="وصف المهارة..." rows={2} className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-sm text-slate-200 focus:border-indigo-500 focus:outline-none" />
              <div className="grid grid-cols-2 gap-2">
                <select value={newSkill.category} onChange={(e)=>setNewSkill({...newSkill, category: e.target.value as any})} className="px-3 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-sm text-slate-200 focus:outline-none"><option value="HR">موظفين</option><option value="TRAINING">تدريبية</option><option value="AI_AGENT">ذكاء اصطناعي</option><option value="ACCOUNTING">محاسبية</option></select>
                <select value={newSkill.level} onChange={(e)=>setNewSkill({...newSkill, level: e.target.value as any})} className="px-3 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-sm text-slate-200 focus:outline-none"><option value="BEGINNER">مبتدئ</option><option value="INTERMEDIATE">متوسط</option><option value="ADVANCED">متقدم</option><option value="EXPERT">خبير</option></select>
              </div>
              <input type="number" value={newSkill.estimatedHours} onChange={(e)=>setNewSkill({...newSkill, estimatedHours: Number(e.target.value)})} placeholder="الساعات المقدرة" className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-sm text-slate-200" />
              <button onClick={handleCreateSkill} className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold"><Save className="w-4 h-4"/> حفظ المهارة</button>
            </div>
          </div>
        </div>
      )}

      {/* Add Employee Skill Modal */}
      {showAddEmployeeSkill && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-md bg-[#1e293b] border border-slate-700 rounded-2xl shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700"><h3 className="text-sm font-bold text-white">ربط مهارة بموظف</h3><button onClick={()=>setShowAddEmployeeSkill(false)} className="p-1 text-slate-400 hover:text-white"><X className="w-4 h-4"/></button></div>
            <div className="p-4 space-y-3 bg-[#0f172a]">
              <input value={newEmpSkill.employeeId} onChange={(e)=>setNewEmpSkill({...newEmpSkill, employeeId: e.target.value, employeeName: e.target.value})} placeholder="كود الموظف (EMP-001)" className="w-full px-3 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-sm text-slate-200" />
              <input value={newEmpSkill.employeeName} onChange={(e)=>setNewEmpSkill({...newEmpSkill, employeeName: e.target.value})} placeholder="اسم الموظف" className="w-full px-3 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-sm text-slate-200" />
              <select value={newEmpSkill.skillId} onChange={(e)=>setNewEmpSkill({...newEmpSkill, skillId: e.target.value})} className="w-full px-3 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-sm text-slate-200">
                <option value="">اختر المهارة...</option>
                {skills.map((s)=><option key={s.id} value={s.id}>{s.name} ({s.code})</option>)}
              </select>
              <div className="flex items-center gap-2">
                <label className="text-xs text-slate-400">الإتقان {newEmpSkill.proficiency}%</label>
                <input type="range" min={0} max={100} value={newEmpSkill.proficiency} onChange={(e)=>setNewEmpSkill({...newEmpSkill, proficiency: Number(e.target.value)})} className="flex-1" />
              </div>
              <button onClick={handleAddEmpSkill} className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-sm font-bold"><Save className="w-4 h-4"/> ربط المهارة</button>
            </div>
          </div>
        </div>
      )}

      {/* Add Training Modal */}
      {showAddTraining && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-lg bg-[#1e293b] border border-slate-700 rounded-2xl shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700"><h3 className="text-sm font-bold text-white">برنامج تدريبي جديد</h3><button onClick={()=>setShowAddTraining(false)} className="p-1 text-slate-400 hover:text-white"><X className="w-4 h-4"/></button></div>
            <div className="p-4 space-y-3 bg-[#0f172a] max-h-[70vh] overflow-y-auto">
              <input value={newTraining.title} onChange={(e)=>setNewTraining({...newTraining, title: e.target.value})} placeholder="عنوان البرنامج" className="w-full px-3 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-sm text-slate-200" />
              <textarea value={newTraining.description} onChange={(e)=>setNewTraining({...newTraining, description: e.target.value})} placeholder="وصف البرنامج..." rows={2} className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-sm text-slate-200" />
              <div className="grid grid-cols-2 gap-2">
                <input type="number" value={newTraining.durationHours} onChange={(e)=>setNewTraining({...newTraining, durationHours: Number(e.target.value)})} placeholder="المدة بالساعات" className="px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-sm text-slate-200" />
                <input type="number" value={newTraining.maxParticipants} onChange={(e)=>setNewTraining({...newTraining, maxParticipants: Number(e.target.value)})} placeholder="الحد الأقصى" className="px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-sm text-slate-200" />
              </div>
              <input value={newTraining.instructor} onChange={(e)=>setNewTraining({...newTraining, instructor: e.target.value})} placeholder="المدرب" className="w-full px-3 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-sm text-slate-200" />
              <button onClick={handleCreateTraining} className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold"><Save className="w-4 h-4"/> إنشاء البرنامج</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SkillsHub;
