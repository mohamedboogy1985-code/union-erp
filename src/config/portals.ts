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
  Cpu,
  Settings,
  School,
  Globe,
  Network,
  Landmark,
  Scale,
  FolderOpen,
  Award,
  BadgePercent,
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
  /** شعار خاص بالبوابة يُعرض في صفحة الهبوط والشريط الجانبي والترويسة — مسار عام يخدّمه الخادم من assets/ */
  logo: string;
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
  // الوحدات الفرعية للمحور المالي القديم — مسجلة للشريط الجانبي والتنقل المساعد وتُفتح داخل المحور.
  { id: 'statute', label: 'لائحة النظام الأساسي', icon: ScrollText, group: 'الرئيسية والرقابة', portals: ['syndicate'] },
  { id: 'regulations-library', label: 'مكتبة اللوائح والمرفقات', icon: FileText, group: 'الرئيسية والرقابة', portals: ['syndicate'] },
  { id: 'regulation-assistant', label: 'مساعد اللوائح', icon: Bot, group: 'الرئيسية والرقابة', portals: ['syndicate'] },
  // النظام الأساسي والمالية والمحاسبة — المحور النظامي الموحد.
  { id: 'statutory', label: 'النظام الأساسي والوحدات', icon: Scale, group: 'النظام الأساسي والوحدات', portals: ALL },
  { id: 'financial-core', label: 'اللائحة المالية الموحدة', icon: ScrollText, group: 'النظام الأساسي والوحدات', portals: ALL },
  { id: 'accounting-core', label: 'النواة المحاسبية', icon: BookOpen, group: 'النظام الأساسي والوحدات', portals: ALL },
  { id: 'statutory-check', label: 'الفحص والحكامة', icon: ShieldCheck, group: 'النظام الأساسي والوحدات', portals: ALL },
  // المحاسبة والمالية (النقابة العامة)
  { id: 'journals', label: 'القيود والحسابات', icon: BookOpen, group: 'المحاسبة والمالية', portals: ['syndicate'] },
  { id: 'reports', label: 'التقارير المحاسبية', icon: FileText, group: 'المحاسبة والمالية', portals: ['syndicate'] },
  { id: 'balance-sheet', label: 'الميزانية العمومية والحسابات الختامية', icon: Scale, group: 'المحاسبة والمالية', portals: ['syndicate'] },
  { id: 'subledgers', label: 'الأستاذ المساعد (المدينون)', icon: Users, group: 'المحاسبة والمالية', portals: ['syndicate'] },
  { id: 'accounts', label: 'دليل الحسابات', icon: Building, group: 'المحاسبة والمالية', portals: ['syndicate'] },
  { id: 'banking', label: 'البنوك والتسويات', icon: Building2, group: 'المحاسبة والمالية', portals: ['syndicate'] },
  { id: 'procurement', label: 'المشتريات والموردين', icon: ShoppingCart, group: 'المحاسبة والمالية', portals: ['syndicate'] },
  // العضوية والتحصيل (النقابة العامة)
  { id: 'members', label: 'الأعضاء والشهادات', icon: UserCheck, group: 'العضوية والتحصيل', portals: ['syndicate'] },
  { id: 'receipts', label: 'التحصيل وتوزيع الإيرادات', icon: ReceiptText, group: 'العضوية والتحصيل', portals: ['syndicate'] },
  // الموارد البشرية والعاملين (مركز التدريب — مع الحفاظ على فصل البوابات)
  { id: 'employees', label: 'شئون العاملين والتأمينات', icon: UsersRound, group: 'الموارد البشرية', portals: ['training'] },
  { id: 'payroll', label: 'المرتبات (مسير الرواتب)', icon: Banknote, group: 'الموارد البشرية', portals: ['training'] },
  { id: 'attendance', label: 'الحضور والانصراف (البصمة)', icon: Fingerprint, group: 'الموارد البشرية', portals: ['training'] },
  { id: 'biometric', label: 'البصمة البيومترية وربطها بالمرتبات', icon: Fingerprint, group: 'الموارد البشرية', portals: ['training'] },
  { id: 'advances', label: 'سلف العاملين', icon: Wallet, group: 'الموارد البشرية', portals: ['training'] },
  // الضرائب وكسب العمل — تبويب داخل وحدة الموارد البشرية في بوابة التدريب.
  { id: 'taxes', label: 'الضرائب وكسب العمل', icon: BadgePercent, group: 'الموارد البشرية', portals: ['training'] },
  // تبويب الصندوق الاكتواري داخل محور HR؛ بياناته تبقى منفصلة في مؤسسة النقابة العامة.
  { id: 'actuarial', label: 'الصندوق الاكتواري — سياق النقابة العامة', icon: Calculator, group: 'الموارد البشرية', portals: ['training'] },
  // التمويل والأصول (النقابة العامة)
  { id: 'budgets', label: 'الموازنة التقديرية', icon: PieChart, group: 'التمويل والأصول', portals: ['syndicate'] },
  { id: 'assets', label: 'الأصول الثابتة والإهلاك', icon: Boxes, group: 'التمويل والأصول', portals: ['syndicate'] },
  // اللجان (بوابة اللجان)
  { id: 'committees', label: 'اللجان النقابية', icon: Network, group: 'اللجان', portals: ['committees'] },
  // مدخل موحد للبيانات ومكتبة النماذج؛ تبقى المكتبة نفسها خاصة ببوابة النقابة العامة.
  { id: 'models', label: 'بيانات اللجان والمكاتب والنماذج', icon: FolderOpen, group: 'بيانات اللجان والنماذج', portals: ['syndicate', 'committees'] },
  // بيانات البوابات والملفات المستوردة
  { id: 'insured-list', label: 'المؤمَّن عليهم — بيانات النقابة العامة', icon: ShieldCheck, group: 'الموارد البشرية', portals: ['training'] },
  { id: 'journal-2024', label: 'قيود يومية 2024', icon: BookOpen, group: 'بيانات البوابات والملفات المستوردة', portals: ['syndicate'] },
  { id: 'training-accounting-2024', label: 'برنامج المحاسبة 2024 (مركز التدريب)', icon: Calculator, group: 'بيانات البوابات والملفات المستوردة', portals: ['training'] },
  { id: 'final-accounts-2024', label: 'الميزانية العمومية والحسابات الختامية 2024 (مركز التدريب)', icon: Scale, group: 'بيانات البوابات والملفات المستوردة', portals: ['training'] },
  // نظام المهارات الموحد — متاح في كل البوابات (استُعيد من PR #24/#26)
  { id: 'skills', label: 'نظام المهارات الموحد', icon: Award, group: 'الذكاء الاصطناعي والإعدادات', portals: ALL },
  // سرب الوكيل هو شاشة الوكلاء الوحيدة في القائمة.
  { id: 'aetherswarm', label: 'سرب الوكيل AetherSwarm', icon: Cpu, group: 'الذكاء الاصطناعي والإعدادات', portals: ALL },
  { id: 'jules', label: 'Jules — وكيل البرمجة', icon: FileCode2, group: 'الذكاء الاصطناعي والإعدادات', portals: ALL },
  { id: 'settings', label: 'الإعدادات والصلاحيات', icon: Settings, group: 'الذكاء الاصطناعي والإعدادات', portals: ALL },
];

