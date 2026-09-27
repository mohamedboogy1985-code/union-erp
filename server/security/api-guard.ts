/**
 * ===== حارس نقاط API: المنع افتراضاً (Default-Deny API Guard) — البند P0-3 =====
 * المرجع: docs/AI_AGENT_AUDIT.md — «≈62 من 69 نقطة قراءة بلا توثيق».
 *
 * القياس الحيّ قبل هذا الحارس (بلا أي ترويسة توثيق):
 *   GET /api/employees            → 200 (76 موظفاً برواتبهم)
 *   GET /api/journal-entries      → 200 (3.99 م.ب من القيود)
 *   GET /api/audit-logs           → 200 (سجل التدقيق كاملاً)
 *   GET /api/ledger-chain/verify  → 200
 * السبب: التوثيق كان يُفرض في مسارات الكتابة فقط، وكان غياب الترويسة يسقط صامتاً
 * إلى المستخدم الافتراضي (المدير) في وضع العرض.
 *
 * القاعدة الآن:
 *   1) قائمة سماح صريحة وصغيرة للنقاط العامة (بلا بيانات مالية، تُستدعى قبل الدخول).
 *   2) كل ما عداها يتطلب هوية صريحة: توكن JWT صالح، أو (في وضع العرض فقط)
 *      ترويسة `x-user-id` لمستخدم قائم — وهي الترويسة التي يرسلها التطبيق نفسه.
 *   3) غياب الهوية = 401 `AUTH_REQUIRED` + حدث تدقيق `BLOCKED` (لا رفض صامت).
 *
 * ملاحظة تصميمية: الحارس شامل لكل `/api`، فلا يمكن إضافة نقطة قراءة جديدة منسية
 * بلا توثيق — وهذا بالضبط سبب اختيار الحارس الشامل بدل إضافة `requirePermission`
 * إلى 62 مساراً يدوياً (حيث يكفي أن تُنسى واحدة ليتكرر الخلل).
 */
import type { Express, NextFunction, Request, Response } from 'express';
import type { User } from '../../src/types/erp.js';

/**
 * النقاط العامة المسموح بها قبل تسجيل الدخول — كل إضافة تحتاج تبريراً:
 *   - `/api/health`: فحص حياة بلا بيانات (يُستخدم في CI والمراقبة).
 *   - `/api/auth/login` و`/2fa`: بوابة الدخول نفسها.
 *   - `/api/operator-assistant/status`: تشخيص إعداد المساعد قبل الدخول (يُستدعى من
 *     شاشة الإعداد وCI) ولا يكشف بيانات مالية.
 *   - `/api/verify-receipt/:token`: تحقق عام بمنحة مطبوعة على الإيصال نفسه.
 *
 * ملاحظة: `originalUrl` تحمل المسار كاملاً (`/api/...`)، لذا الأنماط تبدأ بـ`/api`.
 */
export const PUBLIC_API_PATTERNS: RegExp[] = [
  /^\/api\/health$/,
  /^\/api\/auth\/login$/,
  /^\/api\/auth\/login\/2fa$/,
  /^\/api\/operator-assistant\/status$/,
  /^\/api\/verify-receipt\/[^/]+$/,
];

/** هل المسار عام (يُقارَن على المسار بلا معاملات استعلام وبلا شرطة زائدة)؟ */
export function isPublicApiPath(originalUrl: string, patterns: RegExp[] = PUBLIC_API_PATTERNS): boolean {
  const path = (originalUrl.split('?')[0] || '/').replace(/\/+$/, '') || '/';
  return patterns.some((pattern) => pattern.test(path));
}

export interface ApiGuardDependencies {
  /** المستخدم الفعّال من الطلب — أو null إن غابت الهوية أو كانت غير صالحة */
  resolveUser: (req: Request) => User | null;
  /** يُستدعى عند كل رفض (لتسجيله في سجل التدقيق) — لا يجب أن يُفشل الطلب */
  onRejected?: (req: Request, info: { reason: string; path: string; method: string }) => void;
  /** أنماط سماح بديلة (تُستخدم في الاختبارات) */
  publicPatterns?: RegExp[];
  /** تخطي الحارس كلياً (يُستخدم في الاختبارات التي تختبر مساراً معزولاً) */
  disabled?: boolean;
}

export interface ApiGuardResult {
  /** عدد الطلبات المرفوضة لأسباب توثيق (تشخيص/فحص) */
  rejectedCount: () => number;
}

/** تركيب الحارس قبل تسجيل أي مسار `/api` — فيمرّ كل ما بعده عليه */
export function installApiGuard(app: Express, deps: ApiGuardDependencies): ApiGuardResult {
  let rejected = 0;

  app.use('/api', (req: Request, res: Response, next: NextFunction) => {
    if (deps.disabled) return next();
    // طلبات CORS التمهيدية لا تحمل هوية بحكم المتصفح
    if (req.method === 'OPTIONS') return next();

    const path = req.originalUrl.split('?')[0] || '/';
    if (isPublicApiPath(req.originalUrl, deps.publicPatterns)) return next();

    const user = deps.resolveUser(req);
    if (user) {
      // المستخدم الموثَّق متاح للمسارات التالية بلا إعادة تحقّق
      res.locals.activeUser = user;
      return next();
    }

    rejected += 1;
    try {
      deps.onRejected?.(req, { reason: 'AUTH_REQUIRED', path, method: req.method });
    } catch (error) {
      console.error('⚠️ تعذّر تسجيل رفض التوثيق في سجل التدقيق:', error);
    }

    res.status(401).json({
      error:
        'يلزم تسجيل الدخول: كل نقاط /api تتطلب هوية صريحة (توكن JWT، أو ترويسة x-user-id لمستخدم قائم في وضع العرض التجريبي).',
      code: 'AUTH_REQUIRED',
    });
  });

  return { rejectedCount: () => rejected };
}
