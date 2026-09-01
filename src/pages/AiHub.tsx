import React, { useState } from 'react';
import { Bot, Radio, Headset, Calculator } from 'lucide-react';
import { AIAssistant } from './AIAssistant.js';
import { LiveAgent } from './LiveAgent.js';
import { AccountingChat } from './AccountingChat.js';
import { ModuleTabs, ModuleTabDef } from '../components/ModuleTabs.js';
import { User } from '../types/erp.js';

export type AiTabId = 'ai' | 'accountant' | 'liveagent';

interface AiHubProps {
  organizationId: string;
  currentUser: User | null;
  onShowToast: (type: 'success' | 'error' | 'warning' | 'info', msg: string) => void;
  /** التنقل العام للصفحات (يستخدمه المساعد الحي للانتقال بأمر صوتي) */
  onNavigate: (tabId: string) => void;
  /** تجهيز مسودة إيصال بأمر صوتي في شاشة التحصيل */
  onVoiceReceiptDraft: (draft: { payerName: string; amount: number; reason?: string }) => void;
  /** التنقل إلى شاشة القيود (يستخدمه استوديو الذكاء) */
  onNavigateToJournals?: () => void;
  /** الوحدة الفرعية المفتوحة عند الوصول */
  initialTab?: AiTabId;
}

const SUB_TABS: ModuleTabDef<AiTabId>[] = [
  { id: 'ai', label: 'استوديو الذكاء الاصطناعي (Gemini)', icon: Bot, badge: 'OCR/Forensics' },
  { id: 'accountant', label: 'الخبير المحاسبي', icon: Calculator, badge: 'Expert' },
  { id: 'liveagent', label: 'المساعد الحي صوت وصورة', icon: Radio, badge: 'Live/Gemini' },
];

export const AiHub: React.FC<AiHubProps> = ({
  organizationId,
  currentUser,
  onShowToast,
  onNavigate,
  onVoiceReceiptDraft,
  onNavigateToJournals,
  initialTab = 'ai',
}) => {
  const [activeTab, setActiveTab] = useState<AiTabId>(initialTab);

  return (
    <div className="space-y-4">
      <ModuleTabs
        title="الذكاء الاصطناعي والمساعد الحي — وحدة موحدة"
        tabs={SUB_TABS}
        activeId={activeTab}
        onChange={setActiveTab}
        icon={Headset}
      />

      <div>
        {activeTab === 'ai' && (
          <AIAssistant
            organizationId={organizationId}
            currentUser={currentUser}
            onNavigateToJournals={onNavigateToJournals}
            onShowToast={onShowToast}
          />
        )}
        {activeTab === 'accountant' && (
          <AccountingChat
            organizationId={organizationId}
            currentUser={currentUser}
            onShowToast={onShowToast}
          />
        )}
        {activeTab === 'liveagent' && (
          <LiveAgent
            organizationId={organizationId}
            currentUser={currentUser}
            onNavigate={onNavigate}
            onVoiceReceiptDraft={onVoiceReceiptDraft}
            onShowToast={onShowToast}
          />
        )}
      </div>
    </div>
  );
};

export default AiHub;