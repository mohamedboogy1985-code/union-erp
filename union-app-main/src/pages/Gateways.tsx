import React, { useState } from 'react';
import {
  LayoutDashboard,
  ShieldCheck,
  ScrollText,
  Layers,
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
  ArrowRight,
  Landmark,
  FileSpreadsheet,
} from 'lucide-react';

export type GatewayId = 'syndicate' | 'training' | 'committees';

interface GatewayProps {
  onNavigate: (tabId: string) => void;
  onShowToast: (type: 'success' | 'error' | 'warning' | 'info', msg: string) => void;
}

/** كل شاشات النظام بمجموعاتها، كل شاشة تُظهر فقط في بواباتها المحدّدة (portals) */
interface ScreenDef {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  group: string;
  portals: GatewayId[];
}

const ALL: GatewayId[] = ['syndicate', 'training', 'committees'];

const SCREENS: ScreenDef[] = [
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

interface GatewayMeta {
  id: GatewayId;
  title: string;
  subtitle: string;
  icon: React.ComponentType<{ className?: string }>;
  accent: { text: string; bg: string; border: string; dot: string; chip: string };
}

const GATEWAYS: GatewayMeta[] = [
  {
    id: 'syndicate',
    title: 'بوابة النقابة العامة',
    subtitle: 'كل شاشات إدارة النقابة العامة للعاملين — المحاسبة، العضوية، الموارد البشرية، والرقابة.',
    icon: Landmark,
    accent: { text: 'text-sky-400', bg: 'bg-sky-500/10', border: 'border-sky-500/40', dot: 'bg-sky-400', chip: 'bg-sky-500/15 text-sky-300' },
  },
  {
    id: 'training',
    title: 'بوابة مركز تدريب النقابة العامة',
    subtitle: 'كل شاشات إدارة مركز التدريب — شئون العاملين، المرتبات، الحضور، والسلف والتدريب.',
    icon: School,
    accent: { text: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/40', dot: 'bg-emerald-400', chip: 'bg-emerald-500/15 text-emerald-300' },
  },
  {
    id: 'committees',
    title: 'بوابة اللجان',
    subtitle: 'كل شاشات إدارة اللجان النقابية للشركات والمهنية — وعرض اللجان وتفاصيلها.',
    icon: Globe,
    accent: { text: 'text-indigo-400', bg: 'bg-indigo-500/10', border: 'border-indigo-500/40', dot: 'bg-indigo-400', chip: 'bg-indigo-500/15 text-indigo-300' },
  },
];

export const Gateways: React.FC<GatewayProps> = ({ onNavigate, onShowToast }) => {
  const [active, setActive] = useState<GatewayId | null>(null);
  const gateway = GATEWAYS.find((g) => g.id === active);

  // شاشة الهبوط (اختيار البوابة)
  if (!gateway) {
    return (
      <div className="p-6 max-w-6xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-2xl bg-sky-500/15 flex items-center justify-center">
            <Landmark className="h-6 w-6 text-sky-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">بوابات النظام</h1>
            <p className="text-sm text-slate-400">اختر البوابة المناسبة — كل بوابة تتضمن جميع شاشات النظام</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mt-4">
          {GATEWAYS.map((g) => {
            const Icon = g.icon;
            return (
              <button
                key={g.id}
                onClick={() => setActive(g.id)}
                className={`text-right rounded-2xl bg-slate-900 border ${g.accent.border} hover:-translate-y-1 transition-all p-6 flex flex-col gap-4 group shadow-lg`}
              >
                <div className={`w-14 h-14 rounded-2xl ${g.accent.bg} flex items-center justify-center`}>
                  <Icon className={`w-7 h-7 ${g.accent.text}`} />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-white flex items-center gap-2">
                    {g.title}
                    <ArrowRight className={`w-4 h-4 ${g.accent.text} group-hover:translate-x-1 transition-transform`} />
                  </h2>
                  <p className="text-sm text-slate-400 mt-1.5 leading-relaxed">{g.subtitle}</p>
                </div>
                <div className="flex items-center gap-2 mt-auto">
                  <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold ${g.accent.chip}`}>
                    <span className={`w-2 h-2 rounded-full ${g.accent.dot}`} />
                    {SCREENS.filter((s) => s.portals.includes(g.id)).length} شاشة
                  </span>
                  <span className="text-[11px] text-slate-500 font-mono">portal://{g.id}</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // عرض شاشات البوابة المختارة (فقط شاشات هذه البوابة)
  const portalScreens = SCREENS.filter((s) => s.portals.includes(gateway.id));
  const groups = [...new Set(portalScreens.map((s) => s.group))];
  const Icon = gateway.icon;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* ترويسة البوابة */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className={`h-12 w-12 rounded-2xl ${gateway.accent.bg} flex items-center justify-center`}>
            <Icon className={`h-6 w-6 ${gateway.accent.text}`} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">{gateway.title}</h1>
            <p className="text-sm text-slate-400">{gateway.subtitle}</p>
          </div>
        </div>
        <button
          onClick={() => setActive(null)}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 transition"
        >
          <ArrowRight className="w-4 h-4" />
          تغيير البوابة
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {GATEWAYS.map((g) => (
          <button
            key={g.id}
            onClick={() => {
              setActive(g.id);
              onShowToast('info', `تم التبديل إلى ${g.title}`);
            }}
            className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold border transition ${
              g.id === gateway.id
                ? `${g.accent.bg} ${g.accent.text} ${g.accent.border}`
                : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200'
            }`}
          >
            <g.icon className="w-4 h-4" />
            {g.title}
          </button>
        ))}
      </div>

      {/* مجموعات الشاشات — كل المجموعات داخل البوابة */}
      <div className="space-y-8">
        {groups.map((group) => (
          <section key={group}>
            <h3 className="text-sm font-bold text-slate-400 mb-3 flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${gateway.accent.dot}`} />
              {group}
              <span className="text-[11px] font-mono text-slate-600">
                ({portalScreens.filter((s) => s.group === group).length})
              </span>
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {portalScreens.filter((s) => s.group === group).map((s) => {
                const ScreenIcon = s.icon;
                return (
                  <button
                    key={s.id}
                    onClick={() => {
                      onNavigate(s.id);
                      onShowToast('info', `فتح شاشة: ${s.label}`);
                    }}
                    className="text-right rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-600 hover:bg-slate-800/60 transition p-4 flex items-center gap-3 group"
                  >
                    <div className={`w-10 h-10 rounded-lg ${gateway.accent.bg} flex items-center justify-center shrink-0`}>
                      <ScreenIcon className={`w-5 h-5 ${gateway.accent.text}`} />
                    </div>
                    <span className="text-sm font-semibold text-slate-100 group-hover:text-white">{s.label}</span>
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
};

export default Gateways;
