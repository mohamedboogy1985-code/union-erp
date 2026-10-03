import { useState, useEffect, lazy, Suspense } from 'react';
import { Layout } from './components/Layout.js';
import { ToastContainer, ToastMessage } from './components/Toast.js';
import { PortalWelcome } from './components/PortalWelcome.js';
import { api } from './services/api.js';
import { User } from './types/erp.js';

// Pages
import { Dashboard } from './pages/Dashboard.js';
import { AccountingHub, AccountingTabId } from './pages/AccountingHub.js';
import { HrsHub, HrsTabId } from './pages/HrsHub.js';
import { MembershipHub, MembershipTabId } from './pages/MembershipHub.js';
import type { TaxesTabId } from './pages/TaxesHub.js';
import type { ModelsTabId } from './pages/ModelsViewer.js';
import { AiHub, AiTabId } from './pages/AiHub.js';
import { Gateways } from './pages/Gateways.js';
import { ErrorBoundary } from './components/ErrorBoundary.js';
import { Settings } from './pages/Settings.js';
import { OPERATOR_NAVIGATION } from './config/operator-assistant-navigation.js';
import type { AssistantScreen } from './types/operator-assistant.js';
import { hasPerm } from './utils/permissions.js';
import { GATEWAYS, getGatewayMeta, PortalId } from './config/portals.js';
import type { RegulationBudgetsTabId } from './pages/RegulationBudgetsHub.js';
import type { StatutoryTabId } from './pages/StatutoryHub.js';
import type { AuditSettingsTabId } from './pages/AuditSettingsHub.js';
import type { InsuredActuarialTabId } from './pages/InsuredActuarialHub.js';

const RegulationBudgetsHub = lazy(() => import('./pages/RegulationBudgetsHub.js').then((m) => ({ default: m.RegulationBudgetsHub })));
const StatutoryHub = lazy(() => import('./pages/StatutoryHub.js').then((m) => ({ default: m.StatutoryHub })));
const TaxesHub = lazy(() => import('./pages/TaxesHub.js').then((m) => ({ default: m.TaxesHub })));
const AuditSettingsHub = lazy(() => import('./pages/AuditSettingsHub.js').then((m) => ({ default: m.AuditSettingsHub })));
const InsuredActuarialHub = lazy(() => import('./pages/InsuredActuarialHub.js').then((m) => ({ default: m.InsuredActuarialHub })));

// الصفحات المعزولة الأقل استخداماً — تُحمَّل كسولاً (lazy) لتقسيم الحزمة الرئيسية
// وتقليل الإقلاع. تُقسّم كل صفحة إلى حزمتها الخاصة عبر Vite/Rollup.
// ملاحظة: Budgets/AuditLog/FinancialRegulation/InsuredListViewer/Journal2024Viewer
// باتت تُستورَد داخل المحاور الموحّدة (ModuleTabs) فلم تعد هنا.
const PromoShowcase = lazy(() => import('./pages/PromoShowcase.js').then((m) => ({ default: m.PromoShowcase })));
const FixedAssets = lazy(() => import('./pages/FixedAssets.js').then((m) => ({ default: m.FixedAssets })));
const JulesDashboard = lazy(() => import('./pages/JulesDashboard.js').then((m) => ({ default: m.JulesDashboard })));
const UnionCommittees = lazy(() => import('./pages/UnionCommittees.js').then((m) => ({ default: m.UnionCommittees })));
const ModelsViewer = lazy(() => import('./pages/ModelsViewer.js').then((m) => ({ default: m.ModelsViewer })));
const TrainingAccounting2024 = lazy(() => import('./pages/TrainingAccounting2024.js').then((m) => ({ default: m.TrainingAccounting2024 })));
const FinalAccounts2024 = lazy(() => import('./pages/FinalAccounts2024.js').then((m) => ({ default: m.FinalAccounts2024 })));
const BalanceSheet = lazy(() => import('./pages/BalanceSheet.js').then((m) => ({ default: m.BalanceSheet })));
const SkillsHub = lazy(() => import('./pages/SkillsHub.js').then((m) => ({ default: m.SkillsHub })));

