import React, { useState } from 'react';
import {
  BookOpen,
  FileText,
  Users,
  Building,
  Building2,
  ShoppingCart,
  CalendarClock,
  Scale,
  Landmark,
  Bot,
  BadgePercent,
  GraduationCap,
} from 'lucide-react';
import { JournalEntries } from './JournalEntries.js';
import { AccountingReports } from './AccountingReports.js';
import { SubledgerParties } from './SubledgerParties.js';
import { ChartOfAccounts } from './ChartOfAccounts.js';
import { Banking } from './Banking.js';
import { Procurement } from './Procurement.js';
import { Journal2024Viewer } from './Journal2024Viewer.js';
import { BalanceSheet } from './BalanceSheet.js';
import { FixedAssets } from './FixedAssets.js';
import { VoiceJournalAgent } from './VoiceJournalAgent.js';
import { ModuleTabs, ModuleTabDef } from '../components/ModuleTabs.js';
import { User } from '../types/erp.js';

export type AccountingTabId =
  | 'journals'
  | 'reports'
  | 'subledgers'
  | 'accounts'
  | 'banking'
  | 'procurement'
  | 'journal2024'
  | 'balance-sheet'
  | 'assets'
  | 'voice-agent'
  | 'training-hr-shortcut';

interface AccountingHubProps {
  organizationId: string;
  currentUser: User | null;
  onShowToast: (
    type: 'success' | 'error' | 'warning' | 'info',
    msg: string,
  ) => void;
  /** الوحدة الفرعية المفتوحة عند الوصول (أو عند التنقل من روابط داخلية قديمة) */
  initialTab?: AccountingTabId;
  /** يفتح الموارد البشرية في بوابة التدريب، دون تمرير بيانات النقابة إلى شاشة HR. */
  onOpenTrainingHr: () => void;
}

const SUB_TABS: ModuleTabDef<AccountingTabId>[] = [
  { id: 'journals', label: 'القيود والحسابات', icon: BookOpen },
  {
    id: 'reports',
    label: 'التقارير المحاسبية',
    icon: FileText,
    badge: 'شامل 1301',
  },
  { id: 'subledgers', label: 'الأستاذ المساعد (المدينون)', icon: Users },
  { id: 'accounts', label: 'دليل الحسابات', icon: Building },
  { id: 'banking', label: 'البنوك والتسويات', icon: Building2 },
  { id: 'procurement', label: 'المشتريات والموردين', icon: ShoppingCart },
  { id: 'journal2024', label: 'قيود يومية 2024', icon: CalendarClock },
  {
    id: 'balance-sheet',
    label: 'الميزانية العمومية والحسابات الختامية',
    icon: Scale,
  },
  { id: 'assets', label: 'الأصول الثابتة والإهلاكات', icon: Landmark },
  {
    id: 'voice-agent',
    label: 'وكيل القيود الصوتية',
    icon: Bot,
    badge: 'إملاء ← اعتماد',
  },
  {
    id: 'training-hr-shortcut',
    label: 'الموارد البشرية — بوابة التدريب',
    icon: GraduationCap,
    badge: 'سياق بيانات منفصل',
  },
];

export const AccountingHub: React.FC<AccountingHubProps> = ({
  organizationId,
  currentUser,
  onShowToast,
  initialTab = 'journals',
  onOpenTrainingHr,
}) => {
  const [activeTab, setActiveTab] = useState<AccountingTabId>(initialTab);

  return (
    <div
      className="space-y-4"
      data-assistant-screen={
        activeTab === 'journal2024' ? 'journal-2024' : activeTab
      }
    >
      <ModuleTabs
        title="المحاسبة والمالية — وحدة موحدة"
        tabs={SUB_TABS}
        activeId={activeTab}
        onChange={(tab) => {
          if (tab === 'training-hr-shortcut') {
            onOpenTrainingHr();
            return;
          }
          setActiveTab(tab);
        }}
      />

      <div>
        {activeTab === 'journals' && (
          <JournalEntries
            organizationId={organizationId}
            currentUser={currentUser}
            onShowToast={onShowToast}
          />
        )}
        {activeTab === 'reports' && (
          <AccountingReports
            organizationId={organizationId}
            currentUser={currentUser}
            onShowToast={onShowToast}
          />
        )}
        {activeTab === 'subledgers' && (
          <SubledgerParties
            organizationId={organizationId}
            currentUser={currentUser}
            onNavigateToStatement={() => setActiveTab('reports')}
            onShowToast={onShowToast}
          />
        )}
        {activeTab === 'accounts' && (
          <ChartOfAccounts
            organizationId={organizationId}
            currentUser={currentUser}
            onShowToast={onShowToast}
          />
        )}
        {activeTab === 'banking' && (
          <Banking
            organizationId={organizationId}
            currentUser={currentUser}
            onShowToast={onShowToast}
          />
        )}
        {activeTab === 'procurement' && (
          <Procurement
            organizationId={organizationId}
            currentUser={currentUser}
            onShowToast={onShowToast}
          />
        )}
        {activeTab === 'journal2024' && (
          <Journal2024Viewer
            organizationId={organizationId}
            currentUser={currentUser}
            onShowToast={onShowToast}
          />
        )}
        {activeTab === 'balance-sheet' && (
          <BalanceSheet
            organizationId={organizationId}
            currentUser={currentUser}
            onShowToast={onShowToast}
          />
        )}
        {activeTab === 'assets' && (
          <FixedAssets
            organizationId={organizationId}
            currentUser={currentUser}
            onShowToast={onShowToast}
          />
        )}
        {activeTab === 'voice-agent' && (
          <VoiceJournalAgent
            organizationId={organizationId}
            currentUser={currentUser}
            onShowToast={onShowToast}
          />
        )}
      </div>
    </div>
  );
};

export default AccountingHub;
