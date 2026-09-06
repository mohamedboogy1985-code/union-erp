/**
 * P2/P3: Pino logger + slow request tracking
 * - JSON logs في الإنتاج، pretty في التطوير
 * - يحسب زمن الاستجابة ويحذر عند البطء >500ms
 */

import { Request, Response, NextFunction } from 'express';
import pino from 'pino';

export const logger = pino({
  level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
  transport:
    process.env.NODE_ENV !== 'production'
      ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:standard' } }
      : undefined,
});

export function requestLoggerMiddleware(req: Request, res: Response, next: NextFunction) {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    const logData = {
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      durationMs: duration,
      ip: req.ip,
      userAgent: req.headers['user-agent']?.slice(0, 120),
    };

    if (duration > 1000) {
      logger.warn(logData, `Slow request >1s: ${req.method} ${req.originalUrl} ${duration}ms`);
    } else if (duration > 500) {
      logger.info(logData, `Slow request >500ms: ${req.method} ${req.originalUrl} ${duration}ms`);
    } else {
      logger.debug(logData);
    }

    // تحديث عدادات Prometheus
    try {
      const { incMetricRequest } = require('../routes/system.routes.js');
      incMetricRequest(res.statusCode);
    } catch {}
  });
  next();
}

export function slowQueryLogger(query: string, durationMs: number, params?: any[]) {
  if (durationMs > 500) {
    logger.warn({ query: query.slice(0, 500), durationMs, params: params?.slice(0, 3) }, `Slow PG query ${durationMs}ms`);
    try {
      const { incSlowQuery } = require('../routes/system.routes.js');
      incSlowQuery();
    } catch {}
  }
}