// الوحدات القديمة المُدمجة في الوحدات الموحدة — تبقى معرفاتها شغّالة كتحويلات
// داخلية ليتواصل كل تنقل قديم (لوحة التحكم/المساعد الذكي) مع الوحدة الصحيحة.
const ACCOUNTING_HUB_ALIASES: Record<string, AccountingTabId> = {
  accounting: 'journals',
  journals: 'journals',
  reports: 'reports',
  subledgers: 'subledgers',
  accounts: 'accounts',
  banking: 'banking',
  procurement: 'procurement',
  'journal-2024': 'journal2024',
};

const HRS_HUB_ALIASES: Record<string, HrsTabId> = {
  hrs: 'employees',
  employees: 'employees',
  payroll: 'payroll',
  attendance: 'attendance',
  biometric: 'biometric',
  'biometric-attendance': 'biometric',
  advances: 'advances',
};

const TAXES_HUB_ALIASES: Record<string, TaxesTabId> = {
  taxes: 'payroll',
  'payroll-tax': 'payroll',
  'business-tax': 'business',
  'income-tax': 'income-law',
  'income-tax-law': 'income-law',
  einvoicing: 'einvoicing',
  'e-invoicing': 'einvoicing',
};

const MODELS_HUB_ALIASES: Record<string, ModelsTabId> = {
  models: 'library',
  'committee-data': 'committees',
};

const MEMBERSHIP_HUB_ALIASES: Record<string, MembershipTabId> = {
  membership: 'members',
  members: 'members',
  receipts: 'receipts',
  committees: 'committees',
};

const REGULATION_BUDGETS_HUB_ALIASES: Record<string, RegulationBudgetsTabId> = {
  'regulation-budgets': 'regulation',
  regulation: 'regulation',
  statute: 'statute',
  'regulations-library': 'regulations-library',
  'regulation-assistant': 'regulation-assistant',
  budgets: 'budgets',
};

const STATUTORY_HUB_ALIASES: Record<string, StatutoryTabId> = {
  statutory: 'statute',
  'financial-core': 'financial',
  'accounting-core': 'accounting',
  'statutory-check': 'check',
};

const AUDIT_SETTINGS_HUB_ALIASES: Record<string, AuditSettingsTabId> = {
  'audit-settings': 'audit',
  audit: 'audit',
  settings: 'settings',
};

const INSURED_ACTUARIAL_HUB_ALIASES: Record<string, InsuredActuarialTabId> = {
  'insured-actuarial': 'insured',
  'insured-list': 'insured',
  actuarial: 'actuarial',
};

const AI_HUB_ALIASES: Record<string, AiTabId> = {
  aihub: 'swarm',
  ai: 'ai',
  liveagent: 'liveagent',
  aetherswarm: 'swarm',
};

function loadStoredPortal(): PortalId {
  const saved = localStorage.getItem('union_active_portal');
  const requestedTab = new URLSearchParams(window.location.search).get('tab');
  const hrTabs = ['hrs', 'employees', 'payroll', 'attendance', 'biometric', 'biometric-attendance', 'advances'];
  const taxTabs = ['taxes', 'payroll-tax', 'business-tax', 'income-tax', 'income-tax-law', 'einvoicing', 'e-invoicing'];
  if (hrTabs.includes(requestedTab ?? '')) return 'training';
  if (taxTabs.includes(requestedTab ?? '') && saved === 'committees') return 'syndicate';
  // The original models deep link was syndicate-only; keep opening the forms library there.
  if (requestedTab === 'models') return 'syndicate';
  // Committee data belongs to the syndicate/committee portals, never the training portal.
  if (requestedTab === 'committee-data' && saved === 'training') return 'committees';
  return saved === 'training' || saved === 'committees' ? saved : 'syndicate';
}

const INITIAL_DEEP_LINK_TABS = new Set([
  'statutory', 'financial-core', 'accounting-core', 'statutory-check',
  'taxes', 'payroll-tax', 'business-tax', 'income-tax', 'income-tax-law', 'einvoicing', 'e-invoicing',
  'committee-data', 'models',
  'hrs', 'employees', 'payroll', 'attendance', 'biometric', 'biometric-attendance', 'advances',
]);

