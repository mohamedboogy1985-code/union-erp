import React, { useState } from 'react';
import { UsersRound, Banknote, Fingerprint, Wallet, Calculator, Users } from 'lucide-react';
import { EmployeeAffairs } from './EmployeeAffairs.js';
import { Payroll } from './Payroll.js';
import { Attendance } from './Attendance.js';
import { EmployeeAdvances } from './EmployeeAdvances.js';
import { ActuarialStudio } from './ActuarialStudio.js';
import { ModuleTabs, ModuleTabDef } from '../components/ModuleTabs.js';
import { User } from '../types/erp.js';

export type HrsTabId = 'employees' | 'payroll' | 'attendance' | 'advances' | 'actuarial';

interface HrsHubProps {
  organizationId: string;
  currentUser: User | null;
  onShowToast: (type: 'success' | 'error' | 'warning' | 'info', msg: string) => void;
  /** الوحدة الفرعية المفتوحة عند الوصول */
  initialTab?: HrsTabId;
}

const SUB_TABS: ModuleTabDef<HrsTabId>[] = [
  { id: 'employees', label: 'شئون العاملين والتأمينات', icon: UsersRound, badge: 'استمارة 2' },
  { id: 'payroll', label: 'المرتبات (مسير الرواتب)', icon: Banknote, badge: 'شهري' },
  { id: 'attendance', label: 'الحضور والانصراف (البصمة)', icon: Fingerprint, badge: 'وجه/إصبع' },
  { id: 'advances', label: 'سلف العاملين', icon: Wallet },
  { id: 'actuarial', label: 'الدراسات الإكتوارية والصناديق', icon: Calculator, badge: 'معاشات/تكافل' },
];

export const HrsHub: React.FC<HrsHubProps> = ({
  organizationId,
  currentUser,
  onShowToast,
  initialTab = 'employees',
}) => {
  const [activeTab, setActiveTab] = useState<HrsTabId>(initialTab);

  return (
    <div className="space-y-4">
      <ModuleTabs
        title="الموارد البشرية وشئون العاملين — وحدة موحدة"
        tabs={SUB_TABS}
        activeId={activeTab}
        onChange={setActiveTab}
        icon={Users}
      />

      <div>
        {activeTab === 'employees' && (
          <EmployeeAffairs organizationId={organizationId} currentUser={currentUser} onShowToast={onShowToast} />
        )}
        {activeTab === 'payroll' && (
          <Payroll organizationId={organizationId} currentUser={currentUser} onShowToast={onShowToast} />
        )}
        {activeTab === 'attendance' && (
          <Attendance organizationId={organizationId} currentUser={currentUser} onShowToast={onShowToast} />
        )}
        {activeTab === 'advances' && (
          <EmployeeAdvances organizationId={organizationId} currentUser={currentUser} onShowToast={onShowToast} />
        )}
        {activeTab === 'actuarial' && (
          <ActuarialStudio organizationId={organizationId} currentUser={currentUser} onShowToast={onShowToast} />
        )}
      </div>
    </div>
  );
};

export default HrsHub;