import React, { useState } from 'react';
import { ScrollText, Scale, BookOpenCheck, ClipboardCheck, Landmark } from 'lucide-react';
import { ModuleTabs, ModuleTabDef } from '../components/ModuleTabs.js';
import { User } from '../types/erp.js';
import { StatuteBoard } from '../features/statutory/StatuteBoard.js';
import { FinancialRulesBoard } from '../features/statutory/FinancialRulesBoard.js';
import { AccountingCoreBoard } from '../features/statutory/AccountingCoreBoard.js';
import { StatutoryCheckBoard } from '../features/statutory/StatutoryCheckBoard.js';

export type StatutoryTabId = 'statute' | 'financial' | 'accounting' | 'check';

interface StatutoryHubProps {
  organizationId: string;
  currentUser: User | null;
  onShowToast: (type: 'success' | 'error' | 'warning' | 'info', msg: string) => void;
  /** الوحدة الفرعية المفتوحة عند الوصول (يدعم كل روابط التنقل القديمة/المباشرة) */
  initialTab?: StatutoryTabId;
}

const SUB_TABS: ModuleTabDef<StatutoryTabId>[] = [
  { id: 'statute', label: 'النظام الأساسي', icon: ScrollText, badge: '69 مادة' },
  { id: 'financial', label: 'اللائحة المالية', icon: Scale, badge: '90 قاعدة' },
  { id: 'accounting', label: 'النواة المحاسبية', icon: BookOpenCheck, badge: '118 حساباً' },
  { id: 'check', label: 'الفحص والحكامة', icon: ClipboardCheck, badge: 'بوابة' },
];

/**
 * ===== الوحدة النظامية الموحّدة =====
 * تجمع: النظام الأساسي (69 مادة/113 قاعدة) + اللائحة المالية (90 قاعدة/53 عتبة)
 *        + النواة المحاسبية الموحّدة (118 حساباً) + بوابة الفحص الموحّد.
 * كل البيانات من مسارات الخادم المضافة: /api/statute • /api/financial • /api/accounting
 */
export const StatutoryHub: React.FC<StatutoryHubProps> = ({
  organizationId,
  currentUser,
  onShowToast,
  initialTab = 'statute',
}) => {
  const [activeTab, setActiveTab] = useState<StatutoryTabId>(initialTab);

  return (
    <div className="space-y-4" data-assistant-screen={`statutory-${activeTab}`}>
      <ModuleTabs
        title="النظام الأساسي والوحدات — وحدة موحدة"
        icon={Landmark}
        tabs={SUB_TABS}
        activeId={activeTab}
        onChange={setActiveTab}
      />

      <div>
        {activeTab === 'statute' && (
          <StatuteBoard organizationId={organizationId} currentUser={currentUser} onShowToast={onShowToast} />
        )}
        {activeTab === 'financial' && (
          <FinancialRulesBoard organizationId={organizationId} currentUser={currentUser} onShowToast={onShowToast} />
        )}
        {activeTab === 'accounting' && (
          <AccountingCoreBoard organizationId={organizationId} currentUser={currentUser} onShowToast={onShowToast} />
        )}
        {activeTab === 'check' && (
          <StatutoryCheckBoard organizationId={organizationId} currentUser={currentUser} onShowToast={onShowToast} />
        )}
      </div>
    </div>
  );
};

export default StatutoryHub;
