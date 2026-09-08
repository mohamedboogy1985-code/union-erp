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
import { AiHub, AiTabId } from './pages/AiHub.js';
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

const RegulationBudgetsHub = lazy(() => import('./pages/RegulationBudgetsHub.js').then((m) => ({ default: m.RegulationBudgetsHub })));
const AuditSettingsHub = lazy(() => import('./pages/AuditSettingsHub.js').then((m) => ({ default: m.AuditSettingsHub })));
const InsuredActuarialHub = lazy(() => import('./pages/InsuredActuarialHub.js').then((m) => ({ default: m.InsuredActuarialHub })));

// الصفحات المعزولة الأقل استخداماً — تُحمَّل كسولاً (lazy) لتقسيم الحزمة الرئيسية
// وتقليل الإقلاع. تُقسّم كل صفحة إلى حزمتها الخاصة عبر Vite/Rollup.
// ملاحظة: Budgets/AuditLog/FinancialRegulation/InsuredListViewer/Journal2024Viewer
// باتت تُستورَد داخل المحاور الموحّدة (ModuleTabs) فلم تعد هنا.

const FixedAssets = lazy(() => import('./pages/FixedAssets.js').then((m) => ({ default: m.FixedAssets })));
const EInvoicing = lazy(() => import('./pages/EInvoicing.js').then((m) => ({ default: m.EInvoicing })));
const AuditLog = lazy(() => import('./pages/AuditLog.js').then((m) => ({ default: m.AuditLog })));
const JulesDashboard = lazy(() => import('./pages/JulesDashboard.js').then((m) => ({ default: m.JulesDashboard })));
const FinancialRegulation = lazy(() => import('./pages/FinancialRegulation.js').then((m) => ({ default: m.FinancialRegulation })));
const UnionCommittees = lazy(() => import('./pages/UnionCommittees.js').then((m) => ({ default: m.UnionCommittees })));
const CommitteeDataViewer = lazy(() => import('./pages/CommitteeDataViewer.js').then((m) => ({ default: m.CommitteeDataViewer })));
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
  advances: 'advances',
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
  const [selectedGateway, setSelectedGateway] = useState<PortalId>(loadStoredPortal);
  const portalMeta = getGatewayMeta(selectedGateway);
  const [currentTab, setCurrentTab] = useState('portals');
  const [selectedOrgId, setSelectedOrgId] = useState(portalMeta?.organizationId || 'org-general');
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [welcomePortal, setWelcomePortal] = useState<PortalId | null>(null);

  useEffect(() => {
    loadUser();
  }, []);

  // عند تغيير البوابة: نضبط كيان/بيانات البوابة وشاشة البداية الخاصة بها + ترحيب ذكي صوتي
  const handleSelectGateway = (gateway: PortalId) => {
    const meta = getGatewayMeta(gateway);
    setSelectedGateway(gateway);
    setSelectedOrgId(meta?.organizationId || 'org-general');
    setCurrentTab(meta?.homeTab || 'portals');
    localStorage.setItem('union_active_portal', gateway);
    setWelcomePortal(gateway);
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
    const screen = OPERATOR_NAVIGATION.find(item => item.id === target.id);
    const allowed = currentUser?.isActive && !currentUser.isDemo &&
      (hasPerm(currentUser, 'system:admin') || currentUser.organizationId === target.organizationId || currentUser.allowedOrgIds.includes(target.organizationId));
    if (!allowed || !portal || !screen || !screen.portals.includes(portal.id) || (portal.organizationId !== target.organizationId && target.organizationId !== selectedOrgId) ||
      (['settings', 'jules'].includes(target.id) && !hasPerm(currentUser, 'system:admin'))) {
      showToast('error', 'هذه الشاشة أو الجهة ليست ضمن الصلاحيات المتاحة.'); return;
    }
    setSelectedGateway(portal.id); setSelectedOrgId(target.organizationId); setCurrentTab(screen.id);
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
            <Gateways onSelectGateway={handleSelectGateway} onShowToast={showToast} />
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

        {currentTab === 'liveagent' || currentTab === 'ai' || currentTab === 'aihub' ? (
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

        

        {currentTab === 'budgets' ||
        currentTab === 'regulation' ||
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

        {currentTab === 'einvoicing' && (
          <ErrorBoundary label="الفاتورة الإلكترونية" onNavigate={setCurrentTab}>
            <Suspense fallback={lazyFallback('الفاتورة الإلكترونية')}>
            <EInvoicing
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

        {currentTab === 'committee-data' && (
          <ErrorBoundary label="بيانات اللجان والمكاتب (بوابات)" onNavigate={setCurrentTab}>
            <Suspense fallback={lazyFallback('بيانات اللجان')}>
            <CommitteeDataViewer
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

        {currentTab === 'models' && (
          <ErrorBoundary label="مكتبة النماذج والمستندات" onNavigate={setCurrentTab}>
            <Suspense fallback={lazyFallback('مكتبة النماذج')}>
            <ModelsViewer
              organizationId={selectedOrgId}
              currentUser={currentUser}
              onShowToast={showToast}
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

      {/* رسالة الترحيب الذكية عند اختيار بوابة — صوت + نص مع ذكر اسم البوابة */}
      {welcomePortal && (
        <PortalWelcome
          portalId={welcomePortal}
          onClose={() => setWelcomePortal(null)}
          onContinue={() => setWelcomePortal(null)}
        />
      )}
    </>
  );
}

export default App;
