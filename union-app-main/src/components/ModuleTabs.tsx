import React from 'react';
import { Layers } from 'lucide-react';

export interface ModuleTabDef<T extends string> {
  id: T;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
}

interface ModuleTabsProps<T extends string> {
  /** عنوان الوحدة الموحدة الظاهر في الشريط */
  title: string;
  tabs: ModuleTabDef<T>[];
  activeId: T;
  onChange: (id: T) => void;
  icon?: React.ComponentType<{ className?: string }>;
}

/** شريط تبويبات موحد لوحدات الشاشات المجمعة (يظهر أعلى المضمون للتبديل المتقارب) */
export const ModuleTabs = <T extends string>({
  title,
  tabs,
  activeId,
  onChange,
  icon: TitleIcon = Layers,
}: ModuleTabsProps<T>) => {
  return (
    <div className="sticky top-0 z-30 -mx-4 px-4 pt-4 bg-[#0f172a]/95 backdrop-blur border-b border-slate-800">
      <div className="flex items-center gap-2 mb-3">
        <TitleIcon className="w-4 h-4 text-sky-400" />
        <span className="text-[11px] font-bold text-slate-300">{title}</span>
      </div>
      <div className="flex items-center gap-1.5 pb-3 overflow-x-auto">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeId === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onChange(tab.id)}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                isActive
                  ? 'bg-sky-600 text-white shadow-md'
                  : 'bg-slate-900 text-slate-400 border border-slate-800 hover:text-slate-200 hover:border-slate-600'
              }`}
            >
              <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-white' : 'text-slate-400'}`} />
              <span>{tab.label}</span>
              {tab.badge && (
                <span className={`text-[9px] px-1.5 py-0.5 rounded font-mono ${
                  isActive ? 'bg-white/20 text-white' : 'bg-slate-800 text-sky-300'
                }`}>
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default ModuleTabs;