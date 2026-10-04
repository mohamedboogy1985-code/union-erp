import React, { useState, useEffect } from 'react';
import { hasPerm, isReadOnly } from '../utils/permissions.js';
import {
  Bot,
  ChevronDown,
  Sparkles,
  Building,
  Wifi,
  WifiOff,
  FileSpreadsheet,
  FileCheck2,
  Globe,
  Layers,
  UserCheck,
  UsersRound,
  Scale,
  CalendarDays,
  Clock3,
  MapPin,
  Radio,
  BadgePercent,
} from 'lucide-react';
import { Organization, User, SyncStatus } from '../types/erp.js';
import { api, setCurrentUserId } from '../services/api.js';
import { getGatewayMeta, PortalId, screensForPortal } from '../config/portals.js';
import { PortalLogo } from './PortalLogo.js';
import { NotificationCenter } from './NotificationCenter.js';
import { OfflineSyncModal } from './OfflineSyncModal.js';
import { ImportExportModal } from './ImportExportModal.js';
import { DocumentManagerModal } from './DocumentManagerModal.js';
import { offlineSync } from '../services/offlineSync.js';
import type { AssistantScreen } from '../types/operator-assistant.js';
import { ErrorBoundary } from './ErrorBoundary.js';
import { GlobalAiWidget } from './GlobalAiWidget.js';

const CAIRO_TIME_ZONE = 'Africa/Cairo';
const formatCairoDateTime = (
  date: Date,
  locale: string,
  options: Intl.DateTimeFormatOptions,
): string => new Intl.DateTimeFormat(locale, { ...options, timeZone: CAIRO_TIME_ZONE }).format(date);

const TRAINING_HR_TABS = new Set([
  'hrs', 'employees', 'payroll', 'attendance', 'biometric', 'biometric-attendance',
  'advances', 'taxes', 'payroll-tax', 'business-tax', 'income-tax', 'income-tax-law',
  'einvoicing', 'e-invoicing', 'actuarial', 'insured-list', 'insured-actuarial',
]);

interface LayoutProps {
  currentTab: string;
  onTabChange: (tab: string) => void;
  selectedGateway: PortalId;
  selectedOrgId: string;
  onOrgChange: (orgId: string) => void;
  currentUser: User | null;
  onUserChange: (user: User | null) => void;
  onAssistantNavigate: (target: AssistantScreen) => void;
  /** يفتح HR في سياق مركز التدريب مع تثبيت معرّف المؤسسة الخاص به. */
  onOpenTrainingHr: (initialTab?: 'employees' | 'taxes') => void;
  children: React.ReactNode;
}