/** البوابات الثلاث ومعرّف المنظمة الافتراضية وشاشة البداية لكل بوابة */
export const GATEWAYS: GatewayMeta[] = [
  {
    id: 'syndicate',
    title: 'بوابة النقابة العامة',
    subtitle: 'كل شاشات إدارة النقابة العامة — المحاسبة والعضوية والرقابة؛ وتُفتح الموارد البشرية والضرائب من بوابة التدريب ببياناتها المنفصلة.',
    icon: Landmark,
    logo: '/assets/logos/union-logo.png',
    accent: { text: 'text-sky-400', bg: 'bg-sky-500/10', border: 'border-sky-500/40', dot: 'bg-sky-400', chip: 'bg-sky-500/15 text-sky-300' },
    organizationId: 'org-general',
    homeTab: 'dashboard',
  },
  {
    id: 'training',
    title: 'بوابة مركز تدريب النقابة العامة',
    subtitle: 'شئون العاملين والمرتبات والحضور والبصمة والسلف والضرائب وكسب العمل، إلى جانب شاشات التدريب.',
    icon: School,
    logo: '/assets/logos/training-logo.png',
    accent: { text: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/40', dot: 'bg-emerald-400', chip: 'bg-emerald-500/15 text-emerald-300' },
    organizationId: 'org-training-center',
    homeTab: 'employees',
  },
  {
    id: 'committees',
    title: 'بوابة اللجان',
    subtitle: 'كل شاشات إدارة اللجان النقابية للشركات والمهنية — وعرض اللجان وتفاصيلها.',
    icon: Globe,
    logo: '/assets/logos/mohasbak-ai-logo.png',
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
