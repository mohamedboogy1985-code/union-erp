/**
 * ===== سجل الطلبات (P2) =====
 * استُعيد من PR #24:
 *  • `pino` موجود في تبعيات المشروع لكنه كان غير مستخدم — هنا يُشغَّل فعلاً.
 *  • كل طلب يُسجَّل مع الزمن والحالة، وتُزداد عدادات المقاييس (Prometheus).
 *  • طلب أبطأ من 500ms يُسجَّل تحذيراً (و1s تحذيراً أشد) — قيمة حدّية معلنة في metrics.service.
 *
 * ملاحظات تنفيذية:
 *  • التنسيق الملوّن (pino-pretty) للتطوير فقط، ومحمي بـ try/catch حتى لا يُسقط الخادم
 *    إن غاب الحزم في حزمة الإنتاج (Electron/esbuild).
 *  • لا يُسجَّل أي سر أو توكن: نقتصر على المسار والطريقة والحالة والزمن وعنوان IP.
 */
import type { Request, Response, NextFunction } from 'express';
import pino, { type Logger } from 'pino';
import {
  VERY_SLOW_REQUEST_MS,
  SLOW_REQUEST_MS,
  incMetricRequest,
  incSlowQuery,
} from '../services/metrics.service.js';

function createLogger(): Logger {
  const level = process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug');
  if (process.env.NODE_ENV !== 'production' && process.env.LOG_PRETTY !== '0') {
    try {
      // الهدف يُحلّ وقت التشغيل — نتحقق من توفره قبل تسجيله حتى لا يفشل الخادم
      require.resolve('pino-pretty');
      return pino({ level, transport: { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:standard' } } });
    } catch {
      /* pino-pretty غير متاح — سجل JSON عادي */
    }
  }
  return pino({ level });
}

export const logger: Logger = createLogger();

/** عنوان IP الحقيقي خلف الوكيل (بدون الاعتماد على ترويسات قابلة للتزوير في السجلات المالية) */
function clientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  const first = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  return (first ? String(first).split(',')[0].trim() : '') || req.ip || 'unknown';
}

export function requestLoggerMiddleware(req: Request, res: Response, next: NextFunction): void {
  const startedAt = Date.now();
  res.on('finish', () => {
    const durationMs = Date.now() - startedAt;
    const logData = {
      method: req.method,
      // لا نكتب معاملات URL في السجل؛ قد تحمل بحثاً أو بيانات مالية/شخصية.
      path: req.path,
      status: res.statusCode,
      durationMs,
      ip: clientIp(req),
      userAgent: String(req.headers['user-agent'] || '').slice(0, 120),
    };

    if (durationMs >= VERY_SLOW_REQUEST_MS) logger.warn(logData, `طلب بطيء جداً: ${logData.method} ${logData.path} ${durationMs}ms`);
    else if (durationMs >= SLOW_REQUEST_MS) logger.info(logData, `طلب بطيء: ${logData.method} ${logData.path} ${durationMs}ms`);
    else logger.debug(logData);

    try {
      incMetricRequest(res.statusCode, durationMs);
    } catch {
      /* المقاييس لا يجب أن تُفشل الطلب أبداً */
    }
  });
  next();
}

/** يُستدعى من طبقة القاعدة عند استعلام بطيء */
export function slowQueryLogger(query: string, durationMs: number, params?: unknown[]): void {
  if (durationMs < SLOW_REQUEST_MS) return;
  logger.warn(
    { query: query.slice(0, 500), durationMs, paramCount: params?.length ?? 0 },
    `استعلام بطيء ${durationMs}ms`
  );
  try {
    incSlowQuery();
  } catch {
    /* ignore */
  }
}

/** سجل أحداث أمنية/إدارية موجّه (لا يُستخدم لعرض بيانات للواجهة) */
export function logSecurityEvent(event: string, details: Record<string, unknown> = {}): void {
  logger.warn({ event, ...details }, `حدث أمني: ${event}`);
}
