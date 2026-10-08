import { useState, useEffect, lazy, Suspense } from 'react';
import { Layout } from './components/Layout.js';
import { ToastContainer, ToastMessage } from './components/Toast.js';
import { api } from './services/api.js';
import { User } from './types/erp.js';

// Pages
import { Dashboard } from './pages/Dashboard.js';
import { AccountingHub, AccountingTabId } from './pages/AccountingHub.js';
import { TaxesHub, TaxesTabId } from './pages/TaxesHub.js';
import type { ModelsTabId } from './pages/ModelsViewer.js';
import { RegulationAssistantDock } from './components/RegulationAssistantDock.js';
import { GeneralAssistantWidget } from './components/GeneralAssistantWidget.js';
import { HrsHub, HrsTabId } from './pages/HrsHub.js';
import { MembershipHub, MembershipTabId } from './pages/MembershipHub.js';
import { AiHub, AiTabId } from './pages/AiHub.js';
import type { StatutoryTabId } from './pages/StatutoryHub.js';
import { Gateways } from './pages/Gateways.js';
import { ErrorBoundary } from './components/ErrorBoundary.js';
import { Settings } from './pages/Settings.js';
import { OPERATOR_NAVIGATION } from './config/operator-assistant-navigation.js';
import type { AssistantScreen } from './types/operator-assistant.js';
import { hasPerm } from './utils/permissions.js';
import { GATEWAYS, getGatewayMeta, PortalId } from './config/portals.js';
import type { RegulationBudgetsTabId } from './pages/RegulationBudgetsHub.js';
import type { AuditSettingsTabId } from './pages/AuditSettingsHub.js';
import type { InsuredActuarialTabId } from './pages/InsuredActuarialHub.js';

const RegulationBudgetsHub = lazy(() =>
  import('./pages/RegulationBudgetsHub.js').then((m) => ({
    default: m.RegulationBudgetsHub,
  })),
);
const AuditSettingsHub = lazy(() =>
  import('./pages/AuditSettingsHub.js').then((m) => ({
    default: m.AuditSettingsHub,
  })),
);
const InsuredActuarialHub = lazy(() =>
  import('./pages/InsuredActuarialHub.js').then((m) => ({
    default: m.InsuredActuarialHub,
  })),
);

// الصفحات المعزولة الأقل استخداماً — تُحمَّل كسولاً (lazy) لتقسيم الحزمة الرئيسية
// وتقليل الإقلاع. تُقسّم كل صفحة إلى حزمتها الخاصة عبر Vite/Rollup.
// ملاحظة: Budgets/AuditLog/FinancialRegulation/InsuredListViewer/Journal2024Viewer
// باتت تُستورَد داخل المحاور الموحّدة (ModuleTabs) فلم تعد هنا.
const PromoShowcase = lazy(() =>
  import('./pages/PromoShowcase.js').then((m) => ({
    default: m.PromoShowcase,
  })),
);
const FixedAssets = lazy(() =>
  import('./pages/FixedAssets.js').then((m) => ({ default: m.FixedAssets })),
);
const EInvoicing = lazy(() =>
  import('./pages/EInvoicing.js').then((m) => ({ default: m.EInvoicing })),
);
const JulesDashboard = lazy(() =>
  import('./pages/JulesDashboard.js').then((m) => ({
    default: m.JulesDashboard,
  })),
);
const UnionCommittees = lazy(() =>
  import('./pages/UnionCommittees.js').then((m) => ({
    default: m.UnionCommittees,
  })),
);
const CommitteeDataViewer = lazy(() =>
  import('./pages/CommitteeDataViewer.js').then((m) => ({
    default: m.CommitteeDataViewer,
  })),
);
const ModelsViewer = lazy(() =>
  import('./pages/ModelsViewer.js').then((m) => ({ default: m.ModelsViewer })),
);
const TrainingAccounting2024 = lazy(() =>
  import('./pages/TrainingAccounting2024.js').then((m) => ({
    default: m.TrainingAccounting2024,
  })),
);
const FinalAccounts2024 = lazy(() =>
  import('./pages/FinalAccounts2024.js').then((m) => ({
    default: m.FinalAccounts2024,
  })),
);
const BalanceSheet = lazy(() =>
  import('./pages/BalanceSheet.js').then((m) => ({ default: m.BalanceSheet })),
);
const StatutoryHub = lazy(() =>
  import('./pages/StatutoryHub.js').then((m) => ({ default: m.StatutoryHub })),
);

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
  'balance-sheet': 'balance-sheet',
  assets: 'assets',
  'fixed-assets': 'assets',
  'voice-agent': 'voice-agent',
  'voice-journal': 'voice-agent',
};

