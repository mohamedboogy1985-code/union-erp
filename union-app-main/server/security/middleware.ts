import { Request, Response, NextFunction } from 'express';
import { erpStore } from '../db/store.js';

/**
 * ===== IMPROVEMENTS.md 5.1 / 5.2: تحسينات الأمان وسجل التدقيق الشامل =====
 * - SecurityHeaders: رؤوس أمان HTTP (CSP/HSTS/X-Frame-Options...)
 * - RateLimiter: حد معدل الطلبات لكل IP (نافذة منزلقة في الذاكرة)
 * - ComprehensiveAuditLog: تسجيل كل العمليات (العمليات المغيّرة للحالة في سلسلة
 *   التدقيق المشفرة Hash-Chain، وكل الطلبات في سجل وصول مؤقت bounded)
 */

/** 1) رؤوس الأمان (طبقة مكافئة لـ helmet دون كسر عرض Vite التطويري) */
export function securityHeadersMiddleware(req: Request, res: Response, next: NextFunction) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Permissions-Policy', 'camera=(self), microphone=(self), geolocation=()');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-site');
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'");
  }
  next();
}

/** 2) حد معدل الطلبات لكل IP: 300 طلب/دقيقة افتراضياً (100 للنقاط الحساسة) */
export function createRateLimiter(maxRequests: number = 300, windowMs: number = 60_000) {
  const hits = new Map<string, { count: number; resetAt: number }>();

  // تنظيف دوري لمنع تضخم الذاكرة
  setInterval(() => {
    const now = Date.now();
    hits.forEach((v, k) => {
      if (v.resetAt < now) hits.delete(k);
    });
  }, windowMs).unref?.();

  return (req: Request, res: Response, next: NextFunction) => {
    const key = req.ip || req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    const entry = hits.get(key);

    if (!entry || entry.resetAt < now) {
      hits.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }

    entry.count += 1;
    if (entry.count > maxRequests) {
      res.status(429).json({
        error: 'تم تجاوز الحد المسموح من الطلبات. يرجى الانتظار قليلاً قبل إعادة المحاولة.',
        retryAfterMs: entry.resetAt - now,
      });
      return;
    }
    next();
  };
}

/**
 * 3) سجل التدقيق الشامل (ComprehensiveAuditLog):
 * - يوثق كل طلب API (method + path + status + duration + IP + User-Agent)
 * - العمليات المغيّرة للحالة (POST/PUT/PATCH/DELETE) تدخل سلسلة التدقيق
 *   المشفرة erpStore.recordAudit مع IP وUser-Agent
 */
const recentAccessLogs: {
  timestamp: string;
  method: string;
  path: string;
  status: number;
  durationMs: number;
  ipAddress: string;
  userAgent?: string;
}[] = [];

const ACCESS_LOG_LIMIT = 500;

export function comprehensiveAuditMiddleware(req: Request, res: Response, next: NextFunction) {
  const start = Date.now();
  const ipAddress = req.ip || req.socket.remoteAddress || 'unknown';
  const userAgent = req.headers['user-agent'];

  res.on('finish', () => {
    // تجاهل ملفات Vite الثابتة والـ HMR
    if (!req.path.startsWith('/api/')) return;

    const logEntry = {
      timestamp: new Date().toISOString(),
      method: req.method,
      path: req.path,
      status: res.statusCode,
      durationMs: Date.now() - start,
      ipAddress,
      userAgent,
    };

    recentAccessLogs.unshift(logEntry);
    if (recentAccessLogs.length > ACCESS_LOG_LIMIT) recentAccessLogs.pop();

    // العمليات المغيّرة للحالة تُدرج في سلسلة التدقيق الرسمية
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) && res.statusCode < 500) {
      const activeUserId = (req.headers['x-user-id'] as string) || 'usr-cfo';
      const user = erpStore.users.find((u) => u.id === activeUserId);
      const action =
        req.method === 'POST' ? 'API_CREATE' :
        req.method === 'PUT' || req.method === 'PATCH' ? 'API_UPDATE' :
        'API_DELETE';

      erpStore.recordAudit(
        user?.id || activeUserId,
        user?.fullName || 'مستخدم غير معروف',
        user?.role || 'UNKNOWN',
        user?.organizationId || 'org-general',
        action,
        'HTTP_API',
        req.path,
        `${req.method} ${req.path} → ${res.statusCode} (${logEntry.durationMs}ms) من ${ipAddress}${userAgent ? ` | UA: ${String(userAgent).slice(0, 60)}` : ''}`,
        undefined,
        undefined,
        res.statusCode >= 400 ? 'FAILURE' : 'SUCCESS'
      );
    }
  });

  next();
}

/** الوصول لسجل الزيارات الأخير (لنقطة /api/security/access-log) */
export function getRecentAccessLogs(limit = 100) {
  return recentAccessLogs.slice(0, limit);
}
