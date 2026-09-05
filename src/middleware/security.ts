import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';

/**
 * Security middleware for Express server
 * Includes rate limiting, helmet headers, and request size limits
 */

/**
 * Limit requests to prevent DoS attacks
 */
export const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests per IP per window
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true, // Return rate limit info in RateLimit-* headers
  legacyHeaders: false, // Disable X-RateLimit-* headers
});

/**
 * Stricter rate limit for authentication endpoints
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 login attempts per IP per window
  message: 'Too many login attempts, please try again later.',
  skipSuccessfulRequests: true, // Don't count successful attempts
});

/**
 * Rate limit for file uploads
 */
export const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 50, // 50 uploads per IP per hour
  message: 'Too many uploads, please try again later.',
});

/**
 * Apply all security middleware
 */
export function applySecurityMiddleware(app: express.Application): void {
  // Security headers
  app.use(helmet());

  // Request size limits - balances functionality with security
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ limit: '50mb', extended: true }));

  // Rate limiting on general API routes
  app.use('/api/', generalLimiter);
}

/**
 * Apply authentication-specific rate limiting
 */
export function applyAuthRateLimiting(
  app: express.Application,
  authPath: string = '/api/auth/login'
): void {
  app.use(authPath, authLimiter);
}

/**
 * Apply upload-specific rate limiting
 */
export function applyUploadRateLimiting(
  app: express.Application,
  uploadPath: string = '/api/uploads'
): void {
  app.use(uploadPath, uploadLimiter);
}
