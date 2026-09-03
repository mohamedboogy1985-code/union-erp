import { erpStore } from '../db/store.js';
import type { AppNotification } from '../../src/types/erp.js';

/**
 * ===== IMPROVEMENTS.md 8.2: الإشعارات والتنبيهات =====
 * NotificationService: قناة إشعارات موحدة بثلاث قنوات:
 * - إشعارات داخل التطبيق (In-App) فورية
 * - بريد إلكتروني عبر مزود SMTP (عبر HTTP API قابل للتوصيل - Resend/SendGrid...)
 * - رسائل SMS عبر مزود قابل للتوصيل
 * القنوات الخارجية تُسجل في وضع "محاكاة" ما لم تُضبط مفاتيح المزود في البيئة.
 */

export interface NotificationChannelResult {
  channel: 'IN_APP' | 'EMAIL' | 'SMS';
  delivered: boolean;
  detail: string;
}

export class NotificationService {
  /**
   * إشعارات داخل التطبيق (تظهر فوراً في مركز الإشعارات حسب الدور)
   */
  public sendInAppNotification(
    notification: Omit<AppNotification, 'id' | 'timestamp' | 'isRead'>
  ): AppNotification {
    const created = erpStore.addNotification(notification);
    return created;
  }

  /**
   * إشعارات البريد الإلكتروني
   */
  public async sendEmailAlert(userEmail: string | undefined, subject: string, message: string): Promise<NotificationChannelResult> {
    if (!userEmail) {
      return { channel: 'EMAIL', delivered: false, detail: 'لا يوجد بريد إلكتروني مسجل للمستخدم' };
    }

    // مزود SMTP/HTTP قابل للتوصيل: عند ضبط EMAIL_API_URL و EMAIL_API_KEY يُرسل فعلياً
    const apiUrl = process.env.EMAIL_API_URL;
    const apiKey = process.env.EMAIL_API_KEY;

    if (apiUrl && apiKey) {
      try {
        const res = await fetch(apiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({
            to: userEmail,
            subject,
            text: message,
            from: process.env.EMAIL_FROM || 'no-reply@union-erp.org',
          }),
        });
        return {
          channel: 'EMAIL',
          delivered: res.ok,
          detail: res.ok ? `تم إرسال بريد إلى ${userEmail}` : `رفض مزود البريد الرمز ${res.status}`,
        };
      } catch (err: any) {
        return { channel: 'EMAIL', delivered: false, detail: `فشل إرسال البريد: ${err.message}` };
      }
    }

    // وضع المحاكاة: يوثق الإشعار في السجل دون إرسال خارجي
    console.log(`📧 [EMAIL-simulated] to=${userEmail} | ${subject}: ${message.slice(0, 120)}`);
    return { channel: 'EMAIL', delivered: true, detail: `إشعار بريد (وضع محاكاة) إلى ${userEmail}` };
  }

  /**
   * إشعارات SMS
   */
  public async sendSMSAlert(phone: string | undefined, message: string): Promise<NotificationChannelResult> {
    if (!phone) {
      return { channel: 'SMS', delivered: false, detail: 'لا يوجد رقم هاتف مسجل' };
    }

    const apiUrl = process.env.SMS_API_URL;
    const apiKey = process.env.SMS_API_KEY;

    if (apiUrl && apiKey) {
      try {
        const res = await fetch(apiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({ to: phone, message, sender: process.env.SMS_SENDER_ID || 'UnionERP' }),
        });
        return {
          channel: 'SMS',
          delivered: res.ok,
          detail: res.ok ? `تم إرسال SMS إلى ${phone}` : `رفض مزود الرسائل الرمز ${res.status}`,
        };
      } catch (err: any) {
        return { channel: 'SMS', delivered: false, detail: `فشل إرسال SMS: ${err.message}` };
      }
    }

    console.log(`📱 [SMS-simulated] to=${phone} | ${message.slice(0, 120)}`);
    return { channel: 'SMS', delivered: true, detail: `إشعار SMS (وضع محاكاة) إلى ${phone}` };
  }

  /**
   * تنبيه مالي متعدد القنوات (يُستخدم من Dashboard Alerts والمحرك المحاسبي)
   */
  public async sendFinancialAlert(params: {
    title: string;
    message: string;
    severity?: AppNotification['severity'];
    targetRole?: AppNotification['targetRole'];
    actionTab?: string;
    entityId?: string;
    email?: string;
    phone?: string;
  }): Promise<NotificationChannelResult[]> {
    const results: NotificationChannelResult[] = [];

    results.push({
      channel: 'IN_APP',
      delivered: true,
      detail: 'تم إنشاء إشعار داخلي',
    } as NotificationChannelResult);

    this.sendInAppNotification({
      title: params.title,
      message: params.message,
      type: 'SYSTEM',
      severity: params.severity || 'WARNING',
      targetRole: params.targetRole || 'ALL',
      organizationId: 'org-general',
      actionTab: params.actionTab,
      entityId: params.entityId,
    });

    if (params.email) {
      results.push(await this.sendEmailAlert(params.email, params.title, params.message));
    }
    if (params.phone) {
      results.push(await this.sendSMSAlert(params.phone, params.message));
    }

    return results;
  }
}

export const notificationService = new NotificationService();
