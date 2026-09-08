import React, { useState } from 'react';
import { ScrollText, PieChart, Landmark } from 'lucide-react';
import { FinancialRegulation } from './FinancialRegulation.js';
import { Budgets } from './Budgets.js';
import { ModuleTabs, ModuleTabDef } from '../components/ModuleTabs.js';
import { User } from '../types/erp.js';

export type RegulationBudgetsTabId = 'regulation' | 'budgets';

interface RegulationBudgetsHubProps {
  organizationId: string;
  currentUser: User | null;
  onShowToast: (type: 'success' | 'error' | 'warning' | 'info', msg: string) => void;
  /** الوحدة الفرعية المفتوحة عند الوصول */
  initialTab?: RegulationBudgetsTabId;
}

const SUB_TABS: ModuleTabDef<RegulationBudgetsTabId>[] = [
  { id: 'regulation', label: 'اللائحة المالية والرقابة', icon: ScrollText },
  { id: 'budgets', label: 'الموازنة التقديرية', icon: PieChart },
];

export const RegulationBudgetsHub: React.FC<RegulationBudgetsHubProps> = ({
  organizationId,
  currentUser,
  onShowToast,
  initialTab = 'regulation',
}) => {
  const [activeTab, setActiveTab] = useState<RegulationBudgetsTabId>(initialTab);

  return (
    <div className="space-y-4">
      <ModuleTabs
        title="الرقابة المالية والموازنات — وحدة موحدة"
        tabs={SUB_TABS}
        activeId={activeTab}
        onChange={setActiveTab}
        icon={Landmark}
      />

      <div>
        {activeTab === 'regulation' && (
          <FinancialRegulation organizationId={organizationId} currentUser={currentUser} onShowToast={onShowToast} />
        )}
        {activeTab === 'budgets' && (
          <Budgets organizationId={organizationId} currentUser={currentUser} onShowToast={onShowToast} />
        )}
      </div>
    </div>
  );
};

export default RegulationBudgetsHub;