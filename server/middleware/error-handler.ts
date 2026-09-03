import { Request, Response, NextFunction, ErrorRequestHandler } from 'express';

/**
 * ===== معالجة أخطاء موحدة (Phase 2) =====
 * - NotFound: أي مسار غير معروف يعطى 404 بجسم JSON موحد بدل HTML الافتراضي.
 * - ApiErrorHandler: يلتقط الأخطاء الملقاة من المسارات/الخدمات ويحوّلها
 *   إلى استجابة JSON آمنة لا تكشف تفاصيل الحزمة الداخلية في الإنتاج.
 */

export function notFoundHandler(req: Request, res: Response, _next: NextFunction) {
  res.status(404).json({
    error: `المسار غير موجود: ${req.method} ${req.originalUrl}`,
    path: req.originalUrl,
    method: req.method,
  });
}

export const apiErrorHandler: ErrorRequestHandler = (err: any, req: Request, res: Response, _next: NextFunction) => {
  const status = Number(err?.status || err?.statusCode) || 500;
  const isServerError = status >= 500;

  if (isServerError) {
    console.error('[API Error]', req.method, req.originalUrl, err?.message || err);
  }

  res.status(status).json({
    error: isServerError && process.env.NODE_ENV === 'production'
      ? 'حدث خطأ داخلي في الخادم. يرجى المحاولة لاحقاً.'
      : (err?.message || 'حدث خطأ غير معروف.'),
    path: req.originalUrl,
    ...(isServerError ? { status } : {}),
  });
};
