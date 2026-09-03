import React, { useState } from 'react';
import { BookOpen, FileText, Users, Building, Building2, ShoppingCart } from 'lucide-react';
import { JournalEntries } from './JournalEntries.js';
import { AccountingReports } from './AccountingReports.js';
import { SubledgerParties } from './SubledgerParties.js';
import { ChartOfAccounts } from './ChartOfAccounts.js';
import { Banking } from './Banking.js';
import { Procurement } from './Procurement.js';
import { ModuleTabs, ModuleTabDef } from '../components/ModuleTabs.js';
import { User } from '../types/erp.js';

export type AccountingTabId =
  | 'journals'
  | 'reports'
  | 'subledgers'
  | 'accounts'
  | 'banking'
  | 'procurement';

interface AccountingHubProps {
  organizationId: string;
  currentUser: User | null;
  onShowToast: (type: 'success' | 'error' | 'warning' | 'info', msg: string) => void;
  /** الوحدة الفرعية المفتوحة عند الوصول (أو عند التنقل من روابط داخلية قديمة) */
  initialTab?: AccountingTabId;
}

const SUB_TABS: ModuleTabDef<AccountingTabId>[] = [
  { id: 'journals', label: 'القيود والحسابات', icon: BookOpen },
  { id: 'reports', label: 'التقارير المحاسبية', icon: FileText, badge: 'شامل 1301' },
  { id: 'subledgers', label: 'الأستاذ المساعد (المدينون)', icon: Users },
  { id: 'accounts', label: 'دليل الحسابات', icon: Building },
  { id: 'banking', label: 'البنوك والتسويات', icon: Building2 },
  { id: 'procurement', label: 'المشتريات والموردين', icon: ShoppingCart },
];

export const AccountingHub: React.FC<AccountingHubProps> = ({
  organizationId,
  currentUser,
  onShowToast,
  initialTab = 'journals',
}) => {
  const [activeTab, setActiveTab] = useState<AccountingTabId>(initialTab);

  return (
    <div className="space-y-4">
      <ModuleTabs
        title="المحاسبة والمالية — وحدة موحدة"
        tabs={SUB_TABS}
        activeId={activeTab}
        onChange={setActiveTab}
      />

      <div>
        {activeTab === 'journals' && (
          <JournalEntries organizationId={organizationId} currentUser={currentUser} onShowToast={onShowToast} />
        )}
        {activeTab === 'reports' && (
          <AccountingReports organizationId={organizationId} currentUser={currentUser} onShowToast={onShowToast} />
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
          <ChartOfAccounts organizationId={organizationId} currentUser={currentUser} onShowToast={onShowToast} />
        )}
        {activeTab === 'banking' && (
          <Banking organizationId={organizationId} currentUser={currentUser} onShowToast={onShowToast} />
        )}
        {activeTab === 'procurement' && (
          <Procurement organizationId={organizationId} currentUser={currentUser} onShowToast={onShowToast} />
        )}
      </div>
    </div>
  );
};

export default AccountingHub;