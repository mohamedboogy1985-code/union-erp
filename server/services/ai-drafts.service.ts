/**
 * ============================================================================
 * P0-2 (docs/AI_AGENT_AUDIT.md): تأكيد مُلزِم من الخادم لمسودات الذكاء الاصطناعي
 * ============================================================================
 *
 * المشكلة التي تُعالجها هذه الوحدة:
 *   كان `/api/ai/execute-entry` يقبل أي `proposedEntry` يرسله المتصفح، ثم يعدّل
 *   `entry.status = 'APPROVED'` مباشرةً (متجاوزاً بوابة فصل المهام في
 *   `accountingService.approveJournalEntry`) ويرحّل القيد بنفس المستخدم. النتيجة:
 *     1) لا ربط بين ما اقترحه الخادم فعلاً وما نُفِّذ (يمكن تمرير أي قيود).
 *     2) لا منع لإعادة الاستخدام (نفس "التأكيد" يُنفَّذ مرات).
 *     3) لا فصل مهام: مُعدّ القيد = معتمده = مُرحّله.
 *
 * الحل:
 *   كل مسودة يصدرها الخادم تُخزَّن هنا ويُربط بها **رمز تأكيد موقّع** (HMAC-SHA256):
 *     - أحادي الاستخدام (يُستهلك عند التنفيذ، وتُرفض إعادة استخدامه).
 *     - قصير العمر (5 دقائق افتراضياً).
 *     - مرتبط بهوية من طلبه وببصمة SHA-256 لحمولة المسودة (أي تعديل يُكتشف).
 *   التنفيذ يعتمد **نسخة الخادم** من المسودة، لا نسخة العميل، ثم يمر عبر بوابات
 *   `accountingService` الحقيقية (create → submit → approve → post).
 *
 * ملاحظة تشغيلية: إن لم يُضبط `AI_DRAFT_SECRET` أو `JWT_SECRET` قوي، يُولَّد سرّ
 * عشوائي لكل عملية تشغيل — الرموز الصادرة قبل إعادة التشغيل تصبح غير صالحة
 * (عمرها دقائق أصلاً) ويُطلب من المستخدم إعادة الطلب. لا يُقبل سرّ ضعيف أبداً.
 */
import crypto from 'node:crypto';
import { isWeakSecret } from '../security/runtime-config.js';

export type AiDraftSource = 'GLOBAL_CHAT' | 'STREAM_CHAT' | 'AI_ACTION';
export type AiDraftProvenance = 'MODEL' | 'DETERMINISTIC';

export interface AiDraftRecord {
  draftId: string;
  /** من طلب المسودة — الرمز لا يعمل لغيره */
  userId: string;
  organizationId: string;
  source: AiDraftSource;
  provenance: AiDraftProvenance;
  /** المسودة كما أصدرها الخادم (مصدر الحقيقة عند التنفيذ) */
  draft: any;
  /** بصمة SHA-256 للحمولة المُعرَّفة قانونياً */
  payloadHash: string;
  createdAt: number;
  expiresAt: number;
  consumedAt?: number;
  consumedBy?: string;
  /** معرّف القيد الناتج بعد التنفيذ — للربط في سجل التدقيق */
  resultingEntryId?: string;
}

export interface IssueDraftParams {
  draft: any;
  userId: string;
  organizationId?: string;
  source?: AiDraftSource;
  provenance?: AiDraftProvenance;
}

export interface IssuedDraft {
  draftId: string;
  draftToken: string;
  payloadHash: string;
  expiresAt: number;
  ttlMs: number;
}

/** خطأ رمز تأكيد مُصنَّف — يُترجم مباشرةً إلى استجابة HTTP */
export class AiDraftTokenError extends Error {
  constructor(
    public readonly status: number,
    public readonly code:
      | 'DRAFT_TOKEN_MALFORMED'
      | 'DRAFT_TOKEN_INVALID'
      | 'DRAFT_TOKEN_EXPIRED'
      | 'DRAFT_TOKEN_UNKNOWN'
      | 'DRAFT_TOKEN_REUSED'
      | 'DRAFT_TOKEN_OWNER_MISMATCH'
      | 'DRAFT_MISMATCH'
      | 'DRAFT_INCOMPLETE',
    message: string
  ) {
    super(message);
    this.name = 'AiDraftTokenError';
  }
}

