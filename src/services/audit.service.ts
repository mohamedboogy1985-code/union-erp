import { PrismaClient } from '@prisma/client';
import { Request } from 'express';

const prisma = new PrismaClient();

/**
 * خدمة سجل التدقيق
 * Audit logging service for tracking all operations
 */
export interface AuditOperation {
  userId: string;
  action: string;
  entity: string;
  entityId?: string;
  oldValue?: any;
  newValue?: any;
  ipAddress?: string;
  userAgent?: string;
  statusCode?: number;
  details?: string;
}

export class AuditService {
  /**
   * تسجيل عملية تدقيق
   * Log an audit operation
   */
  async log(operation: AuditOperation): Promise<void> {
    try {
      await prisma.auditLog.create({
        data: {
          userId: operation.userId,
          action: operation.action,
          entity: operation.entity,
          entityId: operation.entityId,
          oldValue: operation.oldValue,
          newValue: operation.newValue,
          ipAddress: operation.ipAddress,
          userAgent: operation.userAgent,
          statusCode: operation.statusCode,
          details: operation.details
        }
      });
    } catch (error) {
      console.error('Failed to log audit operation:', error);
      // لا نرفع خطأ لتجنب توقف العملية الرئيسية
    }
  }

  /**
   * الحصول على سجل التدقيق لمستخدم معين
   * Get audit log for a specific user
   */
  async getUserAuditLog(
    userId: string,
    limit: number = 50,
    offset: number = 0
  ) {
    return await prisma.auditLog.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      skip: offset,
      take: limit
    });
  }

  /**
   * الحصول على سجل التدقيق لعملية معينة
   * Get audit log for a specific entity
   */
  async getEntityAuditLog(
    entity: string,
    entityId: string,
    limit: number = 50
  ) {
    return await prisma.auditLog.findMany({
      where: { entity, entityId },
      orderBy: { createdAt: 'desc' },
      take: limit
    });
  }

  /**
   * الحصول على سجل التدقيق للعمليات الحساسة
   * Get sensitive operations audit log
   */
  async getSensitiveOperations(
    userId?: string,
    days: number = 7
  ) {
    const sensitiveActions = [
      'DELETE',
      'UPDATE_AMOUNT',
      'APPROVE_ENTRY',
      'EXPORT_DATA',
      'USER_LOGIN',
      'USER_LOGOUT',
      'PERMISSION_CHANGE'
    ];

    const since = new Date();
    since.setDate(since.getDate() - days);

    return await prisma.auditLog.findMany({
      where: {
        action: { in: sensitiveActions },
        userId: userId,
        createdAt: { gte: since }
      },
      orderBy: { createdAt: 'desc' }
    });
  }

  /**
   * إنشاء إدخال تدقيق من طلب Express
   * Create audit entry from Express request
   */
  static fromRequest(req: Request, action: string, entity: string): Partial<AuditOperation> {
    return {
      ipAddress: req.ip || req.socket.remoteAddress,
      userAgent: req.get('user-agent'),
      action,
      entity
    };
  }
}

export const auditService = new AuditService();
