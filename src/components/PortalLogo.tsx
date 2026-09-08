import React from 'react';
import type { PortalId } from '../config/portals.js';

/** خريطة شعارات البوابات — تُنطبق للعرض في الهبوط والشريط الجانبي والترويسة */
export const PORTAL_LOGOS: Record<PortalId, string> = {
  syndicate: '/assets/logos/union-logo.png',
  training: '/assets/logos/training-logo.png',
  committees: '/assets/logos/mohasbak-ai-logo.png',
};

interface PortalLogoProps {
  gatewayId: PortalId;
  className?: string;
  alt?: string;
  rounded?: boolean;
}

/** شعار البوابة الحالية كصورة — يُستخدم في صفحة الهبوط والشريط الجانبي والترويسة */
export const PortalLogo: React.FC<PortalLogoProps> = ({ gatewayId, className = '', alt, rounded = true }) => (
  <img
    src={PORTAL_LOGOS[gatewayId]}
    alt={alt || gatewayId}
    className={`object-cover ${rounded ? 'rounded' : ''} ${className}`}
    draggable={false}
  />
);

export default PortalLogo;