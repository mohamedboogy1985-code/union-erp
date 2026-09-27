import { Request, Response } from 'express';
import { aiService } from '../services/ai.service.js';
import { erpStore } from '../db/store.js';
import { accountingService } from '../services/accounting.service.js';
import { postgresManager } from '../db/postgresSync.js';
import { cacheService } from '../services/cache.service.js';
import { isSodExempt } from '../security/permissions.js';
import {
  aiDrafts,
  AiDraftTokenError,
  canonicalDraftHash,
  type AiDraftRecord,
} from '../services/ai-drafts.service.js';

interface AIRouteDeps {
  requirePermission: (req: Request, res: Response, permission: string) => any;
}

function sendSSE(res: Response, event: any): void {
  res.write(`data: ${JSON.stringify(event)}\n\n`);
}

export function registerAICoreRoutes(app: any, deps: AIRouteDeps): void {
  const { requirePermission } = deps;

  /**
   * P0-2 (docs/AI_AGENT_AUDIT.md): ربط كل مسودة يصدرها الخادم برمز تأكيد موقّع.
   * الرمز أحادي الاستخدام، عمره دقائق، مرتبط بهوية الطالب وببصمة حمولة المسودة،
   * وبدونه لا يقبل `/api/ai/execute-entry` أي تنفيذ.
   */
  function attachDraftToken(
    result: any,
    user: any,
    organizationId: string | undefined,
    source: 'GLOBAL_CHAT' | 'STREAM_CHAT'
  ) {
    if (!result || !result.proposedEntry || !Array.isArray(result.proposedEntry?.lines)) return result;
    try {
      const issued = aiDrafts.issue({
        draft: result.proposedEntry,
        userId: user.id,
        organizationId: organizationId || user.organizationId,
        source,
        provenance: result.provenance === 'DETERMINISTIC' ? 'DETERMINISTIC' : 'MODEL',
      });
      return {
        ...result,
        draftToken: issued.draftToken,
        draftId: issued.draftId,
        draftExpiresAt: issued.expiresAt,
        draftTtlMs: issued.ttlMs,
      };
    } catch (err: any) {
      console.error('[ai-drafts] تعذّر إصدار رمز تأكيد للمسودة:', err?.message);
      return {
        ...result,
        draftToken: undefined,
        draftError: 'تعذّر إصدار رمز تأكيد للمسودة على الخادم — لن يمكن تنفيذها قبل إعادة الطلب.',
      };
    }
  }

  // محادثة عامة + اقتراح قيد محاسبي (لا يترحل إلا بعد تأكيد المستخدم عبر execute-entry)
  app.post('/api/ai/global-chat', async (req: Request, res: Response) => {
    const { message, organizationId, history } = req.body;
    // P0-2: هوية الطالب مطلوبة لربط رمز التأكيد بها (كان المسار مفتوحاً بلا هوية)
    const actor = requirePermission(req, res, 'view:all');
    if (!actor) return;
    if (!message || String(message).trim().length < 2) {
      return res.status(400).json({ error: 'يرجى كتابة طلب واضح (حرفان على الأقل).' });
    }
    try {
      const result = await aiService.globalAssistantChat(
        String(message),
        organizationId,
        Array.isArray(history) ? history : undefined
      );
      res.json(attachDraftToken(result, actor, organizationId, 'GLOBAL_CHAT'));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // نسخة مُتدفقة من محادثة المساعد (SSE) لتجربة أفضل عندما يستغرق الرد طويلاً
  app.post('/api/ai/global-chat/stream', async (req: Request, res: Response) => {
    const { message, organizationId, history } = req.body;
    // P0-2: المصادقة قبل فتح بث SSE حتى يُرسل الرفض كاستجابة JSON واضحة
    const actor = requirePermission(req, res, 'view:all');
    if (!actor) return;

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    if (!message || String(message).trim().length < 2) {
      sendSSE(res, { error: 'يرجى كتابة طلب واضح (حرفان على الأقل).' });
      return res.end();
    }
    try {
      const result = await aiService.globalAssistantChat(
        String(message),
        organizationId,
        Array.isArray(history) ? history : undefined
      );
      const withToken = attachDraftToken(result, actor, organizationId, 'STREAM_CHAT');
      const text = withToken.answer || 'تمت المعالجة.';
      const chunks = text.match(/.{1,28}/g) || [''];
      for (const chunk of chunks) {
        sendSSE(res, { chunk });
        await new Promise((r) => setTimeout(r, 16));
      }
      sendSSE(res, {
        done: true,
        proposedEntry: withToken.proposedEntry || null,
        actionIntent: withToken.actionIntent || null,
        confidence: withToken.confidence,
        sources: withToken.sources,
        // P0-1/P0-2: مصدر النتيجة + رمز التأكيد المطلوب للتنفيذ
        provenance: withToken.provenance,
        draftToken: withToken.draftToken,
        draftId: withToken.draftId,
        draftExpiresAt: withToken.draftExpiresAt,
        draftError: withToken.draftError,
      });
      res.end();
    } catch (err: any) {
      sendSSE(res, { error: err.message || 'خطأ غير معروف' });
      res.end();
    }
  });

  /**
   * تأكيد المستخدم ثم إنشاء القيد المقترح — P0-2: تنفيذ مُقيَّد برمز الخادم
   * ---------------------------------------------------------------------------
   * 1) لا تنفيذ بلا `draftToken` صالح (موقّع، غير منتهٍ، غير مستخدم، وصاحبه الطالب).
   * 2) مصدر الحقيقة هو نسخة الخادم من المسودة؛ وإن أرسلت الواجهة نسخة فيجب أن
   *    تطابق بصمتها تماماً وإلا رُفض التنفيذ (DRAFT_MISMATCH).
   * 3) لا اعتماد ذاتي: تُستخدم بوابات accountingService الحقيقية، ومن لا يشملهم
   *    استثناء فصل المهام تنتهي مسودتهم بحالة SUBMITTED بانتظار اعتماد مخوّل.
   */
  app.post('/api/ai/execute-entry', (req: Request, res: Response) => {
    const user = requirePermission(req, res, 'journal:create');
    if (!user) return;
    const { draftToken, proposedEntry, organizationId } = req.body || {};

    if (!draftToken || typeof draftToken !== 'string') {
      erpStore.recordAudit(
        user.id,
        user.fullName,
        user.role,
        user.organizationId,
        'AI_DRAFT_TOKEN_REJECTED',
        'JOURNAL_ENTRY',
        req.path,
        'رفض تنفيذ مسودة AI: لم يُقدَّم رمز تأكيد (draftToken) صادر من الخادم',
        undefined,
        undefined,
        'BLOCKED'
      );
      return res.status(400).json({
        error: 'يلزم رمز تأكيد المسودة (draftToken) الصادر من الخادم لتنفيذ القيد المقترح.',
        code: 'DRAFT_TOKEN_REQUIRED',
      });
    }

    let record: AiDraftRecord;
    try {
      record = aiDrafts.consume(draftToken, user);
      // إن أرسلت الواجهة نسخة من المسودة فلا بد أن تطابق نسخة الخادم حرفياً
      aiDrafts.assertSamePayload(record, proposedEntry);
    } catch (err: any) {
      const typed =
        err instanceof AiDraftTokenError
          ? err
          : new AiDraftTokenError(400, 'DRAFT_TOKEN_INVALID', 'رمز تأكيد غير صالح.');
      erpStore.recordAudit(
        user.id,
        user.fullName,
        user.role,
        user.organizationId,
        'AI_DRAFT_TOKEN_REJECTED',
        'JOURNAL_ENTRY',
        req.path,
        `رفض تنفيذ مسودة AI: ${typed.code} — ${typed.message}`,
        undefined,
        undefined,
        'BLOCKED'
      );
      return res.status(typed.status).json({ error: typed.message, code: typed.code });
    }

    try {
      const serverDraft = record.draft;
      if (!serverDraft || !Array.isArray(serverDraft.lines) || serverDraft.lines.length < 2) {
        throw new AiDraftTokenError(409, 'DRAFT_INCOMPLETE', 'مسودة الخادم غير مكتملة (سطران على الأقل).');
      }

      // تحويل أكواد الحسابات إلى معرّفات فعلية من دليل الحسابات النشط
      const lines = serverDraft.lines.map((l: any) => {
        const acc = erpStore.getAccountByCode(String(l.accountCode));
        if (!acc) {
          throw new Error(`كود الحساب ${l.accountCode} غير موجود في دليل الحسابات النشط.`);
        }
        const requiresSubledger = acc.requiresSubledger || acc.code === '1301';
        const partyHint = String(
          l.partyName || l.subledgerPartyName || l.subledgerPartyNameInput || l.description || ''
        ).trim();
        return {
          accountId: acc.id,
          subledgerPartyNameInput: requiresSubledger ? partyHint : undefined,
          debit: Number(l.debit) || 0,
          credit: Number(l.credit) || 0,
          description: l.description || serverDraft.description || '',
        };
      });

      const totalDebit = lines.reduce((s: number, l: any) => s + l.debit, 0);
      const totalCredit = lines.reduce((s: number, l: any) => s + l.credit, 0);
      if (Math.abs(totalDebit - totalCredit) > 0.001) {
        throw new Error(`القيد غير متوازن: المدين (${totalDebit}) لا يساوي الدائن (${totalCredit}).`);
      }

      const result = accountingService.createJournalEntry(
        {
          date: String(serverDraft.date || new Date().toISOString().split('T')[0]),
          organizationId: organizationId || user.organizationId,
          description: String(serverDraft.description || 'قيد مقترح من المساعد الذكي'),
          type: 'MANUAL',
          sourceDocumentType: 'AI_ASSISTANT',
          // P0-2: معرّف المسودة بدل طابع زمني — يربط القيد برمز التأكيد في سجل التدقيق
          sourceDocumentId: record.draftId,
          lines,
          userId: user.id,
        },
        user
      );

      postgresManager.persistJournalEntry(result.entry);
      cacheService.invalidatePrefix('cache:');
      aiDrafts.markResult(record.draftId, result.entry.id);

      const provenanceLabel = record.provenance === 'MODEL' ? 'نموذج ذكاء اصطناعي' : 'قواعد محلية حتمية';
      erpStore.recordAudit(
        user.id,
        user.fullName,
        user.role,
        user.organizationId,
        'AI_ENTRY_CREATED',
        'JOURNAL_ENTRY',
        result.entry.id,
        `مساعد الذكاء الاصطناعي: إنشاء قيد من مسودة مؤكَّدة [${record.draftId}] مصدرها ${provenanceLabel} — [${result.entry.description}] بإجمالي ${totalDebit.toLocaleString()} ج.م`
      );

      // ===== فصل المهام (SoD) =====
      // مُعدّ المسودة لا يعتمدها ويرحّلها بنفسه إلا إن كان معفىً (SYSTEM_ADMIN أو مُدرَج
      // في قائمة الاستثناء). المسار يمر عبر approveJournalEntry/postJournalEntry الحقيقيتين
      // بدل تعديل الحالة يدوياً كما كان سابقاً.
      if (!isSodExempt(user)) {
        const submitted =
          result.entry.status === 'DRAFT'
            ? accountingService.submitJournalEntry(result.entry.id, user)
            : result.entry;
        postgresManager.updateJournalEntryStatus(submitted);
        erpStore.recordAudit(
          user.id,
          user.fullName,
          user.role,
          user.organizationId,
          'AI_ENTRY_SUBMITTED_FOR_APPROVAL',
          'JOURNAL_ENTRY',
          submitted.id,
          `مسودة AI [${record.draftId}]: قُدّم القيد [${submitted.entryNumber}] للاعتماد — فصل المهام يمنع [${user.fullName}] من اعتماد ما أعدّه بنفسه`
        );
        return res.status(201).json({
          success: true,
          requiresApproval: true,
          entry: submitted,
          entryId: submitted.id,
          entryNumber: submitted.entryNumber,
          status: submitted.status,
          warnings: result.warnings || [],
          draftId: record.draftId,
          provenance: record.provenance,
          message:
            `تم إنشاء القيد (${submitted.entryNumber}) وتقديمه للاعتماد. فصل المهام يمنع من أعدّ القيد عبر المساعد من اعتماده وترحيله بنفسه — ينتظر اعتماد المدير المالي أو من يملك صلاحية الاعتماد.`,
        });
      }

      let posted;
      try {
        const approved = accountingService.approveJournalEntry(result.entry.id, user);
        posted = accountingService.postJournalEntry(approved.id, user);
      } catch (workflowError: any) {
        // معفىً من فصل المهام لكن دوره غير مخوّل للاعتماد → نُعيد القيد لمسار التقديم
        const submitted =
          result.entry.status === 'DRAFT'
            ? accountingService.submitJournalEntry(result.entry.id, user)
            : result.entry;
        postgresManager.updateJournalEntryStatus(submitted);
        erpStore.recordAudit(
          user.id,
          user.fullName,
          user.role,
          user.organizationId,
          'AI_ENTRY_SUBMITTED_FOR_APPROVAL',
          'JOURNAL_ENTRY',
          submitted.id,
          `مسودة AI [${record.draftId}]: تعذّر الاعتماد الذاتي (${workflowError?.message}) — قُدّم القيد [${submitted.entryNumber}] لاعتماد مخوّل`
        );
        return res.status(201).json({
          success: true,
          requiresApproval: true,
          entry: submitted,
          entryId: submitted.id,
          entryNumber: submitted.entryNumber,
          status: submitted.status,
          warnings: result.warnings || [],
          draftId: record.draftId,
          provenance: record.provenance,
          message: `تم إنشاء القيد (${submitted.entryNumber}) لكنه يحتاج اعتماد مستخدم مخوّل: ${workflowError?.message || 'لا تملك صلاحية الاعتماد'}`,
        });
      }

      postgresManager.updateJournalEntryStatus(posted);
      erpStore.recordAudit(
        user.id,
        user.fullName,
        user.role,
        user.organizationId,
        'AI_ENTRY_POSTED',
        'JOURNAL_ENTRY',
        posted.id,
        `مساعد الذكاء الاصطناعي: اعتماد وترحيل القيد [${posted.entryNumber}] من مسودة مؤكَّدة [${record.draftId}] بواسطة [${user.fullName}] (مستثنى من فصل المهام: ${user.role})`
      );

      res.status(201).json({
        success: true,
        requiresApproval: false,
        entry: posted,
        warnings: result.warnings || [],
        entryId: posted.id,
        entryNumber: posted.entryNumber,
        status: posted.status,
        draftId: record.draftId,
        provenance: record.provenance,
        message: `تم إنشاء القيد وترحيله بنجاح (رقم ${posted.entryNumber}) ومسجل في سجل التدقيق.`,
      });
    } catch (err: any) {
      const typed = err instanceof AiDraftTokenError ? err : null;
      erpStore.recordAudit(
        user.id,
        user.fullName,
        user.role,
        user.organizationId,
        'AI_ENTRY_EXECUTION_FAILED',
        'JOURNAL_ENTRY',
        record.draftId,
        `فشل تنفيذ مسودة AI [${record.draftId}]: ${err?.message || 'خطأ غير معروف'}`,
        undefined,
        undefined,
        'BLOCKED'
      );
      res.status(typed ? typed.status : 400).json({
        error: err.message,
        ...(typed ? { code: typed.code } : {}),
      });
    }
  });
}

/** يُصدَّر للاختبارات: بصمة الحمولة المستخدمة في مطابقة مسودة الخادم والعميل */
export { canonicalDraftHash };
