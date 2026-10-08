import React, { lazy, Suspense, useState } from 'react';
import {
  BadgePercent,
  UsersRound,
  Banknote,
  Fingerprint,
  Wallet,
  Users,
  Calculator,
  Building2,
  ShieldAlert,
} from 'lucide-react';
import { EmployeeAffairs } from './EmployeeAffairs.js';
import { Payroll } from './Payroll.js';
import { Attendance } from './Attendance.js';
import { EmployeeAdvances } from './EmployeeAdvances.js';
import { ModuleTabs, ModuleTabDef } from '../components/ModuleTabs.js';
import { BiometricAttendance } from './BiometricAttendance.js';
import { User } from '../types/erp.js';
import { hasPerm } from '../utils/permissions.js';
import type { TaxesTabId } from './TaxesHub.js';

const ACTUARIAL_ORGANIZATION_ID = 'org-general';
const InsuredActuarialHub = lazy(() =>
  import('./InsuredActuarialHub.js').then((module) => ({ default: module.InsuredActuarialHub })),
);

const TaxesHub = lazy(() =>
  import('./TaxesHub.js').then((module) => ({ default: module.TaxesHub })),
);

export type HrsTabId =
  | 'employees'
  | 'payroll'
  | 'attendance'
  | 'advances'
  | 'biometric'
  | 'taxes'
  | 'actuarial';

interface HrsHubProps {
  organizationId: string;
  currentUser: User | null;
  onShowToast: (
    type: 'success' | 'error' | 'warning' | 'info',
    msg: string,
  ) => void;
  /** الوحدة الفرعية المفتوحة عند الوصول */
  initialTab?: HrsTabId;
  /** التبويب الضريبي المفتوح عند الوصول عبر رابط قديم أو المساعد */
  initialTaxesTab?: TaxesTabId;
}

const SUB_TABS: ModuleTabDef<HrsTabId>[] = [
  {
    id: 'employees',
    label: 'شئون العاملين والتأمينات',
    icon: UsersRound,
    badge: 'استمارة 2',
  },
  {
    id: 'payroll',
    label: 'المرتبات (مسير الرواتب)',
    icon: Banknote,
    badge: 'شهري',
  },
  {
    id: 'attendance',
    label: 'الحضور والانصراف (البصمة)',
    icon: Fingerprint,
    badge: 'وجه/إصبع',
  },
  { id: 'advances', label: 'سلف العاملين', icon: Wallet },
  {
    id: 'biometric',
    label: 'بصمة اليد والوجه وربطها بالمرتبات',
    icon: Fingerprint,
    badge: 'اعتماد محمد عبد الله',
  },
  {
    id: 'taxes',
    label: 'الضرائب وكسب العمل',
    icon: BadgePercent,
    badge: '4 وحدات',
  },
  {
    id: 'actuarial',
    label: 'الصندوق الاكتواري — النقابة العامة',
    icon: Calculator,
    badge: 'سياق منفصل',
  },
];

export const HrsHub: React.FC<HrsHubProps> = ({
  organizationId,
  currentUser,
  onShowToast,
  initialTab = 'employees',
  initialTaxesTab,
}) => {
  const [activeTab, setActiveTab] = useState<HrsTabId>(initialTab);
  const canAccessGeneralOrganization = Boolean(
    currentUser?.organizationId === ACTUARIAL_ORGANIZATION_ID ||
    (Array.isArray(currentUser?.allowedOrgIds) && currentUser.allowedOrgIds.includes(ACTUARIAL_ORGANIZATION_ID)) ||
    hasPerm(currentUser, 'system:admin'),
  );
  const canReadActuarial = Boolean(
    currentUser?.isActive &&
    canAccessGeneralOrganization &&
    (hasPerm(currentUser, 'view:all') || hasPerm(currentUser, 'hr:manage')),
  );

  return (
    <div className="space-y-4" data-assistant-screen={activeTab}>
      <ModuleTabs
        title="الموارد البشرية وشئون العاملين والضرائب — بوابة التدريب"
        tabs={SUB_TABS.filter((tab) => tab.id !== 'actuarial' || canReadActuarial)}
        activeId={activeTab}
        onChange={setActiveTab}
        icon={Users}
      />

      <div className="flex items-center gap-2 rounded-xl border border-emerald-500/25 bg-emerald-500/5 px-3 py-2 text-[11px] text-emerald-100" data-hr-organization={organizationId}>
        <Building2 className="h-4 w-4 shrink-0 text-emerald-400" />
        <span>سياق الموارد البشرية: مركز التدريب ({organizationId}). بيانات العاملين والمرتبات هنا لا تمثل بيانات النقابة العامة.</span>
      </div>

      <div>
        {activeTab === 'employees' && (
          <EmployeeAffairs
            organizationId={organizationId}
            currentUser={currentUser}
            onShowToast={onShowToast}
          />
        )}
        {activeTab === 'payroll' && (
          <Payroll
            organizationId={organizationId}
            currentUser={currentUser}
            onShowToast={onShowToast}
          />
        )}
        {activeTab === 'attendance' && (
          <Attendance
            organizationId={organizationId}
            currentUser={currentUser}
            onShowToast={onShowToast}
          />
        )}
        {activeTab === 'advances' && (
          <EmployeeAdvances
            organizationId={organizationId}
            currentUser={currentUser}
            onShowToast={onShowToast}
          />
        )}
        {activeTab === 'biometric' && (
          <BiometricAttendance
            organizationId={organizationId}
            currentUser={currentUser}
            onShowToast={onShowToast}
          />
        )}
        {activeTab === 'taxes' && (
          <Suspense
            fallback={(
              <div className="flex items-center justify-center p-12 text-neutral-500">
                جارٍ تحميل الضرائب وكسب العمل...
              </div>
            )}
          >
            <TaxesHub
              organizationId={organizationId}
              currentUser={currentUser}
              onShowToast={onShowToast}
              initialTab={initialTaxesTab}
            />
          </Suspense>
        )}
        {activeTab === 'actuarial' && (canReadActuarial ? (
          <section className="space-y-3" aria-label="الصندوق الاكتواري — سياق النقابة العامة">
            <div className="flex items-start gap-2 rounded-xl border border-violet-500/30 bg-violet-500/5 px-3 py-3 text-[11px] text-violet-100">
              <Calculator className="mt-0.5 h-4 w-4 shrink-0 text-violet-300" />
              <div>
                <strong className="block text-violet-200">تبديل سياق صريح: بيانات النقابة العامة ({ACTUARIAL_ORGANIZATION_ID})</strong>
                <span className="text-violet-100/80">هذا التبويب وحده يعرض بيانات الصندوق الاكتواري والمؤمَّن عليهم التابعة للنقابة العامة؛ لا يقرأ سجلات HR أو رواتب مركز التدريب، ولا يُسند سجلات org-union-main تلقائياً إلى org-general.</span>
              </div>
            </div>
            <Suspense fallback={<div className="p-8 text-center text-slate-400">جارٍ تحميل الصندوق الاكتواري...</div>}>
              <InsuredActuarialHub
                organizationId={ACTUARIAL_ORGANIZATION_ID}
                currentUser={currentUser}
                onShowToast={onShowToast}
                embedded
              />
            </Suspense>
          </section>
        ) : (
          <div role="alert" className="flex items-center gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm text-amber-100">
            <ShieldAlert className="h-5 w-5 shrink-0 text-amber-300" />
            <span>الصندوق الاكتواري تابع لبيانات النقابة العامة ويحتاج صلاحية الاطلاع والوصول للمؤسسة؛ لم تُعرض أي بيانات.</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default HrsHub;
