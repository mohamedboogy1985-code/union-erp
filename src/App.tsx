import { useState, useEffect, lazy, Suspense } from 'react';
import { Layout } from './components/Layout.js';
import { ToastContainer, ToastMessage } from './components/Toast.js';
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
import { getGatewayMeta, PortalId } from './config/portals.js';

// الصفحات المعزولة الأقل استخداماً — تُحمَّل كسولاً (lazy) لتقسيم الحزمة الرئيسية
// وتقليل الإقلاع. تُقسّم كل صفحة إلى حزمتها الخاصة عبر Vite/Rollup.
const PromoShowcase = lazy(() => import('./pages/PromoShowcase.js').then((m) => ({ default: m.PromoShowcase })));
const Budgets = lazy(() => import('./pages/Budgets.js').then((m) => ({ default: m.Budgets })));
const FixedAssets = lazy(() => import('./pages/FixedAssets.js').then((m) => ({ default: m.FixedAssets })));
const EInvoicing = lazy(() => import('./pages/EInvoicing.js').then((m) => ({ default: m.EInvoicing })));
const AuditLog = lazy(() => import('./pages/AuditLog.js').then((m) => ({ default: m.AuditLog })));
const FinancialRegulation = lazy(() => import('./pages/FinancialRegulation.js').then((m) => ({ default: m.FinancialRegulation })));
const UnionCommittees = lazy(() => import('./pages/UnionCommittees.js').then((m) => ({ default: m.UnionCommittees })));
const CommitteeDataViewer = lazy(() => import('./pages/CommitteeDataViewer.js').then((m) => ({ default: m.CommitteeDataViewer })));
const InsuredListViewer = lazy(() => import('./pages/InsuredListViewer.js').then((m) => ({ default: m.InsuredListViewer })));
const Journal2024Viewer = lazy(() => import('./pages/Journal2024Viewer.js').then((m) => ({ default: m.Journal2024Viewer })));
const ModelsViewer = lazy(() => import('./pages/ModelsViewer.js').then((m) => ({ default: m.ModelsViewer })));
const TrainingAccounting2024 = lazy(() => import('./pages/TrainingAccounting2024.js').then((m) => ({ default: m.TrainingAccounting2024 })));
const FinalAccounts2024 = lazy(() => import('./pages/FinalAccounts2024.js').then((m) => ({ default: m.FinalAccounts2024 })));
const BalanceSheet = lazy(() => import('./pages/BalanceSheet.js').then((m) => ({ default: m.BalanceSheet })));

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
};

const HRS_HUB_ALIASES: Record<string, HrsTabId> = {
  hrs: 'employees',
  employees: 'employees',
  payroll: 'payroll',
  attendance: 'attendance',
  advances: 'advances',
  actuarial: 'actuarial',
};

const MEMBERSHIP_HUB_ALIASES: Record<string, MembershipTabId> = {
  membership: 'members',
  members: 'members',
  receipts: 'receipts',
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
        currentTab === 'membership' ? (
          <ErrorBoundary label="العضوية والتحصيل" onNavigate={setCurrentTab}>
            <MembershipHub
              key={currentTab}
              organizationId={selectedOrgId}
              currentUser={currentUser}
              onShowToast={showToast}
              voiceDraft={voiceReceiptDraft}
              initialTab={MEMBERSHIP_HUB_ALIASES[currentTab]}
            />
          </ErrorBoundary>
        ) : null}

        {currentTab === 'actuarial' ||
        currentTab === 'employees' ||
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

        {currentTab === 'promo' && (
          <ErrorBoundary label="الفيديو والعرض الترويجي" onNavigate={setCurrentTab}>
            <div className="p-6">
              <Suspense fallback={lazyFallback('العرض الترويجي')}>
                <PromoShowcase />
              </Suspense>
            </div>
          </ErrorBoundary>
        )}

        {currentTab === 'budgets' && (
          <ErrorBoundary label="الموازنة التقديرية" onNavigate={setCurrentTab}>
            <Suspense fallback={lazyFallback('الموازنة التقديرية')}>
            <Budgets
              organizationId={selectedOrgId}
              currentUser={currentUser}
              onShowToast={showToast}
            />
            </Suspense>
          </ErrorBoundary>
        )}

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

        {currentTab === 'audit' && (
          <ErrorBoundary label="سجل التدقيق والرقابة" onNavigate={setCurrentTab}>
            <Suspense fallback={lazyFallback('سجل التدقيق')}>
            <AuditLog
              organizationId={selectedOrgId}
              currentUser={currentUser}
              onShowToast={showToast}
            />
            </Suspense>
          </ErrorBoundary>
        )}

        {currentTab === 'regulation' && (
          <ErrorBoundary label="اللائحة المالية والرقابة" onNavigate={setCurrentTab}>
            <Suspense fallback={lazyFallback('اللائحة المالية')}>
            <FinancialRegulation
              organizationId={selectedOrgId}
              currentUser={currentUser}
              onShowToast={showToast}
            />
            </Suspense>
          </ErrorBoundary>
        )}

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

        {currentTab === 'committees' && (
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

        {currentTab === 'insured-list' && (
          <ErrorBoundary label="المؤمَّن عليهم (صندوق اكتواري)" onNavigate={setCurrentTab}>
            <Suspense fallback={lazyFallback('المؤمَّن عليهم')}>
            <InsuredListViewer
              organizationId={selectedOrgId}
              currentUser={currentUser}
              onShowToast={showToast}
            />
            </Suspense>
          </ErrorBoundary>
        )}

        {currentTab === 'journal-2024' && (
          <ErrorBoundary label="قيود يومية 2024 (بوابات)" onNavigate={setCurrentTab}>
            <Suspense fallback={lazyFallback('قيود يومية 2024')}>
            <Journal2024Viewer
              organizationId={selectedOrgId}
              currentUser={currentUser}
              onShowToast={showToast}
            />
            </Suspense>
          </ErrorBoundary>
        )}

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

        {currentTab === 'settings' && (
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
    </>
  );
}

export default App;
