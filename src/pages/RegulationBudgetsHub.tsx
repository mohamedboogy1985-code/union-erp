import React, { Suspense, lazy, useCallback, useState } from 'react';
import {
  BookOpenCheck,
  Bot,
  ExternalLink,
  Gavel,
  Landmark,
  Library,
  PieChart,
  Scale,
  ScrollText,
  ShieldCheck,
} from 'lucide-react';
import { FinancialRegulation } from './FinancialRegulation.js';
import { Budgets } from './Budgets.js';
import { RegulationLibrary } from './RegulationLibrary.js';
import { RegulationChat } from './RegulationChat.js';
import { RegulationAssistantDock } from '../components/RegulationAssistantDock.js';
import { ModuleTabs, ModuleTabDef } from '../components/ModuleTabs.js';
import { User } from '../types/erp.js';
import type { PortalId } from '../config/portals.js';
import type { StatutoryTabId } from './StatutoryHub.js';
import type { AuditSettingsTabId } from './AuditSettingsHub.js';

const StatutoryHub = lazy(() =>
  import('./StatutoryHub.js').then((module) => ({ default: module.StatutoryHub })),
);
const AuditSettingsHub = lazy(() =>
  import('./AuditSettingsHub.js').then((module) => ({ default: module.AuditSettingsHub })),
);

export type RegulationBudgetsTabId =
  | 'regulation-budgets'
  | 'regulation'
  | 'regulations-library'
  | 'regulation-assistant'
  | 'budgets'
  | 'statutory'
  | 'statute'
  | 'financial-core'
  | 'accounting-core'
  | 'statutory-check'
  | 'statutory-distribution'
  | 'distribution'
  | 'audit-settings'
  | 'audit'
  | 'settings';

type GovernanceSectionId = 'financial' | 'statutory' | 'audit';
type FinancialSectionTabId = 'regulation' | 'regulations-library' | 'regulation-assistant' | 'budgets';

interface RegulationBudgetsHubProps {
  organizationId: string;
  currentUser: User | null;
  onShowToast: (
    type: 'success' | 'error' | 'warning' | 'info',
    msg: string,
  ) => void;
  /** يحدد القسم الفرعي عند فتح رابط قديم أو الانتقال من المساعد. */
  initialTab?: RegulationBudgetsTabId;
  /** يسمح بإبقاء الوحدات النظامية المشتركة وحدها ظاهرة في بوابتي التدريب واللجان. */
  selectedGateway?: PortalId;
}

const GOVERNANCE_TABS: ModuleTabDef<GovernanceSectionId>[] = [
  { id: 'financial', label: 'اللوائح والموازنات', icon: ScrollText },
  { id: 'statutory', label: 'النظام الأساسي والوحدات', icon: BookOpenCheck },
  { id: 'audit', label: 'سجل الرقابة والإعدادات', icon: ShieldCheck },
];

const FINANCIAL_TABS: ModuleTabDef<FinancialSectionTabId>[] = [
  { id: 'regulation', label: 'اللائحة المالية والرقابة', icon: ScrollText },
  { id: 'regulations-library', label: 'مكتبة اللوائح والمرفقات', icon: Library, badge: '3 مصادر' },
  { id: 'regulation-assistant', label: 'مساعد اللوائح', icon: Bot },
  { id: 'budgets', label: 'الموازنة التقديرية', icon: PieChart },
];

const sectionForTab = (tab: RegulationBudgetsTabId): GovernanceSectionId => {
  if (['statutory', 'statute', 'financial-core', 'accounting-core', 'statutory-check', 'statutory-distribution', 'distribution'].includes(tab)) {
    return 'statutory';
  }
  if (['audit-settings', 'audit', 'settings'].includes(tab)) return 'audit';
  return 'financial';
};

const financialTabFor = (tab: RegulationBudgetsTabId): FinancialSectionTabId => {
  if (tab === 'regulations-library' || tab === 'regulation-assistant' || tab === 'budgets') return tab;
  return 'regulation';
};

const statutoryTabFor = (tab: RegulationBudgetsTabId): StatutoryTabId => {
  if (tab === 'financial-core') return 'financial';
  if (tab === 'accounting-core') return 'accounting';
  if (tab === 'statutory-check') return 'check';
  if (tab === 'statutory-distribution' || tab === 'distribution') return 'distribution';
  return 'statute';
};

const auditTabFor = (tab: RegulationBudgetsTabId): AuditSettingsTabId =>
  tab === 'settings' ? 'settings' : 'audit';

