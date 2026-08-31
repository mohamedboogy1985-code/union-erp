import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { erpStore } from '../db/store.js';
import { encryptionService } from '../../src/services/encryption.service.js';
import { buildOtpAuthUrl, generateTotpSecret, verifyTotp } from '../utils/totp.js';
import { getJwtSecret, isStrictAuth, warnDemoLoginOnce } from '../security/runtime-config.js';
import type { User, UserSecurityState } from '../../src/types/erp.js';

/**
 * ===== IMPROVEMENTS.md 5.1: معايير أمان قوية - التحقق متعدد المستويات =====
 * AdvancedAuthService:
 * - تسجيل دخول بإصدار JWT (موقّع HS256 بصلاحية من البيئة)
 * - تتبع محاولات الدخول الفاشلة مع قفل مؤقت تلقائي (5 محاولات / 15 دقيقة)
 * - التحقق من IP وجهاز المستخدم وتوثيق كل محاولة في سجل التدقيق
 * - 2FA (TOTP) للعمليات الحساسة مع تخزين السر مشفراً AES-256-GCM
 */

const MAX_FAILED_ATTEMPTS = Number(process.env.MAX_FAILED_ATTEMPTS || 5);
const LOCKOUT_MINUTES = Number(process.env.LOCKOUT_MINUTES || 15);
const JWT_EXPIRES = process.env.JWT_EXPIRE || '7d';

export interface LoginResult {
  success: boolean;
  token?: string;
  user?: Omit<User, never>;
  requiresTwoFactor?: boolean;
  message: string;
  failedAttempts?: number;
  lockedUntil?: string;
}

export class AdvancedAuthService {
  /**
   * تسجيل الدخول: username + ip → تتبع المحاولات والقفل ثم إصدار JWT
   * التحقق من كلمة المرور:
   * - إن كان للحساب passwordHash (bcrypt) يجب تطابقها وإلا تُحسب محاولة فاشلة.
   * - إن لم توجد كلمة مرور مخزنة: تُقبل في وضع العرض فقط (مع تحذير)،
   *   وتُرفض كلياً في الوضع الصارم (DEMO_MODE=false) حتى ضبط كلمة مرور للحساب.
   */
  public login(identifier: string, ipAddress: string, userAgent?: string, password?: string): LoginResult {
    const user = erpStore.users.find(
      (u) => u.username === identifier || u.email === identifier || u.id === identifier
    );

    if (!user) {
      erpStore.recordAudit(
        'anonymous',
        identifier,
        'ANONYMOUS',
        'org-general',
        'LOGIN_FAILED',
        'AUTH',
        identifier,
        `محاولة دخول بحساب غير موجود [${identifier}] من العنوان ${ipAddress}`,
        undefined,
        undefined,
        'FAILURE'
      );
      return { success: false, message: 'بيانات الدخول غير صحيحة.' };
    }

    const security = erpStore.getSecurityState(user.id);

    // فحص القفل المؤقت
    if (security.lockedUntil && new Date(security.lockedUntil) > new Date()) {
      erpStore.recordAudit(
        user.id,
        user.fullName,
        user.role,
        user.organizationId,
        'LOGIN_BLOCKED',
        'AUTH',
        user.id,
        `رفض محاولة دخول لحساب مقفل مؤقتاً حتى ${security.lockedUntil} من ${ipAddress}`,
        undefined,
        undefined,
        'BLOCKED'
      );
      return {
        success: false,
        message: `الحساب مقفل مؤقتاً بسبب محاولات فاشلة متكررة. أعد المحاولة بعد ${security.lockedUntil}.`,
        lockedUntil: security.lockedUntil,
      };
    }

    // التحقق من كلمة المرور: bcrypt عند وجود بصمة مخزنة (الوضع الحقيقي)
    if (user.passwordHash) {
      const passwordOk = typeof password === 'string' && password.length > 0 && bcrypt.compareSync(password, user.passwordHash);
      if (!passwordOk) {
        return this.registerFailedAttempt(user, security, ipAddress, userAgent, 'كلمة مرور غير صحيحة');
      }
    } else if (isStrictAuth()) {
      // الوضع الصارم لا يقبل حسابات بلا كلمة مرور مخزنة إطلاقاً
      return this.registerFailedAttempt(
        user,
        security,
        ipAddress,
        userAgent,
        'حساب بلا كلمة مرور مخزنة في الوضع الصارم'
      );
    } else {
      // وضع العرض التجريبي: قبول الحسابات بلا كلمة مرور للعرض المحلي فقط
      warnDemoLoginOnce();
    }

    // 2FA مفعّل؟ يلزم رمز تحقق
    if (security.twoFactorEnabled) {
      return {
        success: false,
        requiresTwoFactor: true,
        message: 'أدخل رمز التحقق الثنائي (TOTP) من تطبيق المصادقة لإكمال الدخول.',
      };
    }

    return this.completeLogin(user, security, ipAddress, userAgent);
  }

