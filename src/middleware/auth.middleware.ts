import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

/**
 * واجهة لبيانات المستخدم المصادق عليه
 * Authenticated user data interface
 */
export interface AuthenticatedUser {
  id: string;
  email: string;
  role: 'ADMIN' | 'ACCOUNTANT' | 'AUDITOR' | 'USER';
  roles?: string[];
  permissions?: string[];
  status: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';
  iat: number;
  exp: number;
}

/**
 * وسيط التحقق من المصادقة
 * Authentication middleware
 */
export const authMiddleware = (req: Request, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Missing or invalid authorization header'
      });
    }

    const token = authHeader.substring(7);

    try {
      const decoded = jwt.verify(
        token,
        process.env.JWT_SECRET || 'your-secret-key'
      ) as AuthenticatedUser;

      // التحقق من حالة المستخدم
      if (decoded.status !== 'ACTIVE') {
        return res.status(403).json({
          success: false,
          message: 'User account is not active'
        });
      }

      // إضافة بيانات المستخدم إلى الطلب
      (req as any).user = decoded;
      next();
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        return res.status(401).json({
          success: false,
          message: 'Token has expired'
        });
      }

      if (error instanceof jwt.JsonWebTokenError) {
        return res.status(401).json({
          success: false,
          message: 'Invalid token'
        });
      }

      throw error;
    }
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Authentication error',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

/**
 * وسيط التحقق من الدور (الصلاحية)
 * Role-based access control middleware
 */
export const roleMiddleware = (allowedRoles: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = (req as any).user as AuthenticatedUser;

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'User not authenticated'
      });
    }

    if (!allowedRoles.includes(user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Insufficient permissions for this operation'
      });
    }

    next();
  };
};

/**
 * وسيط التحقق من الصلاحية (Permission-based access control)
 * يتحقق من أن المستخدم يملك صلاحية معينة من قاعدة البيانات
 */
export const requirePermission = (permission: string) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = (req as any).user as AuthenticatedUser;

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'User not authenticated'
      });
    }

    // إذا كان المستخدم يملك جميع الصلاحيات (*)
    if (user.permissions?.includes('*')) {
      return next();
    }

    // التحقق من وجود الصلاحية المطلوبة
    if (!user.permissions?.includes(permission)) {
      return res.status(403).json({
        success: false,
        message: `Missing required permission: ${permission}`
      });
    }

    next();
  };
};

/**
 * وسيط التحقق من صلاحيات متعددة (يجب أن يملك المستخدم جميعها)
 */
export const requireAllPermissions = (permissions: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = (req as any).user as AuthenticatedUser;

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'User not authenticated'
      });
    }

    // إذا كان المستخدم يملك جميع الصلاحيات (*)
    if (user.permissions?.includes('*')) {
      return next();
    }

    // التحقق من وجود جميع الصلاحيات المطلوبة
    const missingPermissions = permissions.filter(p => !user.permissions?.includes(p));
    if (missingPermissions.length > 0) {
      return res.status(403).json({
        success: false,
        message: `Missing required permissions: ${missingPermissions.join(', ')}`
      });
    }

    next();
  };
};

/**
 * وسيط التحقق من صلاحية واحدة على الأقل (يجب أن يملك المستخدم صلاحية واحدة على الأقل)
 */
export const requireAnyPermission = (permissions: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = (req as any).user as AuthenticatedUser;

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'User not authenticated'
      });
    }

    // إذا كان المستخدم يملك جميع الصلاحيات (*)
    if (user.permissions?.includes('*')) {
      return next();
    }

    // التحقق من وجود صلاحية واحدة على الأقل
    const hasAnyPermission = permissions.some(p => user.permissions?.includes(p));
    if (!hasAnyPermission) {
      return res.status(403).json({
        success: false,
        message: `Requires at least one of: ${permissions.join(', ')}`
      });
    }

    next();
  };
};

/**
 * وسيط التحقق من معدل الطلبات (Rate Limiting)
 * Rate limiting middleware
 */
export const rateLimitMiddleware = (maxRequests: number = 100, windowMs: number = 60000) => {
  const requestCounts = new Map<string, { count: number; resetTime: number }>();

  return (req: Request, res: Response, next: NextFunction) => {
    const key = req.ip || 'unknown';
    const now = Date.now();

    const data = requestCounts.get(key);

    if (!data || now > data.resetTime) {
      requestCounts.set(key, { count: 1, resetTime: now + windowMs });
      next();
    } else {
      if (data.count >= maxRequests) {
        return res.status(429).json({
          success: false,
          message: 'Too many requests, please try again later',
          retryAfter: Math.ceil((data.resetTime - now) / 1000)
        });
      }

      data.count++;
      next();
    }
  };
};

/**
 * وسيط تسجيل العمليات
 * Operation logging middleware
 */
export const loggingMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const startTime = Date.now();
  const user = (req as any).user as AuthenticatedUser | undefined;

  // تسجيل معلومات الطلب
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`, {
    userId: user?.id || 'anonymous',
    ip: req.ip,
    userAgent: req.get('user-agent')
  });

  // تسجيل الاستجابة عند انتهائها
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    console.log(`[${new Date().toISOString()}] Response ${res.statusCode} - ${duration}ms`);
  });

  next();
};
