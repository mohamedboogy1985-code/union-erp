/**
 * ===== سياق الطلب (Request Context) — البند P0-3 =====
 * المرجع: docs/AI_AGENT_AUDIT.md (البند 5: «تمرير `req.ip` الحقيقي و`correlationId`
 * عبر `AsyncLocalStorage` بدل القيمة المثبّتة»).
 *
 * قبل هذا: كل حدث تدقيق كان يُسجَّل بعنوان IP مثبّت (`127.0.0.1 (Desktop Client)`)
 * وبمعرّف ارتباط عشوائي لا يربط الأحداث المتسلسلة لنفس الطلب. أي تحقيق لاحق لا
 * يستطيع أن يقول «من أين جاء هذا الطلب» ولا أن يجمع أحداث العملية الواحدة.
 *
 * بعد هذا: كل طلب يمرّ عبر الوسيط `withRequestContext` فيُخزَّن في مخزن غير متزامن
 * (AsyncLocalStorage) — فيبقى متاحاً لكل الدوال النازلة (بلا تمرير وسائط)، ويُقرأ
 * في `store.recordAudit` لعنوان IP وللارتباط، ويُعاد استخدامه كترويسة استجابة.
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import type { NextFunction, Request, Response } from 'express';

export interface RequestContext {
  correlationId: string;
  ipAddress: string;
  method: string;
  path: string;
  userAgent: string;
}

const storage = new AsyncLocalStorage<RequestContext>();

/** معرّف الارتباط: من الترويسة إن أرسلها العميل (للتتبع الموزّع)، وإلا يُولَّد هنا */
function resolveCorrelationId(req: Request): string {
  const header = req.headers['x-correlation-id'] || req.headers['x-request-id'];
  if (typeof header === 'string' && header.trim()) return header.trim().slice(0, 128);
  return `CORR-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
}

/** عنوان IP الحقيقي: يُقدَّم `x-forwarded-for` (أول عنوان) لأن الخادم يعمل خلف وسيط */
export function resolveClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0].trim().slice(0, 64);
  }
  return String(req.ip || req.socket?.remoteAddress || 'unknown').slice(0, 64);
}

/** الوسيط: يُثبّت السياق لكل ما يُنفَّذ داخل الطلب (بما فيه ردود async) */
export function withRequestContext(req: Request, res: Response, next: NextFunction): void {
  const context: RequestContext = {
    correlationId: resolveCorrelationId(req),
    ipAddress: resolveClientIp(req),
    method: req.method,
    path: req.originalUrl.split('?')[0] || '/',
    userAgent: String(req.headers['user-agent'] || '').slice(0, 200),
  };
  // ترويسة الاستجابة تجعل ربط شكوى المستخدم بحدث التدقيق ممكناً
  res.setHeader('x-correlation-id', context.correlationId);
  storage.run(context, () => next());
}

/** السياق الحالي — أو undefined خارج أي طلب (بذر/اختبارات/مهام خلفية) */
export function getRequestContext(): RequestContext | undefined {
  return storage.getStore();
}
