import React, { useState, useEffect } from 'react';
import { Layout } from './components/Layout.js';
import { ToastContainer, ToastMessage } from './components/Toast.js';
import { api, getCurrentUserId } from './services/api.js';
import { User } from './types/erp.js';

// Pages
import { Dashboard } from './pages/Dashboard.js';
import { AccountingHub, AccountingTabId } from './pages/AccountingHub.js';
import { HrsHub, HrsTabId } from './pages/HrsHub.js';
import { MembershipHub, MembershipTabId } from './pages/MembershipHub.js';
import { AiHub, AiTabId } from './pages/AiHub.js';
import { PromoShowcase } from './pages/PromoShowcase.js';
import { Budgets } from './pages/Budgets.js';
import { FixedAssets } from './pages/FixedAssets.js';
import { EInvoicing } from './pages/EInvoicing.js';
import { AuditLog } from './pages/AuditLog.js';
import { FinancialRegulation } from './pages/FinancialRegulation.js';
import { UnionCommittees } from './pages/UnionCommittees.js';
import { CommitteeDataViewer } from './pages/CommitteeDataViewer.js';
import { InsuredListViewer } from './pages/InsuredListViewer.js';
import { Journal2024Viewer } from './pages/Journal2024Viewer.js';
import { Gateways } from './pages/Gateways.js';
import { ErrorBoundary } from './components/ErrorBoundary.js';
import { Settings } from './pages/Settings.js';

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

export function App() {
  const [currentTab, setCurrentTab] = useState('portals');
  const [selectedOrgId, setSelectedOrgId] = useState('org-general');
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  useEffect(() => {
    loadUser();
  }, []);

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

  return (
    <>
      <Layout
        currentTab={currentTab}
        onTabChange={setCurrentTab}
        selectedOrgId={selectedOrgId}
        onOrgChange={setSelectedOrgId}
        currentUser={currentUser}
        onUserChange={setCurrentUser}
      >
        {currentTab === 'portals' && (
          <ErrorBoundary label="بوابات النظام" onNavigate={setCurrentTab}>
            <Gateways onNavigate={setCurrentTab} onShowToast={showToast} />
          </ErrorBoundary>
        )}

        {currentTab === 'dashboard' && (
          <ErrorBoundary label="لوحة التحكم والمؤشرات" onNavigate={setCurrentTab}>
            <Dashboard
              organizationId={selectedOrgId}
              currentUser={currentUser}
              onNavigate={setCurrentTab}
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
              <PromoShowcase />
            </div>
          </ErrorBoundary>
        )}

        {currentTab === 'budgets' && (
          <ErrorBoundary label="الموازنة التقديرية" onNavigate={setCurrentTab}>
            <Budgets
              organizationId={selectedOrgId}
              currentUser={currentUser}
              onShowToast={showToast}
            />
          </ErrorBoundary>
        )}

        {currentTab === 'assets' && (
          <ErrorBoundary label="الأصول الثابتة والإهلاك" onNavigate={setCurrentTab}>
            <FixedAssets
              organizationId={selectedOrgId}
              currentUser={currentUser}
              onShowToast={showToast}
            />
          </ErrorBoundary>
        )}

        {currentTab === 'einvoicing' && (
          <ErrorBoundary label="الفاتورة الإلكترونية" onNavigate={setCurrentTab}>
            <EInvoicing
              organizationId={selectedOrgId}
              currentUser={currentUser}
              onShowToast={showToast}
            />
          </ErrorBoundary>
        )}

        {currentTab === 'audit' && (
          <ErrorBoundary label="سجل التدقيق والرقابة" onNavigate={setCurrentTab}>
            <AuditLog
              organizationId={selectedOrgId}
              currentUser={currentUser}
              onShowToast={showToast}
            />
          </ErrorBoundary>
        )}

        {currentTab === 'regulation' && (
          <ErrorBoundary label="اللائحة المالية والرقابة" onNavigate={setCurrentTab}>
            <FinancialRegulation
              organizationId={selectedOrgId}
              currentUser={currentUser}
              onShowToast={showToast}
            />
          </ErrorBoundary>
        )}

        {currentTab === 'committees' && (
          <ErrorBoundary label="اللجان النقابية" onNavigate={setCurrentTab}>
            <UnionCommittees
              organizationId={selectedOrgId}
              currentUser={currentUser}
              onShowToast={showToast}
            />
          </ErrorBoundary>
        )}

        {currentTab === 'committee-data' && (
          <ErrorBoundary label="بيانات اللجان والمكاتب (بوابات)" onNavigate={setCurrentTab}>
            <CommitteeDataViewer
              organizationId={selectedOrgId}
              currentUser={currentUser}
              onShowToast={showToast}
            />
          </ErrorBoundary>
        )}

        {currentTab === 'insured-list' && (
          <ErrorBoundary label="المؤمَّن عليهم (صندوق اكتواري)" onNavigate={setCurrentTab}>
            <InsuredListViewer
              organizationId={selectedOrgId}
              currentUser={currentUser}
              onShowToast={showToast}
            />
          </ErrorBoundary>
        )}

        {currentTab === 'journal-2024' && (
          <ErrorBoundary label="قيود يومية 2024 (بوابات)" onNavigate={setCurrentTab}>
            <Journal2024Viewer
              organizationId={selectedOrgId}
              currentUser={currentUser}
              onShowToast={showToast}
            />
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
