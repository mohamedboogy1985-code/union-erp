import React from 'react';
import { useAuthenticatedApiAsset } from '../hooks/useAuthenticatedApiAsset.js';

interface AuthenticatedApiFrameProps extends Omit<React.IframeHTMLAttributes<HTMLIFrameElement>, 'src'> {
  src: string;
}

/** Load a protected document into an iframe after fetching it with the ERP identity header. */
export const AuthenticatedApiFrame: React.FC<AuthenticatedApiFrameProps> = ({ src, title, className, ...props }) => {
  const { assetUrl, error } = useAuthenticatedApiAsset(src);
  if (error) {
    return (
      <div className={`${className || ''} flex items-center justify-center bg-white p-4 text-center text-xs text-slate-600`}>
        تعذّر تحميل الملف المحمي. تحقق من تسجيل الدخول ثم أعد المحاولة.
      </div>
    );
  }
  if (!assetUrl) {
    return <div aria-busy="true" aria-label="جارٍ تحميل الملف" className={`${className || ''} animate-pulse bg-slate-200`} />;
  }
  return <iframe {...props} src={assetUrl} title={title} className={className} />;
};

export default AuthenticatedApiFrame;
