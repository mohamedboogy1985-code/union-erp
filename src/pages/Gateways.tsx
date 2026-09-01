import React from 'react';
import { ArrowRight, Landmark } from 'lucide-react';
import { GATEWAYS, PortalId, screensForPortal } from '../config/portals.js';

interface GatewayProps {
  onSelectGateway: (gatewayId: PortalId) => void;
  onShowToast: (type: 'success' | 'error' | 'warning' | 'info', msg: string) => void;
}

/**
 * شاشة البوابات الرئيسية (الهبوط).
 * عند اختيار بوابة تنقل التطبيق إلى شاشتها الأولى وتحمل بيانات/منظمة البوابة نفسها.
 * التنقل داخل البوابة من الشريط الجانبي المخصص لبوابة واحدة فقط.
 */
export const Gateways: React.FC<GatewayProps> = ({ onSelectGateway, onShowToast }) => {
  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="h-12 w-12 rounded-2xl bg-sky-500/15 flex items-center justify-center">
          <Landmark className="h-6 w-6 text-sky-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">بوابات النظام</h1>
          <p className="text-sm text-slate-400">اختر البوابة — كل بوابة لها مخصص شاشاتها وبياناتها المنفصلة</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mt-4">
        {GATEWAYS.map((g) => {
          const Icon = g.icon;
          const screenCount = screensForPortal(g.id).length;
          return (
            <button
              key={g.id}
              onClick={() => {
                onSelectGateway(g.id);
                onShowToast('info', `تم فتح ${g.title} ببيانات منفصلة (${g.organizationId})`);
              }}
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
                  {screenCount} شاشة خاصة
                </span>
                <span className="text-[11px] text-slate-500 font-mono">portal://{g.id}</span>
                <span className="text-[10px] text-slate-500 font-mono mx-1">org:{g.organizationId}</span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default Gateways;