function initialTabFromSearch(search: string): string {
  const requested = new URLSearchParams(search).get('tab');
  return requested && INITIAL_DEEP_LINK_TABS.has(requested) ? requested : 'portals';
}

export function App() {
  const [selectedGateway, setSelectedGateway] = useState<PortalId>(loadStoredPortal);
  const portalMeta = getGatewayMeta(selectedGateway);
  const [currentTab, setCurrentTab] = useState(() => initialTabFromSearch(window.location.search));
  const [selectedOrgId, setSelectedOrgId] = useState(portalMeta?.organizationId || 'org-general');
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  // ترحيب ذكي عند اختيار بوابة (يُغلق تلقائياً عند المتابعة)
  const [welcomePortal, setWelcomePortal] = useState<PortalId | null>(null);

  useEffect(() => {
    loadUser();
  }, []);

  // عند تغيير البوابة: نضبط كيان/بيانات البوابة وشاشة البداية الخاصة بها
  const handleSelectGateway = (gateway: PortalId) => {
    const meta = getGatewayMeta(gateway);
    setSelectedGateway(gateway);
    setSelectedOrgId(meta?.organizationId || 'org-general');
    setCurrentTab(meta?.homeTab || 'portals');
    localStorage.setItem('union_active_portal', gateway);
    if (meta) setWelcomePortal(gateway);
  };

  const loadUser = async () => {
    try {
      const user = await api.getMe();
      setCurrentUser(user);
    } catch (err) {
      console.error('Failed to load user:', err);
    }
  };

  const showToast = (type: 'success' | 'error' | 'warning' | 'info', message: string) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`;
    setToasts((prev) => [...prev, { id, type, message }]);

    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4500);
  };

  const handleDismissToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  // مسودة إيصال قادمة بأمر صوتي من المساعد الحي → تُفتح في شاشة التحصيل للتأكيد
  const [voiceReceiptDraft, setVoiceReceiptDraft] = useState<{
    payerName: string;
    amount: number;
    reason?: string;
    stamp: number;
  } | null>(null);

  const handleVoiceReceiptDraft = (draft: { payerName: string; amount: number; reason?: string }) => {
    setVoiceReceiptDraft({ ...draft, stamp: Date.now() });
    setCurrentTab('receipts');
  };

  const handleAssistantNavigate = (target: AssistantScreen) => {
    const portal = GATEWAYS.find(item => item.id === target.portalId);
    const legacyScreenAliases: Record<string, string> = {
      'committee-data': 'models',
      einvoicing: 'taxes',
      'e-invoicing': 'taxes',
    };
    const screenId = legacyScreenAliases[target.id] ?? target.id;
    const screen = OPERATOR_NAVIGATION.find(item => item.id === screenId);
    const allowed = currentUser?.isActive && !currentUser.isDemo &&
      (hasPerm(currentUser, 'system:admin') || currentUser.organizationId === target.organizationId || currentUser.allowedOrgIds.includes(target.organizationId));
    if (!allowed || !portal || !screen || !screen.portals.includes(portal.id) || (portal.organizationId !== target.organizationId && target.organizationId !== selectedOrgId) ||
      (['settings', 'jules'].includes(target.id) && !hasPerm(currentUser, 'system:admin'))) {
      showToast('error', 'هذه الشاشة أو الجهة ليست ضمن الصلاحيات المتاحة.'); return;
    }
    setSelectedGateway(portal.id); setSelectedOrgId(target.organizationId); setCurrentTab(target.id);
    localStorage.setItem('union_active_portal', portal.id);
  };

  // fallback أثناء تحميل الصفحة الكسولة (lazy)
  const lazyFallback = (label: string) => (
    <div className="flex items-center justify-center p-12 text-neutral-500">
      <span>جارٍ تحميل {label}...</span>
    </div>
  );

  return (
    <>
      <Layout
        currentTab={currentTab}
        onTabChange={setCurrentTab}
        selectedGateway={selectedGateway}
        selectedOrgId={selectedOrgId}
        onOrgChange={setSelectedOrgId}
        currentUser={currentUser}
        onUserChange={setCurrentUser}
        onAssistantNavigate={handleAssistantNavigate}
      >
        {currentTab === 'portals' && (
          <ErrorBoundary label="بوابات النظام" onNavigate={setCurrentTab}>
            <Gateways
              onSelectGateway={handleSelectGateway}
              onOpenAgent={() => setCurrentTab('aetherswarm')}
              onShowToast={showToast}
            />
          </ErrorBoundary>
        )}

        {currentTab === 'dashboard' && (
          <ErrorBoundary label="لوحة التحكم والمؤشرات" onNavigate={setCurrentTab}>
            <Dashboard
              organizationId={selectedOrgId}
              currentUser={currentUser}
              onNavigate={setCurrentTab}
              onShowToast={showToast}
            />
          </ErrorBoundary>
        )}

        {currentTab === 'journals' ||
        currentTab === 'reports' ||
        currentTab === 'subledgers' ||
        currentTab === 'accounts' ||
        currentTab === 'banking' ||
        currentTab === 'procurement' ||
        currentTab === 'journal-2024' ||
        currentTab === 'accounting' ? (
          <ErrorBoundary label="المحاسبة والمالية" onNavigate={setCurrentTab}>
            <AccountingHub
              key={currentTab}
              organizationId={selectedOrgId}
              currentUser={currentUser}
              onShowToast={showToast}
              initialTab={ACCOUNTING_HUB_ALIASES[currentTab]}
            />
          </ErrorBoundary>
        ) : null}

        {currentTab === 'receipts' ||
        currentTab === 'members' ||
currentTab === 'membership' ||
        (currentTab === 'committees' && selectedGateway === 'syndicate') ? (
          <ErrorBoundary label="العضوية والتحصيل واللجان" onNavigate={setCurrentTab}>
            <Suspense fallback={lazyFallback('العضوية والتحصيل')}>
              <MembershipHub
                key={currentTab}
                organizationId={selectedOrgId}
                currentUser={currentUser}
                onShowToast={showToast}
                voiceDraft={voiceReceiptDraft}
                initialTab={MEMBERSHIP_HUB_ALIASES[currentTab]}
              />
            </Suspense>
          </ErrorBoundary>
        ) : null}

        {currentTab === 'employees' ||
        currentTab === 'advances' ||
        currentTab === 'payroll' ||
        currentTab === 'attendance' ||
        currentTab === 'biometric' ||
        currentTab === 'biometric-attendance' ||
        currentTab === 'hrs' ? (
          <ErrorBoundary label="الموارد البشرية والعاملين" onNavigate={setCurrentTab}>
            <HrsHub
              key={currentTab}
              organizationId={selectedOrgId}
              currentUser={currentUser}
              onShowToast={showToast}
              initialTab={HRS_HUB_ALIASES[currentTab]}
            />
          </ErrorBoundary>
        ) : null}

        {currentTab === 'taxes' ||
        currentTab === 'payroll-tax' ||
        currentTab === 'business-tax' ||
        currentTab === 'income-tax' ||
        currentTab === 'income-tax-law' ||
        currentTab === 'einvoicing' ||
        currentTab === 'e-invoicing' ? (
          <ErrorBoundary label="الضرائب وكسب العمل" onNavigate={setCurrentTab}>
            <Suspense fallback={lazyFallback('وحدة الضرائب وكسب العمل')}>
              <TaxesHub
                key={currentTab}
                organizationId={selectedOrgId}
                currentUser={currentUser}
                onShowToast={showToast}
                initialTab={TAXES_HUB_ALIASES[currentTab] ?? 'payroll'}
              />
            </Suspense>
          </ErrorBoundary>
        ) : null}

        {currentTab === 'liveagent' || currentTab === 'ai' || currentTab === 'aihub' || currentTab === 'aetherswarm' ? (
          <ErrorBoundary label="الذكاء الاصطناعي والمساعد الحي" onNavigate={setCurrentTab}>
            <AiHub
              key={currentTab}
              organizationId={selectedOrgId}
              currentUser={currentUser}
              onShowToast={showToast}
              onNavigate={setCurrentTab}
              onVoiceReceiptDraft={handleVoiceReceiptDraft}
              onNavigateToJournals={() => setCurrentTab('journals')}
              initialTab={AI_HUB_ALIASES[currentTab]}
            />
          </ErrorBoundary>
        ) : null}

        {currentTab === 'promo' && (
          <ErrorBoundary label="الفيديو والعرض الترويجي" onNavigate={setCurrentTab}>
            <div className="p-6">
              <Suspense fallback={lazyFallback('العرض الترويجي')}>
                <PromoShowcase />
              </Suspense>
            </div>
          </ErrorBoundary>
        )}

        {currentTab === 'budgets' ||
        currentTab === 'regulation' ||
        currentTab === 'statute' ||
        currentTab === 'regulations-library' ||
        currentTab === 'regulation-assistant' ||
        currentTab === 'regulation-budgets' ? (
          <ErrorBoundary label="الرقابة المالية والموازنات" onNavigate={setCurrentTab}>
            <Suspense fallback={lazyFallback('الرقابة المالية والموازنات')}>
              <RegulationBudgetsHub
                key={currentTab}
                organizationId={selectedOrgId}
                currentUser={currentUser}
                onShowToast={showToast}
                initialTab={REGULATION_BUDGETS_HUB_ALIASES[currentTab]}
              />
            </Suspense>
          </ErrorBoundary>
        ) : null}

        {currentTab === 'statutory' ||
        currentTab === 'financial-core' ||
        currentTab === 'accounting-core' ||
        currentTab === 'statutory-check' ? (
          <ErrorBoundary label="النظام الأساسي والوحدات" onNavigate={setCurrentTab}>
            <Suspense fallback={lazyFallback('النظام الأساسي والوحدات')}>
              <StatutoryHub
                key={currentTab}
                organizationId={selectedOrgId}
                currentUser={currentUser}
                onShowToast={showToast}
                initialTab={STATUTORY_HUB_ALIASES[currentTab]}
              />
            </Suspense>
          </ErrorBoundary>
        ) : null}

        {currentTab === 'assets' && (
          <ErrorBoundary label="الأصول الثابتة والإهلاك" onNavigate={setCurrentTab}>
            <Suspense fallback={lazyFallback('الأصول الثابتة')}>
            <FixedAssets
              organizationId={selectedOrgId}
              currentUser={currentUser}
              onShowToast={showToast}
            />
            </Suspense>
          </ErrorBoundary>
        )}

        {currentTab === 'audit' ||
        currentTab === 'audit-settings' ||
        (currentTab === 'settings' && selectedGateway === 'syndicate') ? (
          <ErrorBoundary label="الرقابة والإعدادات" onNavigate={setCurrentTab}>
            <Suspense fallback={lazyFallback('الرقابة والإعدادات')}>
              <AuditSettingsHub
                key={currentTab}
                organizationId={selectedOrgId}
                currentUser={currentUser}
                onShowToast={showToast}
                initialTab={AUDIT_SETTINGS_HUB_ALIASES[currentTab]}
              />
            </Suspense>
          </ErrorBoundary>
        ) : null}

        {currentTab === 'balance-sheet' && (
          <ErrorBoundary label="الميزانية العمومية والحسابات الختامية" onNavigate={setCurrentTab}>
            <Suspense fallback={lazyFallback('الميزانية العمومية')}>
            <BalanceSheet
              organizationId={selectedOrgId}
              currentUser={currentUser}
              onShowToast={showToast}
            />
            </Suspense>
          </ErrorBoundary>
        )}

        {currentTab === 'committees' && selectedGateway !== 'syndicate' && (
          <ErrorBoundary label="اللجان النقابية" onNavigate={setCurrentTab}>
            <Suspense fallback={lazyFallback('اللجان النقابية')}>
              <UnionCommittees
                organizationId={selectedOrgId}
                currentUser={currentUser}
                onShowToast={showToast}
              />
            </Suspense>
          </ErrorBoundary>
        )}

        {currentTab === 'insured-list' ||
        currentTab === 'actuarial' ||
        currentTab === 'insured-actuarial' ? (
          <ErrorBoundary label="الصندوق الإكتواري" onNavigate={setCurrentTab}>
            <Suspense fallback={lazyFallback('الصندوق الإكتواري')}>
              <InsuredActuarialHub
                key={currentTab}
                organizationId={selectedOrgId}
                currentUser={currentUser}
                onShowToast={showToast}
                initialTab={INSURED_ACTUARIAL_HUB_ALIASES[currentTab]}
              />
            </Suspense>
          </ErrorBoundary>
        ) : null}

        {(currentTab === 'models' || currentTab === 'committee-data') && (
          <ErrorBoundary label="بيانات اللجان والمكاتب والنماذج" onNavigate={setCurrentTab}>
            <Suspense fallback={lazyFallback('بيانات اللجان والنماذج')}>
              <ModelsViewer
                key={currentTab}
                organizationId={selectedOrgId}
                currentUser={currentUser}
                onShowToast={showToast}
                initialTab={MODELS_HUB_ALIASES[currentTab]}
                showModelsLibrary={selectedGateway === 'syndicate'}
              />
            </Suspense>
          </ErrorBoundary>
        )}

        {currentTab === 'training-accounting-2024' && (
          <ErrorBoundary label="برنامج المحاسبة 2024 (مركز التدريب)" onNavigate={setCurrentTab}>
            <Suspense fallback={lazyFallback('برنامج المحاسبة 2024')}>
            <TrainingAccounting2024
              organizationId={selectedOrgId}
              currentUser={currentUser}
              onShowToast={showToast}
            />
            </Suspense>
          </ErrorBoundary>
        )}

        {currentTab === 'final-accounts-2024' && (
          <ErrorBoundary label="الميزانية العمومية والحسابات الختامية 2024" onNavigate={setCurrentTab}>
            <Suspense fallback={lazyFallback('الميزانية العمومية والحسابات الختامية 2024')}>
            <FinalAccounts2024
              organizationId={selectedOrgId}
              currentUser={currentUser}
              onShowToast={showToast}
            />
            </Suspense>
          </ErrorBoundary>
        )}

        {currentTab === 'jules' && (
          <ErrorBoundary label="وكيل البرمجة Jules" onNavigate={setCurrentTab}>
            <Suspense fallback={lazyFallback('لوحة Jules')}>
              <JulesDashboard
                key={currentUser?.id || 'signed-out'}
                currentUser={currentUser}
                onUserChange={setCurrentUser}
                onShowToast={showToast}
              />
            </Suspense>
          </ErrorBoundary>
        )}

        {currentTab === 'skills' && (
          <ErrorBoundary label="نظام المهارات الموحد" onNavigate={setCurrentTab}>
            <Suspense fallback={lazyFallback('نظام المهارات الموحد')}>
              <SkillsHub
                organizationId={selectedOrgId}
                currentUser={currentUser}
                onShowToast={showToast}
              />
            </Suspense>
          </ErrorBoundary>
        )}

        {currentTab === 'settings' && selectedGateway !== 'syndicate' && (
          <ErrorBoundary label="الإعدادات والصلاحيات" onNavigate={setCurrentTab}>
            <Settings
              organizationId={selectedOrgId}
              currentUser={currentUser}
              onShowToast={showToast}
            />
          </ErrorBoundary>
        )}
      </Layout>

      {/* Global Toasts */}
      <ToastContainer toasts={toasts} onDismiss={handleDismissToast} />

      {/* ترحيب ذكي عند اختيار بوابة — نطق عربي + نص، ويُغلق فور المتابعة */}
      {welcomePortal && (
        <PortalWelcome
          portalId={welcomePortal}
          onClose={() => setWelcomePortal(null)}
          onShowToast={showToast}
        />
      )}
    </>
  );
}

export default App;
