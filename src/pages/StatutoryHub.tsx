import React, { useState } from 'react';
import { ScrollText, Scale, BookOpenCheck, ClipboardCheck, Landmark, PieChart } from 'lucide-react';
import { ModuleTabs, ModuleTabDef } from '../components/ModuleTabs.js';
import { User } from '../types/erp.js';
import { StatuteBoard } from '../features/statutory/StatuteBoard.js';
import { FinancialRulesBoard } from '../features/statutory/FinancialRulesBoard.js';
import { AccountingCoreBoard } from '../features/statutory/AccountingCoreBoard.js';
import { StatutoryCheckBoard } from '../features/statutory/StatutoryCheckBoard.js';
import { StatutoryDistributionModelsBoard } from '../features/statutory/StatutoryDistributionModelsBoard.js';

export type StatutoryTabId = 'statute' | 'financial' | 'accounting' | 'check' | 'distribution';

interface StatutoryHubProps {
  organizationId: string;
  currentUser: User | null;
  onShowToast: (type: 'success' | 'error' | 'warning' | 'info', msg: string) => void;
  /** الوحدة الفرعية المفتوحة عند الوصول (يدعم كل روابط التنقل القديمة/المباشرة) */
  initialTab?: StatutoryTabId;
  /** تستخدم عند تضمين الوحدة في شاشة الرقابة المالية الموحدة. */
  embedded?: boolean;
}

const SUB_TABS: ModuleTabDef<StatutoryTabId>[] = [
  { id: 'statute', label: 'النظام الأساسي', icon: ScrollText, badge: '69 مادة' },
  { id: 'financial', label: 'اللائحة المالية', icon: Scale, badge: '90 قاعدة' },
  { id: 'accounting', label: 'النواة المحاسبية', icon: BookOpenCheck, badge: '118 حساباً' },
  { id: 'check', label: 'الفحص والحكامة', icon: ClipboardCheck, badge: 'بوابة' },
  { id: 'distribution', label: 'نماذج التوزيع (م2)', icon: PieChart, badge: '58 + 54 صفاً' },
];

/**
 * ===== الوحدة النظامية الموحّدة =====
 * تجمع: النظام الأساسي + اللائحة المالية (53 عتبة) + النواة المحاسبية + بوابة الفحص
 *        ونماذج توزيع المادة (2) المستخرجة من ملفي Excel.
 * مصادر البيانات: /api/statute • /api/financial • /api/accounting • /api/statutory/distribution-models
 */
export const StatutoryHub: React.FC<StatutoryHubProps> = ({
  organizationId,
  currentUser,
  onShowToast,
  initialTab = 'statute',
  embedded = false,
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
        titleVisible={!embedded}
        sticky={!embedded}
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
        {activeTab === 'distribution' && (
          <StatutoryDistributionModelsBoard organizationId={organizationId} onShowToast={onShowToast} />
        )}
      </div>
    </div>
  );
};

export default StatutoryHub;
