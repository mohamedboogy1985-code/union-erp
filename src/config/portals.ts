import React from 'react';
import {
  LayoutDashboard,
  ShieldCheck,
  ScrollText,
  BookOpen,
  FileText,
  Users,
  Building,
  Building2,
  ShoppingCart,
  UserCheck,
  ReceiptText,
  UsersRound,
  Banknote,
  Fingerprint,
  Wallet,
  Calculator,
  PieChart,
  Boxes,
  FileCode2,
  Bot,
  Settings,
  School,
  Globe,
  Network,
  Landmark,
  FileSpreadsheet,
} from 'lucide-react';

/**
 * ===== تعريف البوابات وشاشاتها (منفصلة عن بعضها) =====
 * كل بوابة لها:
 * - معرّف واسم
 * - المنظمة/الكيان الافتراضي (بياناتها)
 * - شاشاتها الخاصة فقط
 * - شاشة البداية عند فتح البوابة
 */
export type PortalId = 'syndicate' | 'training' | 'committees';

export interface ScreenDef {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  group: string;
  portals: PortalId[];
}

export interface GatewayMeta {
  id: PortalId;
  title: string;
  subtitle: string;
  icon: React.ComponentType<{ className?: string }>;
  accent: { text: string; bg: string; border: string; dot: string; chip: string };
  /** المنظمة/الكيان الافتراضي لهذه البوابة — يفصل بياناتها عن غيرها */
  organizationId: string;
  /** الشاشة التي تُفتح تلقائياً عند اختيار البوابة */
  homeTab: string;
}

export const ALL: PortalId[] = ['syndicate', 'training', 'committees'];

/** شاشات النظام الكاملة — كل شاشة تظهر فقط في بواباتها المحددة */
export const SCREENS: ScreenDef[] = [
  // الرئيسية والرقابة (النقابة العامة)
  { id: 'dashboard', label: 'الرئيسية والمؤشرات', icon: LayoutDashboard, group: 'الرئيسية والرقابة', portals: ['syndicate'] },
  { id: 'audit', label: 'سجل التدقيق والرقابة', icon: ShieldCheck, group: 'الرئيسية والرقابة', portals: ['syndicate'] },
  { id: 'regulation', label: 'اللائحة المالية والرقابة', icon: ScrollText, group: 'الرئيسية والرقابة', portals: ['syndicate'] },
  // المحاسبة والمالية (النقابة العامة)
  { id: 'journals', label: 'القيود والحسابات', icon: BookOpen, group: 'المحاسبة والمالية', portals: ['syndicate'] },
  { id: 'reports', label: 'التقارير المحاسبية', icon: FileText, group: 'المحاسبة والمالية', portals: ['syndicate'] },
  { id: 'subledgers', label: 'الأستاذ المساعد (المدينون)', icon: Users, group: 'المحاسبة والمالية', portals: ['syndicate'] },
  { id: 'accounts', label: 'دليل الحسابات', icon: Building, group: 'المحاسبة والمالية', portals: ['syndicate'] },
  { id: 'banking', label: 'البنوك والتسويات', icon: Building2, group: 'المحاسبة والمالية', portals: ['syndicate'] },
  { id: 'procurement', label: 'المشتريات والموردين', icon: ShoppingCart, group: 'المحاسبة والمالية', portals: ['syndicate'] },
  // العضوية والتحصيل (النقابة العامة)
  { id: 'members', label: 'الأعضاء والشهادات', icon: UserCheck, group: 'العضوية والتحصيل', portals: ['syndicate'] },
  { id: 'receipts', label: 'التحصيل وتوزيع الإيرادات', icon: ReceiptText, group: 'العضوية والتحصيل', portals: ['syndicate'] },
  // الموارد البشرية والعاملين (مركز التدريب)
  { id: 'employees', label: 'شئون العاملين والتأمينات', icon: UsersRound, group: 'الموارد البشرية', portals: ['training'] },
  { id: 'payroll', label: 'المرتبات (مسير الرواتب)', icon: Banknote, group: 'الموارد البشرية', portals: ['training'] },
  { id: 'attendance', label: 'الحضور والانصراف (البصمة)', icon: Fingerprint, group: 'الموارد البشرية', portals: ['training'] },
  { id: 'advances', label: 'سلف العاملين', icon: Wallet, group: 'الموارد البشرية', portals: ['training'] },
  // الصناديق الإكتوارية (النقابة العامة)
  { id: 'actuarial', label: 'الدراسات الإكتوارية والصناديق', icon: Calculator, group: 'الصناديق الإكتوارية', portals: ['syndicate'] },
  // التمويل والأصول (النقابة العامة)
  { id: 'budgets', label: 'الموازنة التقديرية', icon: PieChart, group: 'التمويل والأصول', portals: ['syndicate'] },
  { id: 'assets', label: 'الأصول الثابتة والإهلاك', icon: Boxes, group: 'التمويل والأصول', portals: ['syndicate'] },
  { id: 'einvoicing', label: 'الفاتورة الإلكترونية', icon: FileCode2, group: 'التمويل والأصول', portals: ['syndicate'] },
  // اللجان (بوابة اللجان)
  { id: 'committees', label: 'اللجان النقابية', icon: Network, group: 'اللجان', portals: ['committees'] },
  // بيانات البوابات والملفات المستوردة
  { id: 'committee-data', label: 'بيانات اللجان والمكاتب (بيانات.xlsx)', icon: FileSpreadsheet, group: 'بيانات البوابات والملفات المستوردة', portals: ['syndicate', 'committees'] },
  { id: 'insured-list', label: 'المؤمَّن عليهم — الصندوق الاكتواري', icon: ShieldCheck, group: 'بيانات البوابات والملفات المستوردة', portals: ['syndicate'] },
  { id: 'journal-2024', label: 'قيود يومية 2024', icon: BookOpen, group: 'بيانات البوابات والملفات المستوردة', portals: ['training'] },
  // الذكاء الاصطناعي والإعدادات (مشتركة)
  { id: 'aihub', label: 'الذكاء الاصطناعي والمساعد الحي', icon: Bot, group: 'الذكاء الاصطناعي والإعدادات', portals: ALL },
  { id: 'settings', label: 'الإعدادات والصلاحيات', icon: Settings, group: 'الذكاء الاصطناعي والإعدادات', portals: ALL },
];

