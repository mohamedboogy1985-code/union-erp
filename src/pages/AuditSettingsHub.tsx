import React, { useState } from 'react';
import { ShieldCheck, Settings as SettingsIcon, Lock } from 'lucide-react';
import { AuditLog } from './AuditLog.js';
import { Settings } from './Settings.js';
import { ModuleTabs, ModuleTabDef } from '../components/ModuleTabs.js';
import { User } from '../types/erp.js';

export type AuditSettingsTabId = 'audit' | 'settings';

interface AuditSettingsHubProps {
  organizationId: string;
  currentUser: User | null;
  onShowToast: (type: 'success' | 'error' | 'warning' | 'info', msg: string) => void;
  /** الوحدة الفرعية المفتوحة عند الوصول */
  initialTab?: AuditSettingsTabId;
}

const SUB_TABS: ModuleTabDef<AuditSettingsTabId>[] = [
  { id: 'audit', label: 'سجل التدقيق والرقابة', icon: ShieldCheck },
  { id: 'settings', label: 'الإعدادات والصلاحيات', icon: SettingsIcon },
];

export const AuditSettingsHub: React.FC<AuditSettingsHubProps> = ({
  organizationId,
  currentUser,
  onShowToast,
  initialTab = 'audit',
}) => {
  const [activeTab, setActiveTab] = useState<AuditSettingsTabId>(initialTab);

  return (
    <div className="space-y-4">
      <ModuleTabs
        title="الرقابة والإعدادات — وحدة موحدة"
        tabs={SUB_TABS}
        activeId={activeTab}
        onChange={setActiveTab}
        icon={Lock}
      />

      <div>
        {activeTab === 'audit' && (
          <AuditLog organizationId={organizationId} currentUser={currentUser} onShowToast={onShowToast} />
        )}
        {activeTab === 'settings' && (
          <Settings organizationId={organizationId} currentUser={currentUser} onShowToast={onShowToast} />
        )}
      </div>
    </div>
  );
};

export default AuditSettingsHub;