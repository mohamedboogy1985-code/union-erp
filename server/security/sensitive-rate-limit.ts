/**
 * ===== حد معدل صريح للمسارات الحسّاسة (Sensitive Route Rate Limit) — P0-3 =====
 * المرجع: CodeQL `js/missing-rate-limiting` على مسارات تُجري توثيقاً وتُعيد حساب
 * تجزئات آلاف السجلات في كل نداء (`/api/ledger-chain/verify`, `/api/audit-logs`,
 * `/api/audit-logs/verify`, `/api/health`).
 *
 * الحد العام الموجود في `server.ts` لا يكفي هنا لسببين حقيقيين:
 *   1) إنه يعفي مدير البرنامج من أي قيد — وهو أكبر مستهلك لهذه المسارات.
 *   2) مسارات التحقق تُعيد حساب سلسلة تجزئة كاملة (آلاف مدخلات SHA-256 لكل طلب)،
 *      فسطح الإغراق فيها أعلى من بقية النقاط.
 *
 * البناء على `express-rate-limit` (تبعية قائمة في المشروع) بدل محدِّد محلي:
 * المكتبة قياسية ومدقَّقة، وتُظهر العدّادات في ترويسات `RateLimit-*` القياسية.
 * مفتاح التحديد هو IP الحقيقي من سياق الطلب (يحترم x-forwarded-for خلف وسيط).
 */
import rateLimit from 'express-rate-limit';
import type { Request, Response } from 'express';
import { resolveClientIp } from './request-context.js';

const WINDOW_MS = 60_000;
const MAX_REQUESTS = Number(process.env.SENSITIVE_RATE_LIMIT_MAX || 100);

export function createSensitiveRateLimiter() {
  return rateLimit({
    windowMs: WINDOW_MS,
    limit: MAX_REQUESTS,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    // مفتاح صريح: IP الحقيقي (لا عنوان الوسيط) — مع بديل آمن إن غاب
    keyGenerator: (req: Request) => resolveClientIp(req) || 'unknown',
    // تعطيل تحققات المكتبة المرتبطة بترويسات الوسيط: المفتاح محسوب صراحةً أعلاه
    validate: { keyGeneratorIpFallback: false, trustProxy: false, xForwardedForHeader: false },
    handler: (_req: Request, res: Response) => {
      res.status(429).json({
        error: 'تم تجاوز الحد المسموح لهذه النقطة الحسّاسة. أعد المحاولة بعد دقيقة.',
        code: 'RATE_LIMITED',
      });
    },
  });
}