/** البوابات الثلاث ومعرّف المنظمة الافتراضية وشاشة البداية لكل بوابة */
export const GATEWAYS: GatewayMeta[] = [
  {
    id: 'syndicate',
    title: 'بوابة النقابة العامة',
    subtitle: 'كل شاشات إدارة النقابة العامة للعاملين — المحاسبة، العضوية، الموارد البشرية، والرقابة.',
    icon: Landmark,
    accent: { text: 'text-sky-400', bg: 'bg-sky-500/10', border: 'border-sky-500/40', dot: 'bg-sky-400', chip: 'bg-sky-500/15 text-sky-300' },
    organizationId: 'org-general',
    homeTab: 'dashboard',
  },
  {
    id: 'training',
    title: 'بوابة مركز تدريب النقابة العامة',
    subtitle: 'كل شاشات إدارة مركز التدريب — شئون العاملين، المرتبات، الحضور، والسلف والتدريب.',
    icon: School,
    accent: { text: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/40', dot: 'bg-emerald-400', chip: 'bg-emerald-500/15 text-emerald-300' },
    organizationId: 'org-training-center',
    homeTab: 'employees',
  },
  {
    id: 'committees',
    title: 'بوابة اللجان',
    subtitle: 'كل شاشات إدارة اللجان النقابية للشركات والمهنية — وعرض اللجان وتفاصيلها.',
    icon: Globe,
    accent: { text: 'text-indigo-400', bg: 'bg-indigo-500/10', border: 'border-indigo-500/40', dot: 'bg-indigo-400', chip: 'bg-indigo-500/15 text-indigo-300' },
    organizationId: 'org-committees',
    homeTab: 'committees',
  },
];

/** شاشات بوابة معينة */
export function screensForPortal(portalId: PortalId): ScreenDef[] {
  return SCREENS.filter((s) => s.portals.includes(portalId));
}

/** مجموعات شاشات بوابة معينة */
export function groupsForPortal(portalId: PortalId): string[] {
  return [...new Set(screensForPortal(portalId).map((s) => s.group))];
}

export function getGatewayMeta(portalId: PortalId | null | undefined): GatewayMeta | undefined {
  return GATEWAYS.find((g) => g.id === portalId);
}
