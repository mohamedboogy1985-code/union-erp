import React from 'react';
import { useAuthenticatedApiAsset } from '../hooks/useAuthenticatedApiAsset.js';
import { ApiError } from '../services/api.js';

interface AuthenticatedApiFrameProps extends Omit<React.IframeHTMLAttributes<HTMLIFrameElement>, 'src'> {
  src: string;
}

/** Load a protected document into an iframe after fetching it with the ERP identity header. */
export const AuthenticatedApiFrame: React.FC<AuthenticatedApiFrameProps> = ({ src, title, className, ...props }) => {
  const { assetUrl, error } = useAuthenticatedApiAsset(src);
  if (error) {
    const isLibraryLock = error instanceof ApiError && error.status === 423;
    return (
      <div
        className={`${className || ''} flex items-center justify-center bg-white p-4 text-center text-xs text-slate-600`}
        data-frame-error={isLibraryLock ? 'library-locked' : 'auth'}
      >
        {isLibraryLock ? (
          <span>
            {error.message}
            <br />
            أعد المحاولة بعد فتح القفل من نافذة «فتح قفل مكتبة النماذج» بكلمة المرور (تُطلب من جديد بعد كل إعادة تشغيل للخادم لأنها لا تُخزَّن).
          </span>
        ) : (
          'تعذّر تحميل الملف المحمي. تحقق من تسجيل الدخول ثم أعد المحاولة.'
        )}
      </div>
    );
  }
  if (!assetUrl) {
    return <div aria-busy="true" aria-label="جارٍ تحميل الملف" className={`${className || ''} animate-pulse bg-slate-200`} />;
  }
  return <iframe {...props} src={assetUrl} title={title} className={className} />;
};

export default AuthenticatedApiFrame;
