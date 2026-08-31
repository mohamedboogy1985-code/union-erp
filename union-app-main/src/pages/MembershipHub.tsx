import React, { useState } from 'react';
import { UserCheck, ReceiptText, IdCard } from 'lucide-react';
import { Members } from './Members.js';
import { Receipts } from './Receipts.js';
import { ModuleTabs, ModuleTabDef } from '../components/ModuleTabs.js';
import { User } from '../types/erp.js';

export type MembershipTabId = 'members' | 'receipts';

interface MembershipHubProps {
  organizationId: string;
  currentUser: User | null;
  onShowToast: (type: 'success' | 'error' | 'warning' | 'info', msg: string) => void;
  /** مسودة إيصال قادمة بأمر صوتي من المساعد الحي */
  voiceDraft?: { payerName: string; amount: number; reason?: string; stamp: number } | null;
  /** الوحدة الفرعية المفتوحة عند الوصول */
  initialTab?: MembershipTabId;
}

const SUB_TABS: ModuleTabDef<MembershipTabId>[] = [
  { id: 'members', label: 'الأعضاء والشهادات', icon: UserCheck },
  { id: 'receipts', label: 'التحصيل وتوزيع الإيرادات', icon: ReceiptText },
];

export const MembershipHub: React.FC<MembershipHubProps> = ({
  organizationId,
  currentUser,
  onShowToast,
  voiceDraft,
  initialTab = 'members',
}) => {
  const [activeTab, setActiveTab] = useState<MembershipTabId>(initialTab);

  return (
    <div className="space-y-4">
      <ModuleTabs
        title="العضوية والتحصيل — وحدة موحدة"
        tabs={SUB_TABS}
        activeId={activeTab}
        onChange={setActiveTab}
        icon={IdCard}
      />

      <div>
        {activeTab === 'members' && (
          <Members organizationId={organizationId} currentUser={currentUser} onShowToast={onShowToast} />
        )}
        {activeTab === 'receipts' && (
          <Receipts
            organizationId={organizationId}
            currentUser={currentUser}
            voiceDraft={voiceDraft}
            onShowToast={onShowToast}
          />
        )}
      </div>
    </div>
  );
};

export default MembershipHub;