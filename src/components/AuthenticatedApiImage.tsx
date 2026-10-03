import React from 'react';
import { useAuthenticatedApiAsset } from '../hooks/useAuthenticatedApiAsset.js';

interface AuthenticatedApiImageProps extends Omit<React.ImgHTMLAttributes<HTMLImageElement>, 'src'> {
  src: string;
}

/** An image backed by a protected API route; native img requests cannot attach ERP identity headers. */
export const AuthenticatedApiImage: React.FC<AuthenticatedApiImageProps> = ({ src, alt, className, ...props }) => {
  const { assetUrl, error } = useAuthenticatedApiAsset(src);
  if (error) {
    return (
      <div
        role="img"
        aria-label={alt || 'تعذّر تحميل الصورة'}
        className={`${className || ''} flex min-h-40 items-center justify-center bg-slate-950 p-4 text-center text-xs text-slate-400`}
      >
        تعذّر تحميل الصورة المحمية. تحقق من تسجيل الدخول ثم أعد المحاولة.
      </div>
    );
  }
  if (!assetUrl) {
    return <div aria-busy="true" aria-label="جارٍ تحميل الصورة" className={`${className || ''} min-h-40 animate-pulse bg-slate-800/40`} />;
  }
  return <img {...props} src={assetUrl} alt={alt} className={className} />;
};

export default AuthenticatedApiImage;
