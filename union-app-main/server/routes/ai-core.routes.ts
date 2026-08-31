import { Request, Response } from 'express';
import { aiService } from '../services/ai.service.js';
import { erpStore } from '../db/store.js';
import { accountingService } from '../services/accounting.service.js';
import { postgresManager } from '../db/postgresSync.js';
import { cacheService } from '../services/cache.service.js';

interface AIRouteDeps {
  requirePermission: (req: Request, res: Response, permission: string) => any;
}

function sendSSE(res: Response, event: any): void {
  res.write(`data: ${JSON.stringify(event)}\n\n`);
}

export function registerAICoreRoutes(app: any, deps: AIRouteDeps): void {
  const { requirePermission } = deps;

  // محادثة عامة + اقتراح قيد محاسبي (لا يترحل إلا بعد تأكيد المستخدم عبر execute-entry)
  app.post('/api/ai/global-chat', async (req: Request, res: Response) => {
    const { message, organizationId, history } = req.body;
    if (!message || String(message).trim().length < 2) {
      return res.status(400).json({ error: 'يرجى كتابة طلب واضح (حرفان على الأقل).' });
    }
    try {
      const result = await aiService.globalAssistantChat(
        String(message),
        organizationId,
        Array.isArray(history) ? history : undefined
      );
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // نسخة مُتدفقة من محادثة المساعد (SSE) لتجربة أفضل عندما يستغرق الرد طويلاً
  app.post('/api/ai/global-chat/stream', async (req: Request, res: Response) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();
    const { message, organizationId, history } = req.body;
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
      const text = result.answer || 'تمت المعالجة.';
      const chunks = text.match(/.{1,28}/g) || [''];
      for (const chunk of chunks) {
        sendSSE(res, { chunk });
        await new Promise((r) => setTimeout(r, 16));
      }
      sendSSE(res, {
        done: true,
        proposedEntry: result.proposedEntry || null,
        confidence: result.confidence,
        sources: result.sources,
      });
      res.end();
    } catch (err: any) {
      sendSSE(res, { error: err.message || 'خطأ غير معروف' });
      res.end();
    }
  });

  // تأكيد المستخدم ثم إنشاء وترحيل القيد المقترح مع سجل تدقيق باسم "مساعد الذكاء الاصطناعي"
  app.post('/api/ai/execute-entry', (req: Request, res: Response) => {
    const user = requirePermission(req, res, 'journal:create');
    if (!user) return;
    const { proposedEntry, organizationId } = req.body || {};
    try {
      if (!proposedEntry || !Array.isArray(proposedEntry.lines) || proposedEntry.lines.length < 2) {
        throw new Error('بيانات القيد المقترح غير مكتملة.');
      }

      // تحويل أكواد الحسابات إلى معرّفات فعلية من دليل الحسابات النشط
      const lines = proposedEntry.lines.map((l: any) => {
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
          description: l.description || proposedEntry.description || '',
        };
      });

      const totalDebit = lines.reduce((s: number, l: any) => s + l.debit, 0);
      const totalCredit = lines.reduce((s: number, l: any) => s + l.credit, 0);
      if (Math.abs(totalDebit - totalCredit) > 0.001) {
        throw new Error(`القيد غير متوازن: المدين (${totalDebit}) لا يساوي الدائن (${totalCredit}).`);
      }

      const result = accountingService.createJournalEntry(
        {
          date: String(proposedEntry.date || new Date().toISOString().split('T')[0]),
          organizationId: organizationId || user.organizationId,
          description: String(proposedEntry.description || 'قيد مقترح من المساعد الذكي'),
          type: 'MANUAL',
          sourceDocumentType: 'AI_ASSISTANT',
          sourceDocumentId: `global-ai-${Date.now()}`,
          lines,
          userId: user.id,
        },
        user
      );

      postgresManager.persistJournalEntry(result.entry);
      cacheService.invalidatePrefix('cache:');

      erpStore.recordAudit(
        user.id,
        user.fullName,
        user.role,
        user.organizationId,
        'AI_ENTRY_CREATED',
        'JOURNAL_ENTRY',
        result.entry.id,
        `مساعد الذكاء الاصطناعي: إنشاء قيد مقترح [${result.entry.description}] بإجمالي ${totalDebit.toLocaleString()} ج.م للمستخدم ${user.fullName}`
      );

      // ترحيل مباشر بعد التأكيد: يعتبر تأكيد المستخدم اعتمادًا صريحًا لمسار الذكاء الاصطناعي
      if (result.entry.status !== 'APPROVED') {
        result.entry.status = 'APPROVED';
        result.entry.approvedBy = user.id;
        result.entry.updatedAt = new Date().toISOString();
        erpStore.recordAudit(
          user.id,
          user.fullName,
          user.role,
          user.organizationId,
          'AI_ENTRY_AUTO_APPROVED',
          'JOURNAL_ENTRY',
          result.entry.id,
          `مساعد الذكاء الاصطناعي: اعتماد آلي للقيد [${result.entry.description}] بعد تأكيد المستخدم صراحة (مسار الترحيل المباشر)`
        );
      }
      const posted = accountingService.postJournalEntry(result.entry.id, user);
      postgresManager.updateJournalEntryStatus(posted);

      erpStore.recordAudit(
        user.id,
        user.fullName,
        user.role,
        user.organizationId,
        'AI_ENTRY_POSTED',
        'JOURNAL_ENTRY',
        result.entry.id,
        `مساعد الذكاء الاصطناعي: ترحيل القيد [${result.entry.description}] بناءً على تأكيد المستخدم ${user.fullName}`
      );

      res.status(201).json({
        entry: posted,
        warnings: result.warnings || [],
        entryId: posted.id,
        entryNumber: posted.entryNumber,
        status: posted.status,
        message: `تم إنشاء القيد وترحيله بنجاح (رقم ${posted.entryNumber}) ومسجل في سجل التدقيق.`,
      });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });
}
