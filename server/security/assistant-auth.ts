import type { Request } from 'express';
import type { User } from '../../src/types/erp.js';
import { advancedAuthService } from '../services/auth-advanced.service.js';
import { erpStore } from '../db/store.js';
import { can } from './permissions.js';
import { isStrictAuth, isWeakSecret } from './runtime-config.js';

export class AssistantError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public retryAfterSeconds?: number
  ) {
    super(message);
    this.name = 'AssistantError';
  }
}
export function assistantUser(req: Request): User | null {
  const header = req.headers.authorization;
  if (!header || !/^Bearer [^\s]{10,4096}$/.test(header)) return null;
  const result = advancedAuthService.verifyToken(header.slice(7));
  if (
    !result.valid ||
    result.payload?.authMode !== 'password' ||
    typeof result.payload.sub !== 'string'
  )
    return null;
  const user = erpStore.users.find((item) => item.id === result.payload.sub);
  return user?.isActive && !user.isDemo && can(user, 'view:all') ? user : null;
}
export function assistantAccountReady(user: User | null): boolean {
  return Boolean(
    user?.passwordHash && /^\$2[aby]\$(1[0-6])\$[./A-Za-z0-9]{53}$/.test(user.passwordHash)
  );
}
export function assistantStrictReady(): boolean {
  return (
    isStrictAuth() &&
    !isWeakSecret(process.env.JWT_SECRET) &&
    !isWeakSecret(process.env.ENCRYPTION_KEY)
  );
}
export function requireAssistantUser(req: Request): User {
  const user = assistantUser(req);
  if (!user)
    throw new AssistantError(
      401,
      'ASSISTANT_AUTH_REQUIRED',
      'سجّل الدخول بكلمة مرور ERP أولاً. اختيار اسم المستخدم التجريبي لا يكفي.'
    );
  if (!assistantStrictReady() || !assistantAccountReady(user)) {
    throw new AssistantError(
      403,
      'ASSISTANT_AUTH_NOT_READY',
      'يلزم وضع الأمان الصارم وكلمة مرور حقيقية وأسرار خادم قوية.'
    );
  }
  return user;
}
export function assistantCanAccessOrg(user: User, orgId: string): boolean {
  return (
    erpStore.organizations.some((org) => org.id === orgId && org.isActive) &&
    (can(user, 'system:admin') ||
      user.organizationId === orgId ||
      user.allowedOrgIds.includes(orgId))
  );
}
export function requireAssistantOrg(user: User, value: unknown): string {
  if (typeof value !== 'string' || !assistantCanAccessOrg(user, value)) {
    throw new AssistantError(
      403,
      'ASSISTANT_ORG_FORBIDDEN',
      'لا تملك صلاحية الوصول إلى هذا الكيان.'
    );
  }
  return value;
}
export function assistantObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new AssistantError(400, 'ASSISTANT_INVALID_INPUT', 'صيغة الطلب غير صحيحة.');
  return value as Record<string, unknown>;
}
export function assistantText(value: unknown, maximum: number, required = true): string {
  if (
    typeof value !== 'string' ||
    value.length > maximum ||
    value.includes('\0') ||
    (required && !value.trim())
  ) {
    throw new AssistantError(400, 'ASSISTANT_INVALID_INPUT', 'راجع النص المدخل وطوله.');
  }
  return value.trim();
}
export function assistantFieldsOnly(value: Record<string, unknown>, keys: string[]): void {
  if (Object.keys(value).some((key) => !keys.includes(key)))
    throw new AssistantError(400, 'ASSISTANT_INVALID_INPUT', 'يتضمن الطلب حقولاً غير مسموحة.');
}