export const Layout: React.FC<LayoutProps> = ({
  currentTab,
  onTabChange,
  selectedGateway,
  selectedOrgId,
  onOrgChange,
  currentUser,
  onUserChange,
  onAssistantNavigate,
  onOpenTrainingHr,
  children,
}) => {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [isOrgDropdownOpen, setIsOrgDropdownOpen] = useState(false);
  const [isUserDropdownOpen, setIsUserDropdownOpen] = useState(false);

  // Modals state
  const [isOfflineModalOpen, setIsOfflineModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isDocsModalOpen, setIsDocsModalOpen] = useState(false);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>(offlineSync.getStatus());
  const [pendingSyncCount, setPendingSyncCount] = useState(offlineSync.getPendingCount());
  const [tickerNow, setTickerNow] = useState(() => new Date());

  useEffect(() => {
    const timer = window.setInterval(() => setTickerNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const tickerItems = [
    {
      label: 'ميلادي',
      value: formatCairoDateTime(tickerNow, 'ar-EG-u-ca-gregory', {
        day: '2-digit', month: 'long', year: 'numeric',
      }),
      icon: CalendarDays,
    },
    {
      label: 'هجري',
      value: formatCairoDateTime(tickerNow, 'ar-EG-u-ca-islamic-umalqura', {
        day: '2-digit', month: 'long', year: 'numeric',
      }),
      icon: CalendarDays,
    },
    {
      label: 'الوقت',
      value: formatCairoDateTime(tickerNow, 'ar-EG', {
        hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
      }),
      icon: Clock3,
    },
    { label: 'الموقع', value: 'القاهرة، مصر · توقيت القاهرة', icon: MapPin },
  ];

  useEffect(() => {
    loadData();
    const unsub = offlineSync.subscribe((status, count) => {
      setSyncStatus(status);
      setPendingSyncCount(count);
    });
    return () => unsub();
  }, []);

  const loadData = async () => {
    try {
      const [orgsData, usersData] = await Promise.all([
        api.getOrganizations(),
        api.getUsers(),
      ]);
      setOrganizations(orgsData);
      setUsers(usersData);
    } catch (err) {
      console.error('Error loading layout data:', err);
    }
  };

  // كل بوابة لها شاشاتها الخاصة فقط — لا تظهر شاشات بوابة أخرى
  interface NavItem {
    id: string;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    isAi?: boolean;
    badge?: string;
    action?: 'open-training-hr' | 'open-training-taxes';
  }

  // محاور موحّدة بقوائم فرعية. HR نفسها تبقى في بوابة التدريب فقط؛ الرابط
  // الموجود تحت المحاسبة ينقل المستخدم إلى سياق التدريب ولا يمرر بيانات النقابة.
  const governanceTabs = [
    'regulation', 'regulations-library', 'regulation-assistant', 'budgets',
    'statute', 'statutory', 'financial-core', 'accounting-core', 'statutory-check',
    'statutory-distribution', 'distribution', 'audit', 'audit-settings', 'settings',
  ];
  const HUB_DEFS = selectedGateway === 'syndicate'
    ? [
        { id: 'accounting', label: 'المحاسبة والمالية', icon: Layers, tabs: ['journals', 'reports', 'balance-sheet', 'assets', 'subledgers', 'accounts', 'banking', 'procurement', 'journal-2024'] },
        { id: 'membership', label: 'العضوية والتحصيل واللجان', icon: UserCheck, tabs: ['members', 'receipts'] },
        { id: 'regulation-budgets', label: 'الرقابة المالية واللوائح المنظمة والموازنات', icon: Scale, tabs: governanceTabs },
      ]
    : [
        { id: 'accounting', label: 'المحاسبة والمالية', icon: Layers, tabs: ['journals', 'reports', 'balance-sheet', 'assets', 'subledgers', 'accounts', 'banking', 'procurement'] },
        { id: 'membership', label: 'العضوية والتحصيل', icon: UserCheck, tabs: ['members', 'receipts'] },
        { id: 'hrs', label: 'الموارد البشرية والعاملين', icon: UsersRound, tabs: ['employees', 'payroll', 'attendance', 'biometric', 'advances', 'insured-list', 'actuarial'] },
        { id: 'taxes', label: 'الضرائب وكسب العمل', icon: BadgePercent, tabs: ['taxes'] },
        { id: 'regulation-budgets', label: 'الرقابة المالية واللوائح المنظمة والموازنات', icon: Scale, tabs: ['statutory', 'financial-core', 'accounting-core', 'statutory-check', 'statutory-distribution', 'distribution'] },
      ];

  const activePortalMeta = getGatewayMeta(selectedGateway);
  const portalScreens = screensForPortal(selectedGateway);

  const navItems: NavItem[] = [
    { id: 'portals', label: 'البوابات الرئيسية', icon: Globe, badge: '3 بوابات' },
  ];

  const addedHubs = new Set<string>();

  for (const s of portalScreens) {
    // Signed-out users can reach the login screen; non-admins never see the dashboard link.
    if (s.id === 'jules' && currentUser && (!currentUser.isActive || currentUser.isDemo || !hasPerm(currentUser, 'system:admin'))) continue;
    const hub = HUB_DEFS.find((h) => h.tabs.includes(s.id));
    if (hub) {
      if (!addedHubs.has(hub.id)) {
        const visibleTabs = hub.tabs.filter((t) => portalScreens.some((s2) => s2.id === t));
        navItems.push({
          id: hub.id,
          label: hub.label,
          icon: hub.icon,
          badge: hub.id === 'taxes' ? '4 وحدات' : `${visibleTabs.length} وحدات`,
        });
        addedHubs.add(hub.id);
      }
      continue;
    }
    navItems.push({
      id: s.id,
      label: s.label,
      icon: s.icon,
      isAi: s.id === 'aihub' || s.id === 'ai' || s.id === 'jules' || s.id === 'aetherswarm',
    });
  }

  // تظهر وصلتا HR والضرائب تحت المحاسبة في بوابة النقابة، لكنهما تبدّلان السياق
  // صراحة إلى مركز التدريب ولا تعرضان بيانات التدريب داخل مؤسسة النقابة العامة.
  if (selectedGateway === 'syndicate') {
    const accountingIndex = navItems.findIndex((item) => item.id === 'accounting');
    const trainingShortcuts: NavItem[] = [
      {
        id: 'hr-training-shortcut',
        label: 'الموارد البشرية — بوابة التدريب',
        icon: UsersRound,
        badge: 'مركز التدريب',
        action: 'open-training-hr',
      },
      {
        id: 'tax-training-shortcut',
        label: 'الضرائب وكسب العمل — بوابة التدريب',
        icon: BadgePercent,
        badge: 'مركز التدريب',
        action: 'open-training-taxes',
      },
    ];
    navItems.splice(accountingIndex >= 0 ? accountingIndex + 1 : navItems.length, 0, ...trainingShortcuts);
  }

  // بوابة اللجان لا تحتوي HR/ضرائب داخل نطاقها؛ توفر وصلات واضحة تتحول إلى مركز التدريب.
  if (selectedGateway === 'committees') {
    navItems.push(
      {
        id: 'hr-training-shortcut',
        label: 'الموارد البشرية — بوابة التدريب',
        icon: UsersRound,
        badge: 'سياق منفصل',
        action: 'open-training-hr',
      },
      {
        id: 'tax-training-shortcut',
        label: 'الضرائب وكسب العمل — بوابة التدريب',
        icon: BadgePercent,
        badge: 'سياق منفصل',
        action: 'open-training-taxes',
      },
    );
  }

  // الوحدات القديمة كان لها معرفات مستقلة — نحولها إلى الشاشة المجمّعة الصحيحة
  // حتى لا ينكسر أي تنقل قديم، ويبقى التظليل في الشريط الجانبي دقيقاً.
  const TAB_TARGETS: Record<string, string> = {
    accounting: 'accounting',
    journals: 'accounting',
    reports: 'accounting',
    subledgers: 'accounting',
    accounts: 'accounting',
    banking: 'accounting',
    procurement: 'accounting',
    'journal-2024': 'accounting',
    'balance-sheet': 'accounting',
    balanceSheet: 'accounting',
    assets: 'accounting',
    'fixed-assets': 'accounting',
    'fixed-asset': 'accounting',
    depreciation: 'accounting',
    membership: 'membership',
    members: 'membership',
    receipts: 'membership',
    committees: selectedGateway === 'syndicate' ? 'membership' : 'committees',
    models: 'models',
    'committee-data': 'models',
    hrs: 'hrs',
    employees: 'hrs',
    payroll: 'hrs',
    attendance: 'hrs',
    biometric: 'hrs',
    'biometric-attendance': 'hrs',
    advances: 'hrs',
    taxes: 'taxes',
    'payroll-tax': 'taxes',
    'business-tax': 'taxes',
    'income-tax': 'taxes',
    'income-tax-law': 'taxes',
    einvoicing: 'taxes',
    'e-invoicing': 'taxes',
    'insured-actuarial': 'hrs',
    'insured-list': 'hrs',
    actuarial: 'hrs',
    'regulation-budgets': 'regulation-budgets',
    regulation: 'regulation-budgets',
    'regulations-library': 'regulation-budgets',
    'regulation-assistant': 'regulation-budgets',
    budgets: 'regulation-budgets',
    statute: 'regulation-budgets',
    statutory: 'regulation-budgets',
    'financial-core': 'regulation-budgets',
    'accounting-core': 'regulation-budgets',
    'statutory-check': 'regulation-budgets',
    'statutory-distribution': 'regulation-budgets',
    distribution: 'regulation-budgets',
    'audit-settings': 'regulation-budgets',
    audit: 'regulation-budgets',
    settings: selectedGateway === 'syndicate' ? 'regulation-budgets' : 'settings',
    ai: 'aetherswarm',
    aihub: 'aetherswarm',
    aiHub: 'aetherswarm',
    liveagent: 'aetherswarm',
    accountant: 'aetherswarm',
    customagent: 'aetherswarm',
    swarm: 'aetherswarm',
  };
  const effectiveTab = TAB_TARGETS[currentTab] || (currentTab === 'ai' ? 'aihub' : currentTab);

  const visibleOrganizations = organizations.filter((organization) =>
    organization.isActive && Boolean(currentUser && (
      currentUser.organizationId === organization.id ||
      currentUser.allowedOrgIds?.includes(organization.id) ||
      hasPerm(currentUser, 'system:admin')
    )),
  );
  const trainingOrganizationId = getGatewayMeta('training')?.organizationId;
  const isTrainingHrTab = TRAINING_HR_TABS.has(currentTab);
  const selectableOrganizations = isTrainingHrTab && trainingOrganizationId
    ? visibleOrganizations.filter((organization) => organization.id === trainingOrganizationId)
    : visibleOrganizations;
  const currentOrg = selectableOrganizations.find((organization) => organization.id === selectedOrgId) || selectableOrganizations[0];

  useEffect(() => {
    if (isTrainingHrTab && trainingOrganizationId && selectedOrgId !== trainingOrganizationId) {
      onOrgChange(trainingOrganizationId);
    }
  }, [isTrainingHrTab, onOrgChange, selectedOrgId, trainingOrganizationId]);

  return (
    <div className="flex h-screen bg-slate-950 text-slate-100 font-sans antialiased overflow-hidden dir-rtl" dir="rtl">
      {/* Sidebar Navigation */}
      <aside className="w-64 bg-[#111827] border-l border-[#334155] flex flex-col shrink-0">
        {/* Syndicate Brand Header */}
        <div className="h-12 px-4 border-b border-[#334155] flex items-center justify-between bg-[#1e293b]/60">
          <div className="flex items-center gap-2.5">
<PortalLogo gatewayId={selectedGateway} className="w-7 h-7" alt="شعار البوابة" />
            <div>
              <h1 className="font-bold text-xs text-sky-400 tracking-wide font-mono">UNION // ERP_ENGINE</h1>
            </div>
          </div>
          <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950/80 px-1.5 py-0.5 rounded border border-emerald-800/40 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
            <span>LIVE</span>
          </span>
        </div>

        {/* Current Portal Context */}
        <div className="px-3 py-2 border-b border-[#334155] bg-slate-900/50">
          {activePortalMeta ? (
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
<PortalLogo gatewayId={activePortalMeta.id} className="w-6 h-6" alt={activePortalMeta.title} />
                <div className="flex items-center gap-1.5">
                  <activePortalMeta.icon className={`w-4 h-4 ${activePortalMeta.accent.text}`} />
                  <span className="text-[10px] font-bold text-slate-300">{activePortalMeta.title}</span>
                </div>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[9px] font-mono text-slate-500">data: {activePortalMeta.organizationId}</span>
                <button
                  onClick={() => onTabChange('portals')}
                  className="text-[9px] px-2 py-0.5 rounded font-bold bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 transition"
                >
                  البوابات
                </button>
              </div>
            </div>
          ) : (
            <span className="text-[10px] text-slate-500">لا توجد بوابة مختارة</span>
          )}
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 px-2 py-2 space-y-0.5 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = item.action
              ? false
              : item.id === 'portals'
                ? currentTab === 'portals'
                : effectiveTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => {
                  if (item.action === 'open-training-hr' || item.action === 'open-training-taxes') {
                    onOpenTrainingHr(item.action === 'open-training-taxes' ? 'taxes' : 'employees');
                    return;
                  }
                  onTabChange(item.id);
                }}
                className={`w-full flex items-center justify-between px-3 py-1.5 rounded text-xs transition-colors ${
                  isActive
                    ? item.isAi
                      ? 'bg-[#1e293b] text-purple-200 border-r-2 border-purple-400 font-semibold shadow-xs'
                      : 'bg-[#1e293b] text-slate-50 border-r-2 border-sky-400 font-semibold shadow-xs'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-[#1e293b]/50 font-normal'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Icon className={`w-3.5 h-3.5 ${isActive ? (item.isAi ? 'text-purple-400' : 'text-sky-400') : 'text-slate-400'}`} />
                  <span className="text-[11.5px]">{item.label}</span>
                </div>
                {item.badge && (
                  <span className={`text-[9px] px-1 py-0.2 rounded font-mono border ${
                    item.isAi ? 'bg-purple-950 text-purple-300 border-purple-800/50' : 'bg-slate-800 text-sky-300 border-slate-700'
                  }`}>
                    {item.badge}
                  </span>
                )}
                {item.isAi && !isActive && (
                  <Sparkles className="w-3 h-3 text-purple-400" />
                )}
              </button>
            );
          })}
        </nav>

        {/* Offline & System Status Footer */}
        <div className="p-2 border-t border-[#334155] bg-[#1e293b]/40 font-mono text-[10px] space-y-1.5">
          <div className="flex items-center justify-between">
            <button
              onClick={() => setIsOfflineModalOpen(true)}
              className="flex items-center gap-1.5 text-slate-300 hover:text-white transition-colors"
            >
              <span className={`w-2 h-2 rounded-full ${syncStatus === 'ONLINE' ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
              <span>SYNC: {syncStatus}</span>
              {pendingSyncCount > 0 && (
                <span className="px-1 bg-amber-500/20 text-amber-300 rounded font-bold">{pendingSyncCount}</span>
              )}
            </button>
            <span className="text-slate-500">v2.0-AI</span>
          </div>
        </div>
      </aside>

      {/* Main Workspace Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-[#0f172a]">
        {/* Top Header Bar */}
        <header data-print-hidden className="h-12 bg-[#1e293b] border-b border-[#334155] flex items-center justify-between px-4 shrink-0">
          {/* Organization Switcher & Telemetry */}
          <div className="flex items-center gap-3">
            <PortalLogo gatewayId={selectedGateway} className="w-7 h-7 hidden sm:block" alt="شعار البوابة" />
            <div className="relative">
              <button
                onClick={() => setIsOrgDropdownOpen(!isOrgDropdownOpen)}
                className="flex items-center gap-2 px-2.5 py-1 bg-slate-900 border border-[#334155] hover:border-sky-500/50 rounded text-xs font-medium text-slate-200 shadow-xs transition-colors"
              >
                <Building className="w-3.5 h-3.5 text-sky-400" />
                <span>{currentOrg?.name || (isTrainingHrTab ? 'مركز التدريب' : activePortalMeta?.title || 'لا توجد مؤسسة متاحة')}</span>
                <ChevronDown className="w-3 h-3 text-slate-400" />
              </button>

              {isOrgDropdownOpen && (
                <div className="absolute top-full right-0 mt-1 w-64 bg-[#1e293b] border border-[#334155] rounded shadow-xl z-50 p-1 space-y-0.5">
                  <div className="text-[10px] font-bold text-slate-400 px-2 py-1 font-mono uppercase">Select Entity / Committee</div>
                  {selectableOrganizations.map((org) => (
                    <button
                      key={org.id}
                      onClick={() => {
                        onOrgChange(org.id);
                        setIsOrgDropdownOpen(false);
                      }}
                      className={`w-full text-right px-2.5 py-1.5 rounded text-xs flex items-center justify-between ${
                        selectedOrgId === org.id
                          ? 'bg-slate-900 text-sky-300 border border-sky-500/40 font-semibold'
                          : 'text-slate-300 hover:bg-slate-900/60'
                      }`}
                    >
                      <span>{org.name}</span>
                      <span className="text-[10px] font-mono text-slate-400">{org.code}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="hidden lg:flex items-center gap-2 font-mono text-[10.5px] text-slate-400 border-r border-[#334155] pr-3">
              <span className="text-slate-400">PERIOD: <strong className="text-sky-400">FEB-2026 (OPEN)</strong></span>
              <span className="text-slate-600">|</span>
              <span className="text-slate-400">ENGINE: <strong className="text-emerald-400">OFFLINE_READY</strong></span>
            </div>
          </div>

          {/* Quick Action Tools & Notification / User Switcher */}
          <div className="flex items-center gap-2">
            {/* Offline Sync Button */}
            <button
              onClick={() => setIsOfflineModalOpen(true)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-mono border transition-colors ${
                syncStatus === 'ONLINE'
                  ? 'bg-emerald-950/40 text-emerald-300 border-emerald-800/50 hover:bg-emerald-900/50'
                  : 'bg-amber-950/40 text-amber-300 border-amber-800/50 hover:bg-amber-900/50'
              }`}
              title="محرك المزامنة دون اتصال"
            >
              {syncStatus === 'ONLINE' ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
              <span className="text-[10.5px]">{syncStatus}</span>
              {pendingSyncCount > 0 && (
                <span className="px-1 bg-amber-500 text-slate-950 font-bold rounded text-[9px]">{pendingSyncCount}</span>
              )}
            </button>

            {/* Advanced Excel Import Engine */}
            <button
              onClick={() => setIsImportModalOpen(true)}
              className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-900 hover:bg-slate-800 border border-[#334155] rounded text-xs font-medium text-emerald-300 transition-colors"
              title="استيراد البيانات من Excel مع التدقيق"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-[11px] hidden md:inline">استيراد Excel</span>
            </button>

            {/* Document Archive DMS */}
            <button
              onClick={() => setIsDocsModalOpen(true)}
              className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-900 hover:bg-slate-800 border border-[#334155] rounded text-xs font-medium text-indigo-300 transition-colors"
              title="إدارة المرفقات والشهادات الرقمية والأختام"
            >
              <FileCheck2 className="w-3.5 h-3.5 text-indigo-400" />
              <span className="text-[11px] hidden md:inline">المرفقات والأختام</span>
            </button>

            {/* Real-time Notifications */}
            <NotificationCenter onNavigateTab={(tab) => onTabChange(tab)} />

            {/* AI Studio Shortcut */}
            <button
              onClick={() => onTabChange('ai')}
              className="flex items-center gap-1.5 px-2.5 py-1 bg-purple-950/50 hover:bg-purple-900/70 border border-purple-700/50 rounded text-xs font-medium text-purple-300 transition-colors"
            >
              <Bot className="w-3.5 h-3.5 text-purple-400" />
              <span className="text-[11px] hidden sm:inline">استوديو AI</span>
            </button>

            {/* User Dropdown */}
            <div className="relative">
              <button
                onClick={() => setIsUserDropdownOpen(!isUserDropdownOpen)}
                className="flex items-center gap-2 px-2.5 py-1 bg-slate-900 border border-[#334155] hover:border-sky-500/50 rounded text-xs font-medium text-slate-200 transition-colors"
              >
                {currentUser?.avatarUrl ? (
                  <img src={currentUser.avatarUrl} alt={currentUser.fullName} className="w-6 h-6 rounded object-cover border border-sky-400/40" />
                ) : (
                  <div className="w-5 h-5 rounded bg-sky-600/30 border border-sky-400/40 flex items-center justify-center font-mono font-bold text-[10px] text-sky-300">
                    {currentUser?.fullName?.[0] || 'م'}
                  </div>
                )}
                <div className="text-right hidden sm:block">
                  <span className="font-semibold text-[11px] text-slate-100">{currentUser?.fullName || 'محمد عبد الله أحمد'}</span>
                  <span className="block text-[9px] text-sky-400 mr-1.5">
                    {currentUser?.roleLabelAr || currentUser?.role || ''}
                    {isReadOnly(currentUser) && (
                      <span className="mr-1 px-1 py-px bg-amber-500/20 border border-amber-400/40 rounded text-amber-300">وضع الاطلاع والطباعة فقط</span>
                    )}
                  </span>
                </div>
                <ChevronDown className="w-3 h-3 text-slate-400" />
              </button>

              {isUserDropdownOpen && (
                <div className="absolute top-full left-0 mt-1 w-64 bg-[#1e293b] border border-[#334155] rounded shadow-xl z-50 p-1 space-y-0.5">
                  <div className="text-[10px] font-bold text-slate-400 px-2 py-1">تبديل المستخدم (الأسماء المعتمدة وصلاحياتها)</div>
                  {users.map((u) => (
                    <button
                      key={u.id}
                      onClick={() => {
                        setCurrentUserId(u.id);
                        onUserChange(u);
                        setIsUserDropdownOpen(false);
                      }}
                      className={`w-full text-right px-2.5 py-1.5 rounded text-xs flex flex-col ${
                        currentUser?.id === u.id
                          ? 'bg-slate-900 text-sky-300 border border-sky-500/40 font-semibold'
                          : 'text-slate-300 hover:bg-slate-900/60'
                      }`}
                    >
                      <span className="font-semibold text-[11px] flex items-center gap-1.5">
                        {u.avatarUrl ? (
                          <img src={u.avatarUrl} alt="" className="w-4 h-4 rounded object-cover" />
                        ) : null}
                        {u.fullName}
                      </span>
                      <span className="text-[9.5px] text-slate-400">{u.roleLabelAr || u.role}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </header>

        {/* شريط الوقت والموقع ثابت بين الشاشات ويتحرك كتذييل أخبار، مع احترام تفضيل تقليل الحركة. */}
        <section
          data-print-hidden
          className="erp-news-ticker flex h-10 shrink-0 items-center gap-3 border-b border-sky-900/50 bg-slate-950/90 px-3 text-[10px] sm:text-[11px]"
          aria-label="التاريخ والوقت والموقع الحالي"
        >
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-sky-500/30 bg-sky-500/10 px-2.5 py-1 font-bold text-sky-300">
            <Radio className="h-3.5 w-3.5" />
            مباشر
          </span>
          <div className="erp-news-ticker__viewport flex min-w-0 flex-1 overflow-hidden">
            <div className="erp-news-ticker__track" aria-hidden="true">
              {[0, 1].map((copy) => (
                <div className="erp-news-ticker__group" key={copy}>
                  {tickerItems.map((item) => {
                    const Icon = item.icon;
                    return (
                      <span className="inline-flex shrink-0 items-center gap-1.5 text-slate-300" key={item.label}>
                        <Icon className="h-3.5 w-3.5 text-sky-400" />
                        <span className="text-slate-500">{item.label}:</span>
                        <strong className="font-semibold text-slate-100">{item.value}</strong>
                      </span>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
          <span className="hidden shrink-0 rounded border border-slate-800 px-2 py-1 text-[9px] text-slate-500 sm:inline-flex">
            Africa/Cairo
          </span>
          <span className="sr-only">
            {tickerItems.map((item) => `${item.label}: ${item.value}`).join('؛ ')}
          </span>
        </section>

        {/* Dynamic View Canvas */}
        <main className="flex-1 overflow-y-auto p-4 bg-[#0f172a]">
          <div data-erp-workspace data-assistant-screen={currentTab}>{children}</div>
        </main>
      </div>

      {/* Global Offline Sync Modal */}
      <OfflineSyncModal
        isOpen={isOfflineModalOpen}
        onClose={() => setIsOfflineModalOpen(false)}
      />

      {/* Global Advanced Import / Export Modal */}
      <ImportExportModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        onSuccess={() => {
          // Trigger reload if needed
        }}
      />

      {/* Global Document Management System (DMS) Modal */}
      <DocumentManagerModal
        isOpen={isDocsModalOpen}
        onClose={() => setIsDocsModalOpen(false)}
        entityType="JOURNAL_ENTRY"
        entityId="global-archive"
        entityTitle="الأرشيف العام للمستندات والأختام الرقمية"
      />

      {/* المساعد الذكي العام العائم — متاح في جميع الشاشات */}
      <ErrorBoundary key={currentUser?.id || 'signed-out'} label="المساعد الصوتي المرئي">
      <GlobalAiWidget
        key={currentUser?.id || 'signed-out'}
        currentTab={currentTab}
        selectedOrgId={selectedOrgId}
        currentUser={currentUser}
        onNavigate={onAssistantNavigate}
        onUserChange={onUserChange}
      />
      </ErrorBoundary>
    </div>
  );
};

