import React, { useCallback, useState } from 'react';
import {
  ScrollText,
  PieChart,
  Landmark,
  Gavel,
  Library,
  Bot,
} from 'lucide-react';
import { FinancialRegulation } from './FinancialRegulation.js';
import { Budgets } from './Budgets.js';
import { RegulationLibrary } from './RegulationLibrary.js';
import { RegulationChat } from './RegulationChat.js';
import { RegulationAssistantDock } from '../components/RegulationAssistantDock.js';
import { ModuleTabs, ModuleTabDef } from '../components/ModuleTabs.js';
import { User } from '../types/erp.js';
import { StatuteBoard } from '../features/statutory/StatuteBoard.js';

export type RegulationBudgetsTabId =
  | 'regulation'
  | 'statute'
  | 'regulations-library'
  | 'regulation-assistant'
  | 'budgets';

interface RegulationBudgetsHubProps {
  organizationId: string;
  currentUser: User | null;
  onShowToast: (
    type: 'success' | 'error' | 'warning' | 'info',
    msg: string,
  ) => void;
  /** الوحدة الفرعية المفتوحة عند الوصول */
  initialTab?: RegulationBudgetsTabId;
}

const SUB_TABS: ModuleTabDef<RegulationBudgetsTabId>[] = [
  { id: 'regulation', label: 'اللائحة المالية والرقابة', icon: ScrollText },
  {
    id: 'statute',
    label: 'لائحة النظام الأساسي',
    icon: Gavel,
    badge: '69 مادة',
  },
  {
    id: 'regulations-library',
    label: 'شاشة اللوائح والمرفقات',
    icon: Library,
    badge: '3 مصادر',
  },
  { id: 'regulation-assistant', label: 'مساعد اللوائح (شات بوت)', icon: Bot },
  { id: 'budgets', label: 'الموازنة التقديرية', icon: PieChart },
];

export const RegulationBudgetsHub: React.FC<RegulationBudgetsHubProps> = ({
  organizationId,
  currentUser,
  onShowToast,
  initialTab = 'regulation',
}) => {
  const [activeTab, setActiveTab] =
    useState<RegulationBudgetsTabId>(initialTab);
  /** سؤال ينتقل من شاشة اللوائح إلى المساعد */
  const [assistantSeed, setAssistantSeed] = useState<string | null>(null);
  const [assistantSeedNonce, setAssistantSeedNonce] = useState(0);
  /** بند ينتقل من المساعد إلى شاشة اللوائح */
  const [libraryDocumentId, setLibraryDocumentId] = useState<string | null>(
    null,
  );

  const openAssistantWith = useCallback((question: string) => {
    setAssistantSeed(question);
    setAssistantSeedNonce((n) => n + 1);
    setActiveTab('regulation-assistant');
  }, []);

  const openLibraryDocument = useCallback((documentId: string) => {
    setLibraryDocumentId(documentId);
    setActiveTab('regulations-library');
  }, []);

  return (
    <div className="space-y-4" data-assistant-screen={activeTab}>
      <ModuleTabs
        title="الرقابة المالية والمواز  ات — اللوائح والموازنات ومساعد اللوائح"
        tabs={SUB_TABS}
        activeId={activeTab}
        onChange={setActiveTab}
        icon={Landmark}
      />

      <div>
        {activeTab === 'regulation' && (
          <FinancialRegulation
            organizationId={organizationId}
            currentUser={currentUser}
            onShowToast={onShowToast}
          />
        )}
        {activeTab === 'statute' && (
          <StatuteBoard
            organizationId={organizationId}
            currentUser={currentUser}
            onShowToast={onShowToast}
          />
        )}
        {activeTab === 'regulations-library' && (
          <RegulationLibrary
            organizationId={organizationId}
            currentUser={currentUser}
            onShowToast={onShowToast}
            onAskAssistant={openAssistantWith}
            initialDocumentId={libraryDocumentId}
          />
        )}
        {activeTab === 'regulation-assistant' && (
          <RegulationChat
            organizationId={organizationId}
            currentUser={currentUser}
            onShowToast={onShowToast}
            seedQuestion={assistantSeed}
            seedNonce={assistantSeedNonce}
            onOpenDocument={openLibraryDocument}
          />
        )}
        {activeTab === 'budgets' && (
          <Budgets
            organizationId={organizationId}
            currentUser={currentUser}
            onShowToast={onShowToast}
          />
        )}
      </div>

      {/* مساعد اللوائح — يبقى داخل شاشة اللوائح والرقابة المالية فقط */}
      {(activeTab === 'regulations-library' ||
        activeTab === 'regulation-assistant' ||
        activeTab === 'regulation') && (
        <RegulationAssistantDock
          organizationId={organizationId}
          currentUser={currentUser}
          onShowToast={onShowToast}
          currentScreen={activeTab}
        />
      )}
    </div>
  );
};

export default RegulationBudgetsHub;