const MIN_TTL_MS = 30_000;
const MAX_TTL_MS = 30 * 60_000;
const DEFAULT_TTL_MS = 5 * 60_000;
const MAX_RECORDS = 500;

function resolveTtl(): number {
  const raw = Number(process.env.AI_DRAFT_TTL_MS);
  if (!Number.isFinite(raw) || raw <= 0) return DEFAULT_TTL_MS;
  return Math.min(MAX_TTL_MS, Math.max(MIN_TTL_MS, Math.round(raw)));
}

function resolveSigningSecret(): string {
  const explicit = process.env.AI_DRAFT_SECRET;
  if (explicit && !isWeakSecret(explicit)) return explicit;
  const jwt = process.env.JWT_SECRET;
  if (jwt && !isWeakSecret(jwt)) return jwt;
  // وضع العرض/التطوير: سرّ عشوائي لكل عملية تشغيل بدل قبول سرّ ضعيف أو إفشال الإقلاع.
  return `ephemeral:${crypto.randomBytes(32).toString('hex')}`;
}

/**
 * تسلسل قانوني مستقر (مفاتيح مرتبة + أرقام مُطبَّعة) حتى تتطابق البصمة
 * بغض النظر عن ترتيب الخصائص في JSON القادم من العميل أو من النموذج.
 */
function canonicalPart(value: any): string {
  if (value === null || value === undefined) return 'null';
  if (Array.isArray(value)) return `[${value.map(canonicalPart).join(',')}]`;
  if (typeof value === 'number') {
    return Number.isFinite(value) ? Number(value.toFixed(4)).toString() : 'null';
  }
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value !== 'object') return JSON.stringify(String(value));
  const keys = Object.keys(value).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalPart(value[key])}`).join(',')}}`;
}

export function canonicalDraftHash(draft: any): string {
  return crypto.createHash('sha256').update(canonicalPart(draft ?? null), 'utf8').digest('hex');
}

class AiDraftStore {
  private readonly records = new Map<string, AiDraftRecord>();
  private secret = resolveSigningSecret();
  private ttlMs = resolveTtl();

  /** عمر الرمز بالمللي ثانية — يُعرض في الواجهة كعدّاد صلاحية */
  public get tokenTtlMs(): number {
    return this.ttlMs;
  }

  private sign(body: string): string {
    return crypto.createHmac('sha256', this.secret).update(body, 'utf8').digest('base64url');
  }

  private evictExpired(now = Date.now()): void {
    for (const [id, record] of this.records) {
      if (record.expiresAt <= now) this.records.delete(id);
    }
    while (this.records.size > MAX_RECORDS) {
      const oldestKey = this.records.keys().next().value as string | undefined;
      if (!oldestKey) break;
      this.records.delete(oldestKey);
    }
  }

  /** إصدار رمز تأكيد لمسودة أصدرها الخادم */
  public issue(params: IssueDraftParams): IssuedDraft {
    this.evictExpired();
    const now = Date.now();
    const draftId = `aid-${crypto.randomBytes(9).toString('base64url')}`;
    const payloadHash = canonicalDraftHash(params.draft);
    const record: AiDraftRecord = {
      draftId,
      userId: String(params.userId),
      organizationId: String(params.organizationId || 'org-general'),
      source: params.source || 'GLOBAL_CHAT',
      provenance: params.provenance || 'MODEL',
      draft: params.draft,
      payloadHash,
      createdAt: now,
      expiresAt: now + this.ttlMs,
    };
    this.records.set(draftId, record);

    const body = JSON.stringify({
      v: 1,
      id: draftId,
      u: record.userId,
      h: payloadHash,
      exp: record.expiresAt,
    });
    const draftToken = `v1.${Buffer.from(body, 'utf8').toString('base64url')}.${this.sign(body)}`;

    return {
      draftId,
      draftToken,
      payloadHash,
      expiresAt: record.expiresAt,
      ttlMs: this.ttlMs,
    };
  }

