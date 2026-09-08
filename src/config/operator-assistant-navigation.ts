import { ALL, SCREENS, type PortalId } from './portals.js';

/** Shared with the server and App: no model-generated paths or arbitrary destinations. */
export const OPERATOR_NAVIGATION: { id: string; label: string; portals: PortalId[] }[] = [
  ...SCREENS.map(({ id, label, portals }) => ({ id, label, portals })),
  { id: 'portals', label: 'البوابات الرئيسية', portals: ALL },
  { id: 'promo', label: 'العرض الترويجي والفيديو', portals: ALL },
  { id: 'ai', label: 'المساعد المحاسبي', portals: ALL },
  { id: 'liveagent', label: 'المساعد الصوتي المرئي', portals: ALL },
  { id: 'accounting', label: 'المحاسبة والمالية', portals: ['syndicate'] },
  { id: 'membership', label: 'العضوية والتحصيل', portals: ['syndicate'] },
  { id: 'hrs', label: 'الموارد البشرية والعاملين', portals: ['training'] },
];
