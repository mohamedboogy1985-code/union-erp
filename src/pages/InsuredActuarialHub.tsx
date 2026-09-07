import React, { useState } from 'react';
import { Calculator, ShieldCheck, Users } from 'lucide-react';
import { InsuredListViewer } from './InsuredListViewer.js';
import { ActuarialStudio } from './ActuarialStudio.js';
import { ModuleTabs, ModuleTabDef } from '../components/ModuleTabs.js';
import { User } from '../types/erp.js';

export type InsuredActuarialTabId = 'insured' | 'actuarial';

interface InsuredActuarialHubProps {
  organizationId: string;
  currentUser: User | null;
  onShowToast: (type: 'success' | 'error' | 'warning' | 'info', msg: string) => void;
  /** الوحدة الفرعية المفتوحة عند الوصول */
  initialTab?: InsuredActuarialTabId;
}

const SUB_TABS: ModuleTabDef<InsuredActuarialTabId>[] = [
  { id: 'insured', label: 'المؤمَّن عليهم — الصندوق الإكتواري', icon: Users },
  { id: 'actuarial', label: 'الدراسات الإكتوارية والصناديق', icon: Calculator, badge: 'معاشات/تكافل' },
];

export const InsuredActuarialHub: React.FC<InsuredActuarialHubProps> = ({
  organizationId,
  currentUser,
  onShowToast,
  initialTab = 'insured',
}) => {
  const [activeTab, setActiveTab] = useState<InsuredActuarialTabId>(initialTab);

  return (
    <div className="space-y-4">
      <ModuleTabs
        title="الصندوق الإكتواري — وحدة موحدة"
        tabs={SUB_TABS}
        activeId={activeTab}
        onChange={setActiveTab}
        icon={ShieldCheck}
      />

      <div>
        {activeTab === 'insured' && (
          <InsuredListViewer organizationId={organizationId} currentUser={currentUser} onShowToast={onShowToast} />
        )}
        {activeTab === 'actuarial' && (
          <ActuarialStudio organizationId={organizationId} currentUser={currentUser} onShowToast={onShowToast} />
        )}
      </div>
    </div>
  );
};

export default InsuredActuarialHub;