  /** فحص الرمز دون استهلاكه (للاختبارات والتشخيص) */
  public verify(draftToken: string, user: { id: string }): AiDraftRecord {
    if (!draftToken || typeof draftToken !== 'string') {
      throw new AiDraftTokenError(400, 'DRAFT_TOKEN_MALFORMED', 'رمز تأكيد المسودة مفقود أو غير نصي.');
    }
    const parts = draftToken.split('.');
    if (parts.length !== 3 || parts[0] !== 'v1') {
      throw new AiDraftTokenError(400, 'DRAFT_TOKEN_MALFORMED', 'صيغة رمز تأكيد المسودة غير صحيحة.');
    }
    const [, rawBody, providedSignature] = parts;
    let body: string;
    let payload: any;
    try {
      body = Buffer.from(rawBody, 'base64url').toString('utf8');
      payload = JSON.parse(body);
    } catch {
      throw new AiDraftTokenError(400, 'DRAFT_TOKEN_MALFORMED', 'تعذّر قراءة حمولة رمز التأكيد.');
    }

    const expected = this.sign(body);
    const a = Buffer.from(expected);
    const b = Buffer.from(String(providedSignature || ''));
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      throw new AiDraftTokenError(401, 'DRAFT_TOKEN_INVALID', 'توقيع رمز التأكيد غير مطابق — لم يُصدره الخادم.');
    }

    const record = this.records.get(String(payload?.id || ''));
    if (!record) {
      throw new AiDraftTokenError(409, 'DRAFT_TOKEN_UNKNOWN', 'المسودة غير موجودة على الخادم (انتهت أو أُزيلت) — أعد طلب القيد.');
    }
    if (record.payloadHash !== String(payload?.h || '')) {
      throw new AiDraftTokenError(401, 'DRAFT_TOKEN_INVALID', 'بصمة المسودة في الرمز لا تطابق المسودة المخزّنة.');
    }
    if (record.expiresAt <= Date.now()) {
      this.records.delete(record.draftId);
      throw new AiDraftTokenError(409, 'DRAFT_TOKEN_EXPIRED', 'انتهت صلاحية تأكيد المسودة — أعد طلب القيد من المساعد.');
    }
    if (record.userId !== String(user?.id || '')) {
      throw new AiDraftTokenError(
        403,
        'DRAFT_TOKEN_OWNER_MISMATCH',
        'رمز التأكيد صادر لمستخدم آخر — لا يمكن تنفيذ مسودة باسم غير من طلبها.'
      );
    }
    if (record.consumedAt) {
      throw new AiDraftTokenError(409, 'DRAFT_TOKEN_REUSED', 'هذا الرمز استُخدم بالفعل — لا يُنفَّذ القيد المقترح مرتين.');
    }
    return record;
  }

  /** فحص + استهلاك أحادي الاستخدام */
  public consume(draftToken: string, user: { id: string; fullName?: string }): AiDraftRecord {
    const record = this.verify(draftToken, user);
    record.consumedAt = Date.now();
    record.consumedBy = user.id;
    return record;
  }

  /** ربط القيد الناتج بالمسودة (للتدقيق اللاحق) */
  public markResult(draftId: string, entryId: string): void {
    const record = this.records.get(draftId);
    if (record) record.resultingEntryId = entryId;
  }

  /** تأكيد أن حمولة العميل (إن أُرسلت) مطابقة لنسخة الخادم */
  public assertSamePayload(record: AiDraftRecord, clientDraft: any): void {
    if (clientDraft === undefined || clientDraft === null) return;
    const clientHash = canonicalDraftHash(clientDraft);
    if (clientHash !== record.payloadHash) {
      throw new AiDraftTokenError(
        409,
        'DRAFT_MISMATCH',
        'المسودة المرسلة من الواجهة تختلف عن المسودة التي أصدرها الخادم — لم يُنفَّذ أي قيد. أعد الطلب أو صحّح التعديل.'
      );
    }
  }

  public peek(draftId: string): AiDraftRecord | undefined {
    return this.records.get(draftId);
  }

  public size(): number {
    this.evictExpired();
    return this.records.size;
  }

  /** للاختبارات فقط: إعادة ضبط السرّ والعمر والحالة */
  public __resetForTests(options?: { ttlMs?: number; secret?: string }): void {
    this.records.clear();
    this.secret = options?.secret || resolveSigningSecret();
    this.ttlMs = options?.ttlMs ?? resolveTtl();
  }
}

export const aiDrafts = new AiDraftStore();
