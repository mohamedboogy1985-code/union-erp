/**
 * ===== إعدادات زمن التشغيل الأمنية (Security Runtime Configuration) =====
 * نقطة واحدة تضبط الفرق بين «وضع العرض التجريبي» (Desktop Demo) و«الوضع الصارم»
 * للتشغيل الشبكي الفعلي، دون كسر أي تدفق قائم:
 *
 * - DEMO_MODE (افتراضي: true)
 *     • true  → يبقى الدخول التجريبي بترويسة x-user-id والمستخدم الافتراضي،
 *               وتُقبل الحسابات بلا كلمة مرور (توافق كامل مع تطبيق سطح المكتب
 *               والاختبارات الحالية)، مع تحذيرات واضحة في السجل.
 *     • false → لا يُقبل إلا JWT صالح لكل عمليات الكتابة، ويلزم كلمة مرور
 *               (bcrypt) لكل حساب، ويُرفض الإقلاع بدون أسرار إنتاج قوية.
 *
 *   الطريقة الوحيدة لتفعيل الوضع الصارم: DEMO_MODE=false صريحاً، حتى لا ينكسر
 *   تطبيق Electron المُغلَّف الذي يعمل بـ NODE_ENV=production افتراضياً.
 *
 * - ALLOW_SQL_CONSOLE=true → يسمح بنقطة تنفيذ SQL اليدوية (مقفلة افتراضياً
 *   في الوضع الصارم، ومفتوحة في وضع العرض لأغراض العرض والتطوير).
 */

const WEAK_SECRETS = new Set([
  'union-erp-dev-secret',
  'your_super_secret_jwt_key_change_in_production',
  'change_me_32_byte_random_master_key',
  'default-key',
  'secret',
  'password',
  '',
]);

let warnedDemoLogin = false;

/** هل التطبيق في بيئة إنتاج فعلية (NODE_ENV=production)؟ */
export function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

/**
 * هل وضع العرض التجريبي مفعّل؟
 * الافتراضي true دائماً (موجه سطح المكتب/التطوير)، ويُعطَّل فقط بـ DEMO_MODE=false صراحةً
 * — وهو الوضع المطلوب لأي نشر شبكي فعلي.
 */
export function isDemoMode(): boolean {
  return String(process.env.DEMO_MODE ?? 'true').trim().toLowerCase() !== 'false';
}

/** الوضع الصارم: لا حسابات افتراضية ولا قبول بلا كلمة مرور. */
export function isStrictAuth(): boolean {
  return !isDemoMode();
}

/** هل يُسمح باستخدام وحدة تنفيذ SQL اليدوية؟ */
export function isSqlConsoleAllowed(): boolean {
  if (String(process.env.ALLOW_SQL_CONSOLE || '').trim().toLowerCase() === 'true') return true;
  // توافقاً مع وضع العرض الحالي: مسموحة للعرض والتطوير فقط، ومقفلة في الوضع الصارم
  return isDemoMode();
}

/** هل يبدو السر الممرر ضعيفاً/افتراضياً؟ */
export function isWeakSecret(secret: string | undefined | null): boolean {
  if (!secret) return true;
  const trimmed = secret.trim();
  if (trimmed.length < 16) return true;
  return WEAK_SECRETS.has(trimmed);
}

/**
 * سر توقيع JWT. في الوضع الصارم يُرفض الغياب أو القيم الضعيفة (خطأ قاتل)،
 * وفي وضع العرض يُستخدم بديل التطوير مع الحفاظ على التوافق.
 */
export function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (isWeakSecret(secret ?? undefined)) {
    if (isStrictAuth()) {
      throw new Error(
        'JWT_SECRET غير مضبوط أو ضعيف. الوضع الصارم (DEMO_MODE=false) يتطلب سراً عشوائياً قوياً (≥16 حرفاً).'
      );
    }
    return 'union-erp-dev-secret';
  }
  return secret as string;
}

/**
 * فحص أمني عند الإقلاع:
 * - وضع صارم → يلزم JWT_SECRET و ENCRYPTION_KEY قويين أو يُرفض الإقلاع.
 * - عرض إنتاجي (Electron) → تحذير بارز دون توقف (توافق تطبيق سطح المكتب).
 */
export function assertRuntimeSecurity(): void {
  if (isStrictAuth()) {
    getJwtSecret(); // يرمي خطأً إن كان غائباً/ضعيفاً
    if (isWeakSecret(process.env.ENCRYPTION_KEY)) {
      throw new Error(
        'ENCRYPTION_KEY غير مضبوط أو ضعيف. الوضع الصارم يتطلب مفتاح تشفير رئيسياً عشوائياً قوياً (≥16 حرفاً).'
      );
    }
    console.log('🔐 وضع الأمان الصارم مفعّل: يلزم JWT صالح لكل العمليات، وكلمات مرور bcrypt إلزامية.');
    return;
  }

  if (isProduction()) {
    console.warn(
      '⚠️⚠️ تعمل النسخة بوضع العرض التجريبي (DEMO_MODE=true): الدخول بترويسة x-user-id وبلا كلمات مرور إلزامية.\n' +
        '   مناسب لتطبيق سطح المكتب فقط. لأي نشر شبكي اضبط DEMO_MODE=false مع JWT_SECRET و ENCRYPTION_KEY قويين.'
    );
  }
}

/** تحذير لمرة واحدة عند قبول دخول تجريبي بلا كلمة مرور (وضع العرض فقط). */
export function warnDemoLoginOnce(): void {
  if (warnedDemoLogin) return;
  warnedDemoLogin = true;
  console.warn(
    '⚠️ [auth] وضع العرض: تم قبول دخول حساب بلا كلمة مرور مخزنة. فعّل الوضع الصارم (DEMO_MODE=false) وأضف passwordHash للحسابات قبل أي نشر شبكي.'
  );
}