  /**
   * إكمال الدخول بعد التحقق الثنائي
   */
  public loginWithTwoFactor(identifier: string, totpCode: string, ipAddress: string, userAgent?: string): LoginResult {
    const user = erpStore.users.find((u) => u.username === identifier || u.email === identifier || u.id === identifier);
    if (!user) return { success: false, message: 'بيانات الدخول غير صحيحة.' };

    const security = erpStore.getSecurityState(user.id);
    if (security.lockedUntil && new Date(security.lockedUntil) > new Date()) {
      return { success: false, message: 'الحساب مقفل مؤقتاً.', lockedUntil: security.lockedUntil };
    }

    if (!security.twoFactorEnabled || !security.twoFactorSecret) {
      // لا نكشف حالة التحقق الثنائي للمهاجم: تُعامل كبيانات دخول غير صحيحة
      return this.registerFailedAttempt(user, security, ipAddress, userAgent, 'محاولة 2FA على حساب غير مفعّل عليه');
    }

    const secret = encryptionService.decrypt(security.twoFactorSecret);
    if (!verifyTotp(totpCode, secret)) {
      return this.registerFailedAttempt(user, security, ipAddress, userAgent, 'TOTP خاطئ');
    }

    return this.completeLogin(user, security, ipAddress, userAgent);
  }

  private completeLogin(user: User, security: UserSecurityState, ipAddress: string, userAgent?: string): LoginResult {
    security.failedAttempts = 0;
    security.lockedUntil = undefined;
    security.lastLoginAt = new Date().toISOString();

    const token = this.issueToken(user);

    erpStore.recordAudit(
      user.id,
      user.fullName,
      user.role,
      user.organizationId,
      'LOGIN_SUCCESS',
      'AUTH',
      user.id,
      `تسجيل دخول ناجح من ${ipAddress}${userAgent ? ` عبر ${userAgent.slice(0, 80)}` : ''}`
    );

    return { success: true, token, user, message: 'تم تسجيل الدخول بنجاح.' };
  }

  private registerFailedAttempt(
    user: User,
    security: UserSecurityState,
    ipAddress: string,
    userAgent?: string,
    reason = 'بيانات غير صحيحة'
  ): LoginResult {
    security.failedAttempts += 1;
    security.lastFailedAt = new Date().toISOString();

    if (security.failedAttempts >= MAX_FAILED_ATTEMPTS) {
      const lockedUntil = new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000).toISOString();
      security.lockedUntil = lockedUntil;
      security.failedAttempts = 0;

      erpStore.recordAudit(
        user.id,
        user.fullName,
        user.role,
        user.organizationId,
        'ACCOUNT_LOCKED',
        'AUTH',
        user.id,
        `قفل الحساب مؤقتاً حتى ${lockedUntil} بعد ${MAX_FAILED_ATTEMPTS} محاولات فاشلة (${reason}) من ${ipAddress}`,
        undefined,
        undefined,
        'BLOCKED'
      );

      return {
        success: false,
        message: `تم قفل الحساب مؤقتاً لمدة ${LOCKOUT_MINUTES} دقيقة بسبب المحاولات الفاشلة المتكررة.`,
        lockedUntil,
      };
    }

    erpStore.recordAudit(
      user.id,
      user.fullName,
      user.role,
      user.organizationId,
      'LOGIN_FAILED',
      'AUTH',
      user.id,
      `محاولة دخول فاشلة (${security.failedAttempts}/${MAX_FAILED_ATTEMPTS}) - ${reason} - من ${ipAddress}`,
      undefined,
      undefined,
      'FAILURE'
    );

    return {
      success: false,
      message: `بيانات الدخول غير صحيحة. تبقى ${MAX_FAILED_ATTEMPTS - security.failedAttempts} محاولة قبل قفل الحساب.`,
      failedAttempts: security.failedAttempts,
    };
  }

  /**
   * إصدار JWT موقّع
   */
  public issueToken(user: User): string {
    const secret = getJwtSecret();
    return jwt.sign(
      {
        sub: user.id,
        username: user.username,
        role: user.role,
        organizationId: user.organizationId,
        status: 'ACTIVE',
      },
      secret,
      { expiresIn: JWT_EXPIRES as jwt.SignOptions['expiresIn'] }
    );
  }

  /**
   * التحقق من صحة التوكن
   */
  public verifyToken(token: string): { valid: boolean; payload?: any; message?: string } {
    try {
      const payload = jwt.verify(token, getJwtSecret());
      return { valid: true, payload };
    } catch (err: any) {
      return { valid: false, message: err?.message || 'توكن غير صالح' };
    }
  }

  /**
   * تفعيل/إيقاف التحقق الثنائي (2FA) — يُرجع سر الإعداد ورمز otpauth للمسح الضوئي
   */
  public setupTwoFactor(userId: string): { secret: string; otpAuthUrl: string } | null {
    const user = erpStore.users.find((u) => u.id === userId);
    if (!user) return null;

    const secret = generateTotpSecret();
    const security = erpStore.getSecurityState(userId);
    security.twoFactorSecret = encryptionService.encrypt(secret);
    security.twoFactorEnabled = true;

    erpStore.recordAudit(
      user.id,
      user.fullName,
      user.role,
      user.organizationId,
      'TWO_FACTOR_ENABLED',
      'AUTH',
      user.id,
      'تفعيل التحقق الثنائي (TOTP) للحساب مع تخزين السر مشفراً AES-256-GCM'
    );

    return { secret, otpAuthUrl: buildOtpAuthUrl(secret, user.email || user.username) };
  }

  public disableTwoFactor(userId: string): boolean {
    const user = erpStore.users.find((u) => u.id === userId);
    if (!user) return false;
    const security = erpStore.getSecurityState(userId);
    security.twoFactorEnabled = false;
    security.twoFactorSecret = undefined;

    erpStore.recordAudit(
      user.id,
      user.fullName,
      user.role,
      user.organizationId,
      'TWO_FACTOR_DISABLED',
      'AUTH',
      user.id,
      'إيقاف التحقق الثنائي (TOTP) للحساب'
    );
    return true;
  }
}

export const advancedAuthService = new AdvancedAuthService();
