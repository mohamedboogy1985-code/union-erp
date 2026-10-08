import React, { useState, useEffect } from 'react';
import {
  TrendingUp,
  ShieldAlert,
  ShieldCheck,
  Calculator,
  Activity,
  DollarSign,
  Users,
  AlertTriangle,
  RefreshCw,
  Plus,
  ArrowUpRight,
  ArrowDownRight,
  Layers,
  Sparkles,
  Sliders,
  CheckCircle2,
  FileSpreadsheet,
  Download,
  Info,
  Calendar,
  PieChart,
  BarChart3,
  Percent,
  X,
  FileText,
  Clock,
  HeartHandshake,
} from 'lucide-react';
import { api } from '../services/api.js';
import {
  ActuarialFund,
  ActuarialSimulationParams,
  ActuarialSimulationResult,
  User,
} from '../types/erp.js';

interface ActuarialStudioProps {
  organizationId: string;
  currentUser: User | null;
  onShowToast: (type: 'success' | 'error' | 'warning' | 'info', msg: string) => void;
}

export const ActuarialStudio: React.FC<ActuarialStudioProps> = ({
  organizationId,
  currentUser,
  onShowToast,
}) => {
  const [funds, setFunds] = useState<ActuarialFund[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'simulation' | 'stress_testing'>('overview');
  
  // Selected Fund for Simulation
  const [selectedFundId, setSelectedFundId] = useState<string>('');
  const [simulationResult, setSimulationResult] = useState<ActuarialSimulationResult | null>(null);
  const [simulating, setSimulating] = useState(false);

  // Simulation Parameters
  const [simParams, setSimParams] = useState<ActuarialSimulationParams>({
    fundId: '',
    horizonYears: 10,
    expectedAnnualReturn: 9.5,
    expectedInflation: 11.0,
    pensionIncreaseRate: 8.0,
    memberGrowthRate: 2.5,
    retirementRate: 4.0,
  });

  // Modal State for New/Edit Fund
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingFund, setEditingFund] = useState<Partial<ActuarialFund> | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadFunds();
  }, [organizationId]);

  const loadFunds = async () => {
    setLoading(true);
    try {
      const data = await api.getActuarialFunds();
      setFunds(data);
      if (data.length > 0 && !selectedFundId) {
        setSelectedFundId(data[0].id);
        setSimParams((prev) => ({ ...prev, fundId: data[0].id }));
        // Run initial simulation for the first fund
        runSimulationForFund(data[0].id);
      }
    } catch (err: any) {
      console.error(err);
      onShowToast('error', 'فشل في تحميل بيانات الصناديق الإكتوارية من PostgreSQL.');
    } finally {
      setLoading(false);
    }
  };

  const runSimulationForFund = async (fundId: string, customParams?: Partial<ActuarialSimulationParams>) => {
    setSimulating(true);
    try {
      const paramsToRun = {
        ...simParams,
        fundId,
        ...(customParams || {}),
      };
      const result = await api.simulateActuarialProjections(paramsToRun);
      setSimulationResult(result);
    } catch (err: any) {
      console.error(err);
      onShowToast('error', 'تعذر تشغيل نموذج المحاكاة الإكتوارية.');
    } finally {
      setSimulating(false);
    }
  };

  const handleRunSimulation = () => {
    if (!selectedFundId) {
      onShowToast('warning', 'يرجى اختيار صندوق لإجراء المحاكاة.');
      return;
    }
    runSimulationForFund(selectedFundId, simParams);
  };

  const handleOpenAddModal = () => {
    setEditingFund({
      name: '',
      code: `FND-${Math.floor(100 + Math.random() * 900)}`,
      type: 'PENSION',
      currentReserve: 5000000,
      targetReserve: 6000000,
      discountRate: 8.5,
      inflationRate: 11.0,
      activeMembersCount: 5000,
      beneficiariesCount: 800,
      monthlyInflow: 400000,
      monthlyOutflow: 450000,
      notes: '',
    });
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (fund: ActuarialFund) => {
    setEditingFund({ ...fund });
    setIsModalOpen(true);
  };

  const handleSaveFund = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingFund?.name) {
      onShowToast('warning', 'يرجى إدخال اسم الصندوق.');
      return;
    }

    setSubmitting(true);
    try {
      if (editingFund.id) {
        await api.updateActuarialFund(editingFund.id, editingFund);
        onShowToast('success', 'تم تحديث التقييم والبيانات الإكتوارية للصندوق بنجاح.');
      } else {
        await api.createActuarialFund(editingFund);
        onShowToast('success', 'تم تأسيس وإضافة الصندوق الإكتواري بنجاح في PostgreSQL.');
      }
      setIsModalOpen(false);
      setEditingFund(null);
      loadFunds();
    } catch (err: any) {
      onShowToast('error', err.message || 'فشل في حفظ بيانات الصندوق.');
    } finally {
      setSubmitting(false);
    }
  };

  // Aggregate KPI Calculations
  const totalReserve = funds.reduce((acc, f) => acc + (f.currentReserve || 0), 0);
  const totalTargetReserve = funds.reduce((acc, f) => acc + (f.targetReserve || 0), 0);
  const totalMembers = funds.reduce((acc, f) => acc + (f.activeMembersCount || 0), 0);
  const totalBeneficiaries = funds.reduce((acc, f) => acc + (f.beneficiariesCount || 0), 0);
  const totalMonthlyInflow = funds.reduce((acc, f) => acc + (f.monthlyInflow || 0), 0);
  const totalMonthlyOutflow = funds.reduce((acc, f) => acc + (f.monthlyOutflow || 0), 0);
  const netMonthlyCashFlow = totalMonthlyInflow - totalMonthlyOutflow;
  const overallSolvency = totalTargetReserve > 0 ? (totalReserve / totalTargetReserve) * 100 : 100;

  const selectedFund = funds.find((f) => f.id === selectedFundId) || funds[0];

  return (
    <div className="space-y-6 animate-fadeIn pb-12">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900 border border-slate-800 p-5 rounded-2xl shadow-xl">
        <div className="flex items-center gap-3.5">
          <div className="p-3 bg-gradient-to-br from-indigo-600 to-purple-600 rounded-xl text-white shadow-lg shadow-indigo-900/40">
            <Calculator className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h2 className="text-xl font-black text-slate-100">
                استوديو الدراسات الإكتوارية وصناديق المعاشات والتكافل
              </h2>
              <span className="bg-indigo-950 text-indigo-400 border border-indigo-800/60 text-[11px] font-mono font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-purple-400" />
                Cloud SQL & Actuarial Model
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              إدارة الاحتياطيات المالية، نمذجة تدفقات المعاشات طويلة الأجل، واختبارات الملاءة والتحمل (Stress Testing).
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={loadFunds}
            disabled={loading}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold rounded-xl border border-slate-700 transition"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            تحديث
          </button>
          <button
            onClick={handleOpenAddModal}
            className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl transition shadow-lg shadow-indigo-900/40"
          >
            <Plus className="w-4 h-4" />
            تأسيس صندوق جديد
          </button>
        </div>
      </div>

      {/* Primary KPI Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
        {/* Total Reserve */}
        <div className="p-4 bg-slate-900/90 border border-slate-800 rounded-2xl relative overflow-hidden shadow-lg">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
            <span>إجمالي الاحتياطيات الحالية</span>
            <DollarSign className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-xl font-black font-mono text-emerald-400">
            {totalReserve.toLocaleString()} <span className="text-xs font-sans text-slate-500">ج.م</span>
          </div>
          <div className="text-[11px] text-slate-500 mt-1 font-mono">
            المستهدف: {totalTargetReserve.toLocaleString()} ج.م
          </div>
        </div>

        {/* Overall Solvency */}
        <div className="p-4 bg-slate-900/90 border border-slate-800 rounded-2xl relative overflow-hidden shadow-lg">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
            <span>متوسط الملاءة الإكتوارية</span>
            {overallSolvency >= 100 ? (
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
            ) : (
              <ShieldAlert className="w-4 h-4 text-amber-400" />
            )}
          </div>
          <div className="flex items-baseline gap-1.5">
            <span
              className={`text-2xl font-black font-mono ${
                overallSolvency >= 100 ? 'text-emerald-400' : overallSolvency >= 85 ? 'text-amber-400' : 'text-rose-400'
              }`}
            >
              {overallSolvency.toFixed(1)}%
            </span>
            <span className="text-[11px] text-slate-500 font-mono">
              {overallSolvency >= 100 ? 'آمن وفائض' : 'تحت المراقبة'}
            </span>
          </div>
          <div className="w-full bg-slate-800 h-1.5 rounded-full mt-2 overflow-hidden">
            <div
              className={`h-full ${
                overallSolvency >= 100 ? 'bg-emerald-500' : overallSolvency >= 85 ? 'bg-amber-500' : 'bg-rose-500'
              }`}
              style={{ width: `${Math.min(100, overallSolvency)}%` }}
            ></div>
          </div>
        </div>

        {/* Active Members */}
        <div className="p-4 bg-slate-900/90 border border-slate-800 rounded-2xl relative overflow-hidden shadow-lg">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
            <span>المشتركون النشطون</span>
            <Users className="w-4 h-4 text-sky-400" />
          </div>
          <div className="text-xl font-black font-mono text-sky-400">
            {totalMembers.toLocaleString()} <span className="text-xs font-sans text-slate-500">عضو</span>
          </div>
          <div className="text-[11px] text-slate-500 mt-1 font-mono">المستفيدون: {totalBeneficiaries.toLocaleString()}</div>
        </div>

        {/* Inflow vs Outflow */}
        <div className="p-4 bg-slate-900/90 border border-slate-800 rounded-2xl relative overflow-hidden shadow-lg">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
            <span>صافي التدفق الشهري</span>
            {netMonthlyCashFlow >= 0 ? (
              <ArrowUpRight className="w-4 h-4 text-emerald-400" />
            ) : (
              <ArrowDownRight className="w-4 h-4 text-rose-400" />
            )}
          </div>
          <div
            className={`text-xl font-black font-mono ${
              netMonthlyCashFlow >= 0 ? 'text-emerald-400' : 'text-rose-400'
            }`}
          >
            {netMonthlyCashFlow >= 0 ? '+' : ''}
            {netMonthlyCashFlow.toLocaleString()}{' '}
            <span className="text-xs font-sans text-slate-500">ج.م/شهر</span>
          </div>
          <div className="text-[11px] text-slate-500 mt-1 font-mono">
            وارد: {totalMonthlyInflow.toLocaleString()} | صادر: {totalMonthlyOutflow.toLocaleString()}
          </div>
        </div>

        {/* Active Funds Count */}
        <div className="p-4 bg-slate-900/90 border border-slate-800 rounded-2xl relative overflow-hidden shadow-lg">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
            <span>الصناديق المسجلة</span>
            <Layers className="w-4 h-4 text-purple-400" />
          </div>
          <div className="text-xl font-black font-mono text-purple-400">
            {funds.length} <span className="text-xs font-sans text-slate-500">صناديق</span>
          </div>
          <div className="text-[11px] text-slate-500 mt-1 font-mono">Cloud SQL: actuarial_funds</div>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
        <button
          onClick={() => setActiveTab('overview')}
          className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-xl transition ${
            activeTab === 'overview'
              ? 'bg-indigo-600 text-white shadow-md shadow-indigo-900/30'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
          }`}
        >
          <Layers className="w-4 h-4" />
          نظرة عامة وصناديق النقابة ({funds.length})
        </button>

        <button
          onClick={() => setActiveTab('simulation')}
          className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-xl transition ${
            activeTab === 'simulation'
              ? 'bg-indigo-600 text-white shadow-md shadow-indigo-900/30'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
          }`}
        >
          <TrendingUp className="w-4 h-4" />
          محاكي التنبؤ ومسار الاحتياطي (Simulation Engine)
        </button>

        <button
          onClick={() => setActiveTab('stress_testing')}
          className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-xl transition ${
            activeTab === 'stress_testing'
              ? 'bg-indigo-600 text-white shadow-md shadow-indigo-900/30'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
          }`}
        >
          <AlertTriangle className="w-4 h-4" />
          مصفوفة حساسية الصدمات (Stress Testing)
        </button>
      </div>

      {/* TAB 1: OVERVIEW & FUNDS LIST */}
      {activeTab === 'overview' && (
        <div className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {funds.map((fund) => {
              const solvency = fund.targetReserve > 0 ? (fund.currentReserve / fund.targetReserve) * 100 : 100;
              const isDeficit = fund.currentReserve < fund.targetReserve;
              const isSelected = selectedFundId === fund.id;

              return (
                <div
                  key={fund.id}
                  className={`bg-slate-900 border rounded-2xl p-5 transition-all shadow-xl relative ${
                    isSelected ? 'border-indigo-500 ring-1 ring-indigo-500/50' : 'border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex items-center gap-3">
                      <div className="p-2.5 bg-slate-950 border border-slate-800 rounded-xl text-indigo-400">
                        {fund.type === 'PENSION' ? (
                          <HeartHandshake className="w-5 h-5 text-amber-400" />
                        ) : fund.type === 'HEALTHCARE' ? (
                          <Activity className="w-5 h-5 text-emerald-400" />
                        ) : (
                          <ShieldCheck className="w-5 h-5 text-sky-400" />
                        )}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="font-bold text-sm text-slate-100">{fund.name}</h4>
                          <span className="text-[10px] font-mono px-2 py-0.5 bg-slate-950 text-slate-400 rounded border border-slate-800">
                            {fund.code}
                          </span>
                        </div>
                        <span className="text-[11px] text-slate-400 font-mono">
                          آخر تقييم: {fund.lastValuationDate || '2026-06-30'}
                        </span>
                      </div>
                    </div>

                    <span
                      className={`text-[10px] font-bold px-2.5 py-1 rounded-full border flex items-center gap-1 ${
                        solvency >= 100
                          ? 'bg-emerald-950 text-emerald-400 border-emerald-800/50'
                          : solvency >= 85
                          ? 'bg-amber-950 text-amber-400 border-amber-800/50'
                          : 'bg-rose-950 text-rose-400 border-rose-800/50'
                      }`}
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-current"></span>
                      {solvency >= 100 ? 'ملاءة آمنة (فائض)' : solvency >= 85 ? 'تحت المراقبة' : 'عجز إكتواري'}
                    </span>
                  </div>

                  {/* Financial metrics grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 p-3 bg-slate-950 rounded-xl border border-slate-800/80 mb-3.5 text-xs">
                    <div>
                      <span className="text-[10px] text-slate-500 block">الاحتياطي الحالي</span>
                      <span className="font-black font-mono text-emerald-400 text-xs">
                        {fund.currentReserve.toLocaleString()} ج.م
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500 block">الاحتياطي المستهدف</span>
                      <span className="font-black font-mono text-slate-300 text-xs">
                        {fund.targetReserve.toLocaleString()} ج.م
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500 block">الفائض / العجز</span>
                      <span
                        className={`font-black font-mono text-xs ${
                          fund.actuarialSurplusDeficit >= 0 ? 'text-emerald-400' : 'text-rose-400'
                        }`}
                      >
                        {fund.actuarialSurplusDeficit >= 0 ? '+' : ''}
                        {fund.actuarialSurplusDeficit.toLocaleString()} ج.م
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500 block">نسبة الملاءة</span>
                      <span className="font-black font-mono text-indigo-400 text-xs">{solvency.toFixed(1)}%</span>
                    </div>
                  </div>

                  {/* Parameters & Demographics */}
                  <div className="flex flex-wrap items-center justify-between text-[11px] text-slate-400 pt-1 pb-3 border-b border-slate-800/80">
                    <div className="flex items-center gap-3">
                      <span>مشتركون: <strong className="text-slate-200">{fund.activeMembersCount.toLocaleString()}</strong></span>
                      <span>مستفيدون: <strong className="text-slate-200">{fund.beneficiariesCount.toLocaleString()}</strong></span>
                    </div>
                    <div className="flex items-center gap-3 font-mono text-[10px]">
                      <span>معدل الخصم: <strong className="text-indigo-400">{fund.discountRate}%</strong></span>
                      <span>التضخم: <strong className="text-amber-400">{fund.inflationRate}%</strong></span>
                    </div>
                  </div>

                  {fund.notes && (
                    <p className="text-[11px] text-slate-400 italic mt-2.5 bg-slate-950/40 p-2 rounded border border-slate-800/40">
                      {fund.notes}
                    </p>
                  )}

                  {/* Action buttons */}
                  <div className="flex items-center justify-between gap-2 mt-4">
                    <button
                      onClick={() => handleOpenEditModal(fund)}
                      className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold rounded-lg border border-slate-700 transition"
                    >
                      تعديل التقييم
                    </button>
                    <button
                      onClick={() => {
                        setSelectedFundId(fund.id);
                        setSimParams((prev) => ({ ...prev, fundId: fund.id }));
                        runSimulationForFund(fund.id);
                        setActiveTab('simulation');
                      }}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600/90 hover:bg-indigo-600 text-white text-xs font-bold rounded-lg transition shadow-sm"
                    >
                      <TrendingUp className="w-3.5 h-3.5" />
                      تشغيل المحاكاة الإكتوارية
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 2: SIMULATION ENGINE & PROJECTION TRAJECTORY */}
      {activeTab === 'simulation' && (
        <div className="space-y-6">
          {/* Controls Bar */}
          <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl shadow-xl space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <Sliders className="w-4 h-4 text-indigo-400" />
                <h3 className="font-bold text-sm text-slate-100">
                  محددات ومعايير المحاكاة الإكتوارية (Actuarial Model Parameters)
                </h3>
              </div>

              {/* Fund Selector */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400">الصندوق المستهدف:</span>
                <select
                  value={selectedFundId}
                  onChange={(e) => {
                    setSelectedFundId(e.target.value);
                    setSimParams((prev) => ({ ...prev, fundId: e.target.value }));
                    runSimulationForFund(e.target.value);
                  }}
                  className="bg-slate-950 text-slate-200 border border-slate-800 text-xs rounded-xl px-3 py-1.5 focus:outline-none focus:border-indigo-500 font-bold"
                >
                  {funds.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name} ({f.code})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Slider / Inputs Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-xs">
              {/* Horizon Years */}
              <div className="p-3 bg-slate-950 rounded-xl border border-slate-800">
                <label className="text-[10px] text-slate-400 block mb-1">المدى الزمني (سنوات)</label>
                <select
                  value={simParams.horizonYears}
                  onChange={(e) => setSimParams({ ...simParams, horizonYears: Number(e.target.value) })}
                  className="w-full bg-slate-900 text-slate-200 font-bold border border-slate-700 rounded-lg p-1.5"
                >
                  <option value={5}>5 سنوات</option>
                  <option value={10}>10 سنوات</option>
                  <option value={15}>15 سنة</option>
                  <option value={20}>20 سنة</option>
                </select>
              </div>

              {/* Expected Return */}
              <div className="p-3 bg-slate-950 rounded-xl border border-slate-800">
                <label className="text-[10px] text-slate-400 block mb-1">العائد الاستثماري المتوقع (%)</label>
                <input
                  type="number"
                  step="0.1"
                  value={simParams.expectedAnnualReturn}
                  onChange={(e) => setSimParams({ ...simParams, expectedAnnualReturn: Number(e.target.value) })}
                  className="w-full bg-slate-900 text-emerald-400 font-bold border border-slate-700 rounded-lg p-1.5 font-mono"
                />
              </div>

              {/* Expected Inflation */}
              <div className="p-3 bg-slate-950 rounded-xl border border-slate-800">
                <label className="text-[10px] text-slate-400 block mb-1">معدل التضخم المفترض (%)</label>
                <input
                  type="number"
                  step="0.1"
                  value={simParams.expectedInflation}
                  onChange={(e) => setSimParams({ ...simParams, expectedInflation: Number(e.target.value) })}
                  className="w-full bg-slate-900 text-amber-400 font-bold border border-slate-700 rounded-lg p-1.5 font-mono"
                />
              </div>

              {/* Pension Increase Rate */}
              <div className="p-3 bg-slate-950 rounded-xl border border-slate-800">
                <label className="text-[10px] text-slate-400 block mb-1">علاوة المعاشات السنوية (%)</label>
                <input
                  type="number"
                  step="0.1"
                  value={simParams.pensionIncreaseRate}
                  onChange={(e) => setSimParams({ ...simParams, pensionIncreaseRate: Number(e.target.value) })}
                  className="w-full bg-slate-900 text-indigo-400 font-bold border border-slate-700 rounded-lg p-1.5 font-mono"
                />
              </div>

              {/* Member Growth Rate */}
              <div className="p-3 bg-slate-950 rounded-xl border border-slate-800">
                <label className="text-[10px] text-slate-400 block mb-1">نمو المشتركين الجدد (%)</label>
                <input
                  type="number"
                  step="0.1"
                  value={simParams.memberGrowthRate}
                  onChange={(e) => setSimParams({ ...simParams, memberGrowthRate: Number(e.target.value) })}
                  className="w-full bg-slate-900 text-sky-400 font-bold border border-slate-700 rounded-lg p-1.5 font-mono"
                />
              </div>

              {/* Action Button */}
              <div className="flex items-end">
                <button
                  onClick={handleRunSimulation}
                  disabled={simulating}
                  className="w-full h-10 flex items-center justify-center gap-1.5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold rounded-xl transition shadow-lg shadow-indigo-950 disabled:opacity-50"
                >
                  <TrendingUp className={`w-4 h-4 ${simulating ? 'animate-spin' : ''}`} />
                  {simulating ? 'جاري النمذجة...' : 'إعادة المحاكاة'}
                </button>
              </div>
            </div>
          </div>

          {/* Simulation Output Banner */}
          {simulationResult && (
            <div
              className={`p-4 rounded-2xl border ${
                simulationResult.summaryStatus === 'HEALTHY'
                  ? 'bg-emerald-950/40 border-emerald-800/60 text-emerald-300'
                  : simulationResult.summaryStatus === 'MODERATE_RISK'
                  ? 'bg-amber-950/40 border-amber-800/60 text-amber-300'
                  : 'bg-rose-950/40 border-rose-800/60 text-rose-300'
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 font-bold text-sm">
                    {simulationResult.summaryStatus === 'HEALTHY' ? (
                      <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                    ) : (
                      <AlertTriangle className="w-5 h-5 text-amber-400" />
                    )}
                    <span>الرأي الإكتواري ومؤشر الاستدامة المالية: [{simulationResult.fundName}]</span>
                  </div>
                  <p className="text-xs leading-relaxed text-slate-200">
                    {simulationResult.actuarialOpinion}
                  </p>
                </div>

                <div className="text-left shrink-0 font-mono">
                  <span className="text-[10px] text-slate-400 block">سنوات الاستدامة الآمنة</span>
                  <span className="text-2xl font-black">{simulationResult.sustainableYears} / {simulationResult.horizonYears} سنة</span>
                </div>
              </div>

              {simulationResult.recommendedContributionIncrease > 0 && (
                <div className="mt-3 pt-3 border-t border-slate-800/80 flex flex-wrap items-center gap-4 text-xs font-semibold">
                  <span>
                    الزيادة المقترحة في الاشتراكات:{' '}
                    <strong className="text-amber-400 font-mono">+{simulationResult.recommendedContributionIncrease}%</strong>
                  </span>
                  {simulationResult.recommendedReserveInjection > 0 && (
                    <span>
                      دعم الاحتياطي الرأسمالي المطلوب:{' '}
                      <strong className="text-rose-400 font-mono">
                        {simulationResult.recommendedReserveInjection.toLocaleString()} ج.م
                      </strong>
                    </span>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Visual SVG Trajectory Chart */}
          {simulationResult && simulationResult.projections.length > 0 && (
            <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl shadow-xl space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-bold text-sm text-slate-100">
                    مسار الاحتياطي المالي والتدفقات النقدية المتوقعة ({simulationResult.horizonYears} سنوات)
                  </h4>
                  <p className="text-xs text-slate-400">
                    مقارنة الاشتراكات الواردة مع المعاشات والمزايا المنصرفة وصافي رصيد الاحتياطي التراكمي.
                  </p>
                </div>

                <div className="flex items-center gap-4 text-[11px]">
                  <span className="flex items-center gap-1.5 text-emerald-400">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-400"></span> الاحتياطي التراكمي
                  </span>
                  <span className="flex items-center gap-1.5 text-sky-400">
                    <span className="w-2.5 h-2.5 rounded-full bg-sky-400"></span> الاشتراكات الواردة
                  </span>
                  <span className="flex items-center gap-1.5 text-rose-400">
                    <span className="w-2.5 h-2.5 rounded-full bg-rose-400"></span> المعاشات والمزايا الصادرة
                  </span>
                </div>
              </div>

              {/* Custom High-Contrast SVG Trajectory */}
              <div className="w-full bg-slate-950 p-4 rounded-xl border border-slate-800/80 overflow-x-auto">
                <div className="min-w-[650px] h-64 flex flex-col justify-end relative pt-6 pb-6">
                  {/* Grid Lines */}
                  <div className="absolute inset-0 flex flex-col justify-between pointer-events-none opacity-20">
                    <div className="border-b border-slate-700 w-full"></div>
                    <div className="border-b border-slate-700 w-full"></div>
                    <div className="border-b border-slate-700 w-full"></div>
                    <div className="border-b border-slate-700 w-full"></div>
                  </div>

                  {/* Bars per Year */}
                  <div className="flex items-end justify-between gap-3 h-full z-10">
                    {simulationResult.projections.map((p, idx) => {
                      const maxVal = Math.max(
                        ...simulationResult.projections.map((x) => Math.max(x.projectedReserve, x.projectedBenefitsPaid, 1))
                      );
                      const reserveHeight = Math.max(8, (Math.max(0, p.projectedReserve) / maxVal) * 180);
                      const inflowHeight = Math.max(8, (p.projectedContributions / maxVal) * 180);
                      const outflowHeight = Math.max(8, (p.projectedBenefitsPaid / maxVal) * 180);

                      return (
                        <div key={idx} className="flex-1 flex flex-col items-center gap-1.5 group">
                          {/* Hover Tooltip Value */}
                          <div className="text-[10px] font-mono text-slate-400 opacity-0 group-hover:opacity-100 transition whitespace-nowrap bg-slate-900 px-1.5 py-0.5 rounded border border-slate-800">
                            {(p.projectedReserve / 1000000).toFixed(1)}M
                          </div>

                          <div className="flex items-end gap-1 w-full justify-center">
                            {/* Inflow Bar */}
                            <div
                              className="w-2.5 bg-sky-500 rounded-t transition-all hover:bg-sky-400"
                              style={{ height: `${inflowHeight}px` }}
                              title={`وارد: ${p.projectedContributions.toLocaleString()} ج.م`}
                            ></div>
                            {/* Outflow Bar */}
                            <div
                              className="w-2.5 bg-rose-500 rounded-t transition-all hover:bg-rose-400"
                              style={{ height: `${outflowHeight}px` }}
                              title={`صادر: ${p.projectedBenefitsPaid.toLocaleString()} ج.م`}
                            ></div>
                            {/* Reserve Bar */}
                            <div
                              className={`w-3.5 rounded-t transition-all ${
                                p.isSolvent ? 'bg-emerald-500 hover:bg-emerald-400' : 'bg-rose-600'
                              }`}
                              style={{ height: `${reserveHeight}px` }}
                              title={`الاحتياطي: ${p.projectedReserve.toLocaleString()} ج.م`}
                            ></div>
                          </div>

                          {/* Year Label */}
                          <span className="text-[10px] font-mono text-slate-400 mt-1 font-bold">
                            {p.yearLabel}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Detailed Projections Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-right text-xs">
                  <thead>
                    <tr className="bg-slate-950 text-slate-400 border-b border-slate-800">
                      <th className="p-2.5 font-bold">السنة المالية</th>
                      <th className="p-2.5 font-bold">الاشتراكات الواردة (ج.م)</th>
                      <th className="p-2.5 font-bold">المعاشات المنصرفة (ج.م)</th>
                      <th className="p-2.5 font-bold">صافي التدفق (ج.م)</th>
                      <th className="p-2.5 font-bold">الاحتياطي التراكمي المتوقع</th>
                      <th className="p-2.5 font-bold">الملاءة الإكتوارية</th>
                      <th className="p-2.5 font-bold">الحالة</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-mono">
                    {simulationResult.projections.map((row) => (
                      <tr key={row.year} className="hover:bg-slate-950/60">
                        <td className="p-2.5 font-bold text-slate-200">{row.year}</td>
                        <td className="p-2.5 text-sky-400">{row.projectedContributions.toLocaleString()}</td>
                        <td className="p-2.5 text-rose-400">{row.projectedBenefitsPaid.toLocaleString()}</td>
                        <td className={`p-2.5 ${row.netCashFlow >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {row.netCashFlow >= 0 ? '+' : ''}{row.netCashFlow.toLocaleString()}
                        </td>
                        <td className="p-2.5 font-black text-slate-100">{row.projectedReserve.toLocaleString()}</td>
                        <td className="p-2.5 text-indigo-400">{row.solvencyRatio}%</td>
                        <td className="p-2.5">
                          <span
                            className={`text-[10px] px-2 py-0.5 rounded font-sans font-bold ${
                              row.isSolvent ? 'bg-emerald-950 text-emerald-400' : 'bg-rose-950 text-rose-400'
                            }`}
                          >
                            {row.isSolvent ? 'مستدام' : 'عجز إكتواري'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: STRESS TESTING SCENARIOS */}
      {activeTab === 'stress_testing' && (
        <div className="space-y-6">
          <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl shadow-xl space-y-4">
            <div>
              <h3 className="font-bold text-base text-slate-100 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-400" />
                سيناريوهات واختبارات التحمل الإكتواري (Stress-Testing Matrix)
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                قياس قدرة صناديق المعاشات والرعاية الصحية على امتصاص الصدمات الاقتصادية والديموغرافية المفاجئة.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
              {/* Scenario 1: High Inflation Shock */}
              <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-xs text-amber-400">سيناريو 1: صدمة تضخمية حادة</span>
                  <span className="text-[10px] font-mono bg-amber-950 text-amber-400 px-2 py-0.5 rounded">High Inflation</span>
                </div>
                <p className="text-xs text-slate-400">
                  ارتفاع التضخم إلى 22% مع زيادة تكاليف العلاج والمعاشات بنسبة 18% سنوياً.
                </p>
                <div className="text-[11px] font-mono text-slate-300 space-y-1 bg-slate-900 p-2.5 rounded">
                  <div>تآكل الاحتياطي: <strong className="text-rose-400">خلال 4.5 سنوات</strong></div>
                  <div>الملاءة المالية المتوقعة: <strong className="text-amber-400">62.4%</strong></div>
                </div>
                <button
                  onClick={() => {
                    setSimParams({
                      ...simParams,
                      expectedInflation: 22.0,
                      pensionIncreaseRate: 18.0,
                      expectedAnnualReturn: 8.0,
                    });
                    setActiveTab('simulation');
                    runSimulationForFund(selectedFundId, {
                      expectedInflation: 22.0,
                      pensionIncreaseRate: 18.0,
                      expectedAnnualReturn: 8.0,
                    });
                  }}
                  className="w-full py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs rounded-lg transition"
                >
                  تطبيق المحاكاة لهذا السيناريو
                </button>
              </div>

              {/* Scenario 2: Demographic Retirement Wave */}
              <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-xs text-rose-400">سيناريو 2: موجة تقاعد مبكر</span>
                  <span className="text-[10px] font-mono bg-rose-950 text-rose-400 px-2 py-0.5 rounded">Early Retirement</span>
                </div>
                <p className="text-xs text-slate-400">
                  ارتفاع معدل التقاعد السنوي إلى 8.5% مع تباطؤ انضمام المشتركين الجدد إلى 0.5%.
                </p>
                <div className="text-[11px] font-mono text-slate-300 space-y-1 bg-slate-900 p-2.5 rounded">
                  <div>تآكل الاحتياطي: <strong className="text-rose-400">خلال 6.0 سنوات</strong></div>
                  <div>الملاءة المالية المتوقعة: <strong className="text-rose-400">71.0%</strong></div>
                </div>
                <button
                  onClick={() => {
                    setSimParams({
                      ...simParams,
                      retirementRate: 8.5,
                      memberGrowthRate: 0.5,
                    });
                    setActiveTab('simulation');
                    runSimulationForFund(selectedFundId, {
                      retirementRate: 8.5,
                      memberGrowthRate: 0.5,
                    });
                  }}
                  className="w-full py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs rounded-lg transition"
                >
                  تطبيق المحاكاة لهذا السيناريو
                </button>
              </div>

              {/* Scenario 3: High Yield & Growth */}
              <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-xs text-emerald-400">سيناريو 3: تنمية المحافظ الاستثمارية</span>
                  <span className="text-[10px] font-mono bg-emerald-950 text-emerald-400 px-2 py-0.5 rounded">Optimistic Yield</span>
                </div>
                <p className="text-xs text-slate-400">
                  تحقيق عائد استثماري 15.5% على ودائع الصندوق وأذون الخزانة مع استقرار التضخم عند 8%.
                </p>
                <div className="text-[11px] font-mono text-slate-300 space-y-1 bg-slate-900 p-2.5 rounded">
                  <div>استدامة الصندوق: <strong className="text-emerald-400">+20 سنة (فائض آمن)</strong></div>
                  <div>الملاءة المالية المتوقعة: <strong className="text-emerald-400">145.8%</strong></div>
                </div>
                <button
                  onClick={() => {
                    setSimParams({
                      ...simParams,
                      expectedAnnualReturn: 15.5,
                      expectedInflation: 8.0,
                      pensionIncreaseRate: 7.0,
                    });
                    setActiveTab('simulation');
                    runSimulationForFund(selectedFundId, {
                      expectedAnnualReturn: 15.5,
                      expectedInflation: 8.0,
                      pensionIncreaseRate: 7.0,
                    });
                  }}
                  className="w-full py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs rounded-lg transition"
                >
                  تطبيق المحاكاة لهذا السيناريو
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* CREATE / EDIT FUND MODAL */}
      {isModalOpen && editingFund && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-xl rounded-2xl shadow-2xl p-6 space-y-5 animate-scaleUp">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <Calculator className="w-5 h-5 text-indigo-400" />
                <h3 className="font-bold text-base text-slate-100">
                  {editingFund.id ? 'تعديل التقييم الإكتواري للصندوق' : 'تأسيس صندوق نقابي / إكتواري جديد'}
                </h3>
              </div>
              <button
                onClick={() => {
                  setIsModalOpen(false);
                  setEditingFund(null);
                }}
                className="p-1 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveFund} className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-400 block mb-1">اسم الصندوق *</label>
                  <input
                    type="text"
                    required
                    value={editingFund.name || ''}
                    onChange={(e) => setEditingFund({ ...editingFund, name: e.target.value })}
                    placeholder="مثال: صندوق المعاشات التكميلي"
                    className="w-full bg-slate-950 text-slate-100 border border-slate-700 rounded-xl p-2.5 focus:border-indigo-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="text-slate-400 block mb-1">نوع الصندوق</label>
                  <select
                    value={editingFund.type || 'PENSION'}
                    onChange={(e) => setEditingFund({ ...editingFund, type: e.target.value as any })}
                    className="w-full bg-slate-950 text-slate-100 border border-slate-700 rounded-xl p-2.5 focus:border-indigo-500 focus:outline-none"
                  >
                    <option value="PENSION">صندوق معاشات وإعانات</option>
                    <option value="SOLIDARITY">صندوق تكافل وتأمين تبادلي</option>
                    <option value="HEALTHCARE">صندوق رعاية صحية وطبية</option>
                    <option value="EMERGENCY">صندوق طوارئ وإغاثة</option>
                    <option value="SOCIAL_ACTIVITY">صندوق أنشطة وخدمات اجتماعية</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-400 block mb-1">الاحتياطي المالي الحالي (ج.م) *</label>
                  <input
                    type="number"
                    required
                    value={editingFund.currentReserve || 0}
                    onChange={(e) => setEditingFund({ ...editingFund, currentReserve: Number(e.target.value) })}
                    className="w-full bg-slate-950 text-emerald-400 font-mono border border-slate-700 rounded-xl p-2.5 focus:border-indigo-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="text-slate-400 block mb-1">الاحتياطي الإكتواري المستهدف (ج.م) *</label>
                  <input
                    type="number"
                    required
                    value={editingFund.targetReserve || 0}
                    onChange={(e) => setEditingFund({ ...editingFund, targetReserve: Number(e.target.value) })}
                    className="w-full bg-slate-950 text-slate-200 font-mono border border-slate-700 rounded-xl p-2.5 focus:border-indigo-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-400 block mb-1">التدفق الشهري الوارد (اشتراكات وعوائد)</label>
                  <input
                    type="number"
                    value={editingFund.monthlyInflow || 0}
                    onChange={(e) => setEditingFund({ ...editingFund, monthlyInflow: Number(e.target.value) })}
                    className="w-full bg-slate-950 text-sky-400 font-mono border border-slate-700 rounded-xl p-2.5 focus:border-indigo-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="text-slate-400 block mb-1">التدفق الشهري الصادر (معاشات ومزايا)</label>
                  <input
                    type="number"
                    value={editingFund.monthlyOutflow || 0}
                    onChange={(e) => setEditingFund({ ...editingFund, monthlyOutflow: Number(e.target.value) })}
                    className="w-full bg-slate-950 text-rose-400 font-mono border border-slate-700 rounded-xl p-2.5 focus:border-indigo-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 font-mono">
                <div>
                  <label className="text-slate-400 block mb-1">المشتركون</label>
                  <input
                    type="number"
                    value={editingFund.activeMembersCount || 0}
                    onChange={(e) => setEditingFund({ ...editingFund, activeMembersCount: Number(e.target.value) })}
                    className="w-full bg-slate-950 text-slate-200 border border-slate-700 rounded-xl p-2 focus:border-indigo-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-slate-400 block mb-1">المستفيدون</label>
                  <input
                    type="number"
                    value={editingFund.beneficiariesCount || 0}
                    onChange={(e) => setEditingFund({ ...editingFund, beneficiariesCount: Number(e.target.value) })}
                    className="w-full bg-slate-950 text-slate-200 border border-slate-700 rounded-xl p-2 focus:border-indigo-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-slate-400 block mb-1">معدل الخصم %</label>
                  <input
                    type="number"
                    step="0.1"
                    value={editingFund.discountRate || 8.5}
                    onChange={(e) => setEditingFund({ ...editingFund, discountRate: Number(e.target.value) })}
                    className="w-full bg-slate-950 text-indigo-400 border border-slate-700 rounded-xl p-2 focus:border-indigo-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-slate-400 block mb-1">معدل التضخم %</label>
                  <input
                    type="number"
                    step="0.1"
                    value={editingFund.inflationRate || 12.0}
                    onChange={(e) => setEditingFund({ ...editingFund, inflationRate: Number(e.target.value) })}
                    className="w-full bg-slate-950 text-amber-400 border border-slate-700 rounded-xl p-2 focus:border-indigo-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="text-slate-400 block mb-1">ملاحظات وقرارات الخبير الإكتواري</label>
                <textarea
                  rows={2}
                  value={editingFund.notes || ''}
                  onChange={(e) => setEditingFund({ ...editingFund, notes: e.target.value })}
                  placeholder="ملاحظات وتوصيات الدراسة الإكتوارية..."
                  className="w-full bg-slate-950 text-slate-200 border border-slate-700 rounded-xl p-2.5 focus:border-indigo-500 focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    setIsModalOpen(false);
                    setEditingFund(null);
                  }}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-xl transition"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl transition shadow-lg shadow-indigo-950 disabled:opacity-50"
                >
                  {submitting ? 'جاري الحفظ في PostgreSQL...' : 'حفظ التقييم'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