export const RegulationBudgetsHub: React.FC<RegulationBudgetsHubProps> = ({
  organizationId,
  currentUser,
  onShowToast,
  initialTab = 'regulation-budgets',
  selectedGateway = 'syndicate',
}) => {
  const [activeSection, setActiveSection] = useState<GovernanceSectionId>(() => sectionForTab(initialTab));
  const [activeFinancialTab, setActiveFinancialTab] = useState<FinancialSectionTabId>(() => financialTabFor(initialTab));
  const [assistantSeed, setAssistantSeed] = useState<string | null>(null);
  const [assistantSeedNonce, setAssistantSeedNonce] = useState(0);
  const [libraryDocumentId, setLibraryDocumentId] = useState<string | null>(null);
  const initialStatutoryTab = statutoryTabFor(initialTab);
  const initialAuditTab = auditTabFor(initialTab);

  const availableGovernanceTabs = selectedGateway === 'syndicate'
    ? GOVERNANCE_TABS
    : GOVERNANCE_TABS.filter((tab) => tab.id === 'statutory');
  const visibleSection = availableGovernanceTabs.some((tab) => tab.id === activeSection)
    ? activeSection
    : 'statutory';

  const openAssistantWith = useCallback((question: string) => {
    setAssistantSeed(question);
    setAssistantSeedNonce((nonce) => nonce + 1);
    setActiveSection('financial');
    setActiveFinancialTab('regulation-assistant');
  }, []);

  const openLibraryDocument = useCallback((documentId: string) => {
    setLibraryDocumentId(documentId);
    setActiveSection('financial');
    setActiveFinancialTab('regulations-library');
  }, []);

  return (
    <div
      className="space-y-4"
      data-assistant-screen={
        visibleSection === 'financial'
          ? activeFinancialTab
          : visibleSection === 'statutory'
            ? `statutory-${initialStatutoryTab}`
            : `audit-${initialAuditTab}`
      }
    >
      <ModuleTabs
        title="الرقابة المالية واللوائح المنظمة والموازنات"
        tabs={availableGovernanceTabs}
        activeId={visibleSection}
        onChange={setActiveSection}
        icon={Landmark}
      />

      {visibleSection === 'financial' && (
        <section className="space-y-4" aria-label="اللوائح والموازنات">
          {/* شريط الإشعار بالمرجعية التشريعية: قانون العمل رقم 14 لسنة 2025 */}
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 rounded-xl bg-slate-900 border border-emerald-500/30 text-xs shadow-sm">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 font-bold text-[10.5px] border border-emerald-500/40">
                مرجع تشريعي 2025
              </span>
              <span className="text-slate-200">
                قانون رقم 14 لسنة 2025 بإصدار قانون العمل (الجريدة الرسمية 3 مايو 2025 — يلغي ق 12 لسنة 2003)
              </span>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  setActiveSection('financial');
                  setActiveFinancialTab('regulations-library');
                }}
                className="text-[11px] text-teal-400 hover:text-teal-300 underline font-semibold"
              >
                استعراض في مكتبة اللوائح
              </button>
              <span className="text-slate-700">|</span>
              <a
                href="https://www.labour.gov.eg/media/0iedik3q/%D8%A7%D9%84%D9%82%D8%A7%D9%86%D9%88%D9%86-%D8%B1%D9%82%D9%85-14-%D9%84%D8%B3%D9%86%D8%A9-2025-%D8%A8%D8%A5%D8%B5%D8%AF%D8%A7%D8%B1-%D9%82%D8%A7%D9%86%D9%88%D9%86-%D8%A7%D9%84%D8%B9%D9%85%D9%84.pdf"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[11px] text-emerald-400 hover:text-emerald-300 font-bold"
                title="فتح ملف PDF الأصلي من بوابة وزارة العمل المصرية"
              >
                <span>فتح PDF وزارة العمل</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>

          <ModuleTabs
            title="اللوائح والموازنات"
            tabs={FINANCIAL_TABS}
            activeId={activeFinancialTab}
            onChange={setActiveFinancialTab}
            icon={ScrollText}
            titleVisible={false}
            sticky={false}
          />
          {activeFinancialTab === 'regulation' && (
            <FinancialRegulation
              organizationId={organizationId}
              currentUser={currentUser}
              onShowToast={onShowToast}
            />
          )}
          {activeFinancialTab === 'regulations-library' && (
            <RegulationLibrary
              organizationId={organizationId}
              currentUser={currentUser}
              onShowToast={onShowToast}
              onAskAssistant={openAssistantWith}
              initialDocumentId={libraryDocumentId}
            />
          )}
          {activeFinancialTab === 'regulation-assistant' && (
            <RegulationChat
              organizationId={organizationId}
              currentUser={currentUser}
              onShowToast={onShowToast}
              seedQuestion={assistantSeed}
              seedNonce={assistantSeedNonce}
              onOpenDocument={openLibraryDocument}
            />
          )}
          {activeFinancialTab === 'budgets' && (
            <Budgets
              organizationId={organizationId}
              currentUser={currentUser}
              onShowToast={onShowToast}
            />
          )}
          {(activeFinancialTab === 'regulations-library' ||
            activeFinancialTab === 'regulation-assistant' ||
            activeFinancialTab === 'regulation') && (
            <RegulationAssistantDock
              organizationId={organizationId}
              currentUser={currentUser}
              onShowToast={onShowToast}
              currentScreen={activeFinancialTab}
            />
          )}
        </section>
      )}

      {visibleSection === 'statutory' && (
        <Suspense fallback={<div className="p-8 text-center text-slate-400">جارٍ تحميل النظام الأساسي والوحدات...</div>}>
          <StatutoryHub
            organizationId={organizationId}
            currentUser={currentUser}
            onShowToast={onShowToast}
            initialTab={initialStatutoryTab}
            embedded
          />
        </Suspense>
      )}

      {visibleSection === 'audit' && (
        <Suspense fallback={<div className="p-8 text-center text-slate-400">جارٍ تحميل سجل الرقابة والإعدادات...</div>}>
          <AuditSettingsHub
            organizationId={organizationId}
            currentUser={currentUser}
            onShowToast={onShowToast}
            initialTab={initialAuditTab}
            embedded
          />
        </Suspense>
      )}
    </div>
  );
};

export default RegulationBudgetsHub;
