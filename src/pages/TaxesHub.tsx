import React, { useState } from 'react';
import {
  BadgePercent,
  Building2,
  FileSpreadsheet,
  GitBranch,
  Receipt,
} from 'lucide-react';
import { ModuleTabs, ModuleTabDef } from '../components/ModuleTabs.js';
import { EInvoicing } from './EInvoicing.js';
import { PayrollTaxView } from './taxes/PayrollTaxView.js';
import { BusinessTaxView } from './taxes/BusinessTaxView.js';
import { IncomeTaxLawView } from './taxes/IncomeTaxLawView.js';
import { User } from '../types/erp.js';

export type TaxesTabId = 'payroll' | 'business' | 'income-law' | 'einvoicing';

interface TaxesHubProps {
  organizationId: string;
  currentUser: User | null;
  onShowToast: (
    type: 'success' | 'error' | 'warning' | 'info',
    msg: string,
  ) => void;
  initialTab?: TaxesTabId;
}

const TAX_TABS: ModuleTabDef<TaxesTabId>[] = [
  {
    id: 'payroll',
    label: 'ضريبة كسب العمل والشرائح',
    icon: BadgePercent,
    badge: 'المادة 8',
  },
  {
    id: 'business',
    label: 'الأرباح التجارية والصناعية والمهن الحرة',
    icon: Building2,
    badge: '22.5% / شرائح',
  },
  {
    id: 'income-law',
    label: 'قانون الضريبة على الدخل',
    icon: GitBranch,
    badge: '91 لسنة 2005',
  },
  {
    id: 'einvoicing',
    label: 'الفاتورة الإلكترونية',
    icon: Receipt,
    badge: 'منظومة المصلحة',
  },
];

/** وحدة الضرائب الموحدة: كسب العمل • الأرباح التجارية والصناعية والم  ن الحرة • قانون الدخل • الفاتورة الإلكترونية. */
export const TaxesHub: React.FC<TaxesHubProps> = ({
  organizationId,
  currentUser,
  onShowToast,
  initialTab = 'payroll',
}) => {
  const [activeTab, setActiveTab] = useState<TaxesTabId>(initialTab);

  return (
    <div className="space-y-4" data-assistant-screen={`taxes-${activeTab}`}>
      <ModuleTabs
        title="الضرائب وكسب العمل — وحدة موحدة"
        tabs={TAX_TABS}
        activeId={activeTab}
        onChange={setActiveTab}
        icon={FileSpreadsheet}
      />

      <div>
        {activeTab === 'payroll' && (
          <PayrollTaxView
            organizationId={organizationId}
            currentUser={currentUser}
            onShowToast={onShowToast}
          />
        )}
        {activeTab === 'business' && (
          <BusinessTaxView
            organizationId={organizationId}
            currentUser={currentUser}
            onShowToast={onShowToast}
          />
        )}
        {activeTab === 'income-law' && (
          <IncomeTaxLawView
            organizationId={organizationId}
            currentUser={currentUser}
            onShowToast={onShowToast}
          />
        )}
        {activeTab === 'einvoicing' && (
          <EInvoicing
            organizationId={organizationId}
            currentUser={currentUser}
            onShowToast={onShowToast}
          />
        )}
      </div>
    </div>
  );
};

export default TaxesHub;