const MODELS_HUB_ALIASES: Record<string, ModelsTabId> = {
  models: 'library',
  'committee-data': 'committees',
  committees: 'committees',
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

const HRS_HUB_ALIASES: Record<string, HrsTabId> = {
  hrs: 'employees',
  employees: 'employees',
  payroll: 'payroll',
  attendance: 'attendance',
  advances: 'advances',
  biometric: 'biometric',
  'biometric-attendance': 'biometric',
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

// الوحدة النظامية: النواة المحاسبية والفحص تفتحان وحدتهما، أما «النظام الأساسي» فداخل شاشة الرقابة المالية
const STATUTORY_HUB_ALIASES: Record<string, StatutoryTabId> = {
  statutory: 'statute',
  'financial-core': 'financial',
  'accounting-core': 'accounting',
  'statutory-check': 'check',
};

const AI_HUB_ALIASES: Record<string, AiTabId> = {
  aihub: 'ai',
  ai: 'ai',
  liveagent: 'liveagent',
};

function loadStoredPortal(): PortalId {
  const saved = localStorage.getItem('union_active_portal');
  return saved === 'training' || saved === 'committees' ? saved : 'syndicate';
}

export function App() {
  const [selectedGateway, setSelectedGateway] =
    useState<PortalId>(loadStoredPortal);
  const portalMeta = getGatewayMeta(selectedGateway);
  const [currentTab, setCurrentTab] = useState('portals');
  const [selectedOrgId, setSelectedOrgId] = useState(
    portalMeta?.organizationId || 'org-general',
  );
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

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
  };

  const loadUser = async () => {
    try {
      const user = await api.getMe();
      setCurrentUser(user);
    } catch (err) {
      console.error('Failed to load user:', err);
    }
  };

  const showToast = (
    type: 'success' | 'error' | 'warning' | 'info',
    message: string,
  ) => {
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

  const handleVoiceReceiptDraft = (draft: {
    payerName: string;
    amount: number;
    reason?: string;
  }) => {
    setVoiceReceiptDraft({ ...draft, stamp: Date.now() });
    setCurrentTab('receipts');
  };

  const handleAssistantNavigate = (target: AssistantScreen) => {
    const portal = GATEWAYS.find((item) => item.id === target.portalId);
    const screen = OPERATOR_NAVIGATION.find((item) => item.id === target.id);
    const allowed =
      currentUser?.isActive &&
      !currentUser.isDemo &&
      (hasPerm(currentUser, 'system:admin') ||
        currentUser.organizationId === target.organizationId ||
        currentUser.allowedOrgIds.includes(target.organizationId));
    if (
      !allowed ||
      !portal ||
      !screen ||
      !screen.portals.includes(portal.id) ||
      (portal.organizationId !== target.organizationId &&
        target.organizationId !== selectedOrgId) ||
      (['settings', 'jules'].includes(target.id) &&
        !hasPerm(currentUser, 'system:admin'))
    ) {
      showToast('error', 'هذه الشاشة أو الجهة ليست ضمن الصلاحيات المتاحة.');
      return;
    }
    setSelectedGateway(portal.id);
    setSelectedOrgId(target.organizationId);
    setCurrentTab(screen.id);
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
              onShowToast={showToast}
            />
          </ErrorBoundary>
        )}

        {currentTab === 'dashboard' && (
          <ErrorBoundary
            label="لوحة التحكم والمؤشرات"
            onNavigate={setCurrentTab}
          >
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
        currentTab === 'balance-sheet' ||
        currentTab === 'assets' ||
        currentTab === 'fixed-assets' ||
        currentTab === 'voice-agent' ||
        currentTab === 'voice-journal' ||
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
          <ErrorBoundary
            label="العضوية والتحصيل واللجان"
            onNavigate={setCurrentTab}
          >
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
        currentTab === 'hrs' ||
        currentTab === 'employees' ||
        currentTab === 'payroll' ||
        currentTab === 'attendance' ||
        currentTab === 'advances' ||
        currentTab === 'biometric' ||
        currentTab === 'biometric-attendance' ? (
          <ErrorBoundary
            label="الموارد البشرية والعاملين"
            onNavigate={setCurrentTab}
          >
            <HrsHub
              key={currentTab}
              organizationId={selectedOrgId}
              currentUser={currentUser}
              onShowToast={showToast}
              initialTab={HRS_HUB_ALIASES[currentTab] ?? 'employees'}
            />
          </ErrorBoundary>
        ) : null}

        {currentTab === 'liveagent' ||
        currentTab === 'ai' ||
        currentTab === 'aihub' ? (
          <ErrorBoundary
            label="الذكاء الاصطناعي والمساعد الحي"
            onNavigate={setCurrentTab}
          >
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
          <ErrorBoundary
            label="الفيديو والعرض الترويجي"
            onNavigate={setCurrentTab}
          >
            <div className="p-6">
              <Suspense fallback={lazyFallback('العرض الترويجي')}>
                <PromoShowcase />
              </Suspense>
            </div>
          </ErrorBoundary>
        )}

        {currentTab === 'statutory' ||
        currentTab === 'financial-core' ||
        currentTab === 'accounting-core' ||
        currentTab === 'statutory-check' ? (
          <ErrorBoundary
            label="النظام الأساسي والوحدات"
            onNavigate={setCurrentTab}
          >
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

        {currentTab === 'budgets' ||
        currentTab === 'regulation' ||
        currentTab === 'statute' ||
        currentTab === 'regulations-library' ||
        currentTab === 'regulation-assistant' ||
        currentTab === 'regulation-budgets' ? (
          <ErrorBoundary
            label="الرقابة المالية والموازنات"
            onNavigate={setCurrentTab}
          >
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

        {currentTab === 'committee-data' || currentTab === 'committees-data' ? (
          <ErrorBoundary
            label="النماذج وبيان اللجان"
            onNavigate={setCurrentTab}
          >
            <Suspense fallback={lazyFallback('بيان اللجان والمكاتب')}>
              <ModelsViewer
                key={currentTab}
                organizationId={selectedOrgId}
                currentUser={currentUser}
                onShowToast={showToast}
                initialTab="committees"
              />
            </Suspense>
          </ErrorBoundary>
        ) : null}

        {currentTab === 'taxes' ||
        currentTab === 'payroll-tax' ||
        currentTab === 'business-tax' ||
        currentTab === 'income-tax' ||
        currentTab === 'income-tax-law' ||
        currentTab === 'einvoicing' ||
        currentTab === 'e-invoicing' ? (
          <ErrorBoundary label="الضرائب" onNavigate={setCurrentTab}>
            <Suspense fallback={lazyFallback('وحدة الضرائب')}>
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

        {currentTab === 'models' && (
          <ErrorBoundary
            label="مكتبة النماذج والمستندات"
            onNavigate={setCurrentTab}
          >
            <Suspense fallback={lazyFallback('مكتبة النماذج')}>
              <ModelsViewer
                key={currentTab}
                organizationId={selectedOrgId}
                currentUser={currentUser}
                onShowToast={showToast}
                initialTab={MODELS_HUB_ALIASES[currentTab] ?? 'library'}
              />
            </Suspense>
          </ErrorBoundary>
        )}

        {currentTab === 'training-accounting-2024' && (
          <ErrorBoundary
            label="برنامج المحاسبة 2024 (مركز التدريب)"
            onNavigate={setCurrentTab}
          >
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
          <ErrorBoundary
            label="الميزانية العمومية والحسابات الختامية 2024"
            onNavigate={setCurrentTab}
          >
            <Suspense
              fallback={lazyFallback(
                'الميزانية العمومية والحسابات الختامية 2024',
              )}
            >
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

        {currentTab === 'settings' && selectedGateway !== 'syndicate' && (
          <ErrorBoundary
            label="الإعدادات والصلاحيات"
            onNavigate={setCurrentTab}
          >
            <Settings
              organizationId={selectedOrgId}
              currentUser={currentUser}
              onShowToast={showToast}
            />
          </ErrorBoundary>
        )}
      </Layout>

      {/* المساعد العام — عائم ومتاح في كل الشاشات، وينفّذ الأوامر على بيانات البرنامج */}
      <GeneralAssistantWidget
        currentTab={currentTab}
        selectedOrgId={selectedOrgId}
        currentUser={currentUser}
        onNavigateTab={setCurrentTab}
        onShowToast={showToast}
      />

      {/* Global Toasts */}
      <ToastContainer toasts={toasts} onDismiss={handleDismissToast} />
    </>
  );
}

export default App;
