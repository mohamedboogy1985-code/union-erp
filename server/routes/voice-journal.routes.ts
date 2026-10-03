import { Router } from "express";
import type { Request, Response } from "express";
import { erpStore } from "../db/store.js";
import { can } from "../security/permissions.js";
import { voiceJournalService } from "../services/voice-journal.service.js";
import type { VoiceDraft, VoiceDraftLine, VoiceDraftStatus } from "../services/voice-journal.service.js";
import type { User } from "../../src/types/erp.js";

interface VoiceJournalDeps {
  authenticate: (req: Request) => User | null;
  auditWrite?: (entry: Record<string, unknown>) => void;
}

/** مسارات وكيل القيود الصوتية: تحليل الإملاء → مسودة للمراجعة → اعتماد وترحيل. */
export const createVoiceJournalRouter = (deps: VoiceJournalDeps): Router => {
  const router = Router();

  const actor = (req: Request, res: Response, permission = "journal:create"): User | null => {
    const user = deps.authenticate(req);
    if (!user) {
      res.status(401).json({ error: "مطلوب تسجيل دخول صالح." });
      return null;
    }
    if (!can(user, permission)) {
      res.status(403).json({ error: `تحتاج صلاحية ${permission} لتنفيذ العملية.` });
      return null;
    }
    return user;
  };

  const organizationFor = (user: User, requested: unknown): string | null => {
    const organizationId = typeof requested === "string" && requested.trim()
      ? requested.trim().slice(0, 80)
      : user.organizationId;
    return organizationId === user.organizationId || user.allowedOrgIds.includes(organizationId) || can(user, "system:admin")
      ? organizationId
      : null;
  };

  const ownsOrReviews = (user: User, draft: VoiceDraft): boolean =>
    draft.createdBy === user.id || can(user, "journal:workflow");

  const safeLines = (value: unknown): VoiceDraftLine[] | undefined => {
    if (!Array.isArray(value)) return undefined;
    if (value.length > 40) throw new Error("لا يمكن أن تحتوي المسودة على أكثر من 40 سطراً.");
    return value.map((raw: any) => {
      const accountId = typeof raw?.accountId === "string" ? raw.accountId.slice(0, 80) : "";
      const account = erpStore.accounts.find((candidate) => candidate.id === accountId);
      if (!account) throw new Error("اختر حساباً موجوداً في دليل الحسابات لكل سطر.");
      const debit = Number(raw?.debit ?? 0);
      const credit = Number(raw?.credit ?? 0);
      if (!Number.isFinite(debit) || !Number.isFinite(credit) || debit < 0 || credit < 0 || (debit > 0 && credit > 0)) {
        throw new Error("قيم المدين والدائن غير صالحة في أحد السطور.");
      }
      return {
        accountId: account.id,
        accountCode: account.code,
        accountName: account.name,
        debit,
        credit,
        description: typeof raw?.description === "string" ? raw.description.trim().slice(0, 160) : "",
      };
    });
  };

  router.get("/status", (req: Request, res: Response) => {
    const user = actor(req, res, "journal:create");
    if (!user) return;
    res.json({ ready: true, demoMode: String(process.env.DEMO_MODE ?? "true").toLowerCase() !== "false" });
  });

  router.get("/drafts", (req: Request, res: Response) => {
    const user = actor(req, res, "journal:create");
    if (!user) return;
    const requestedStatus = typeof req.query.status === "string" ? req.query.status : undefined;
    const allowedStatuses: VoiceDraftStatus[] = ["PENDING_REVIEW", "APPROVED", "POSTED", "REJECTED"];
    const status = requestedStatus && allowedStatuses.includes(requestedStatus as VoiceDraftStatus)
      ? requestedStatus as VoiceDraftStatus
      : undefined;
    const visible = voiceJournalService.list(status).filter((draft) => ownsOrReviews(user, draft));
    res.json({
      drafts: visible,
      counts: {
        pending: voiceJournalService.list("PENDING_REVIEW").filter((draft) => ownsOrReviews(user, draft)).length,
        approved: voiceJournalService.list("APPROVED").filter((draft) => ownsOrReviews(user, draft)).length,
        posted: voiceJournalService.list("POSTED").filter((draft) => ownsOrReviews(user, draft)).length,
        rejected: voiceJournalService.list("REJECTED").filter((draft) => ownsOrReviews(user, draft)).length,
      },
    });
  });

  router.post("/parse", (req: Request, res: Response) => {
    const user = actor(req, res, "journal:create");
    if (!user) return;
    const organizationId = organizationFor(user, req.body?.organizationId);
    if (!organizationId) {
      res.status(403).json({ error: "غير مصرح باستخدام بيانات هذه الجهة." });
      return;
    }
    const transcript = typeof req.body?.transcript === "string" ? req.body.transcript.trim().slice(0, 2000) : "";
    try {
      const draft = voiceJournalService.parse({ transcript, user, organizationId });
      res.json(draft);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  router.post("/drafts", (req: Request, res: Response) => {
    const user = actor(req, res, "journal:create");
    if (!user) return;
    const body = req.body ?? {};
    const organizationId = organizationFor(user, body.organizationId);
    if (!organizationId) {
      res.status(403).json({ error: "غير مصرح باستخدام بيانات هذه الجهة." });
      return;
    }
    const transcript = typeof body.transcript === "string" ? body.transcript.trim().slice(0, 2000) : "";
    if (!transcript && !Array.isArray(body.lines)) {
      res.status(400).json({ error: "لا يوجد إملاء ولا سطور لحفظها." });
      return;
    }
    try {
      // نعيد بناء حقول الهوية والحالة على الخادم ولا نقبل createdBy/status/confidence من العميل.
      const parsed = voiceJournalService.parse({ transcript, user, organizationId });
      const lines = safeLines(body.lines) ?? parsed.lines;
      const draft: VoiceDraft = {
        ...parsed,
        date: typeof body.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.date) ? body.date : parsed.date,
        description: typeof body.description === "string" ? body.description.trim().slice(0, 160) : parsed.description,
        lines,
      };
      const saved = voiceJournalService.save(draft);
      deps.auditWrite?.({ action: "VOICE_DRAFT_SAVED", draftId: saved.id, lines: saved.lines.length, userId: user.id });
      res.status(201).json(saved);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  router.patch("/drafts/:id", (req: Request, res: Response) => {
    const user = actor(req, res, "journal:create");
    if (!user) return;
    const existing = voiceJournalService.find(req.params.id);
    if (!existing) {
      res.status(404).json({ error: "المسودة غير موجودة." });
      return;
    }
    if (!ownsOrReviews(user, existing)) {
      res.status(403).json({ error: "غير مصرح بتعديل هذه المسودة." });
      return;
    }
    try {
      const body = req.body ?? {};
      const updated = voiceJournalService.update(req.params.id, {
        ...(typeof body.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.date) ? { date: body.date } : {}),
        ...(typeof body.description === "string" ? { description: body.description.trim().slice(0, 160) } : {}),
        ...(Array.isArray(body.lines) ? { lines: safeLines(body.lines)! } : {}),
      });
      deps.auditWrite?.({ action: "VOICE_DRAFT_UPDATED", draftId: updated.id, lines: updated.lines.length, userId: user.id });
      res.json(updated);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  router.post("/drafts/:id/approve", (req: Request, res: Response) => {
    const user = actor(req, res, "journal:workflow");
    if (!user) return;
    const existing = voiceJournalService.find(req.params.id);
    if (!existing) {
      res.status(404).json({ error: "المسودة غير موجودة." });
      return;
    }
    const organizationId = organizationFor(user, req.body?.organizationId);
    if (!organizationId) {
      res.status(403).json({ error: "غير مصرح باستخدام بيانات هذه الجهة." });
      return;
    }
    try {
      const result = voiceJournalService.approveAndPost(req.params.id, user, organizationId);
      deps.auditWrite?.({ action: "VOICE_DRAFT_APPROVED", draftId: req.params.id, entryId: result.entry.id, posted: result.posted, userId: user.id });
      res.json(result);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  router.post("/drafts/:id/reject", (req: Request, res: Response) => {
    const user = actor(req, res, "journal:workflow");
    if (!user) return;
    const existing = voiceJournalService.find(req.params.id);
    if (!existing) {
      res.status(404).json({ error: "المسودة غير موجودة." });
      return;
    }
    try {
      const note = typeof req.body?.note === "string" ? req.body.note.trim().slice(0, 300) : undefined;
      const draft = voiceJournalService.reject(req.params.id, user, note);
      deps.auditWrite?.({ action: "VOICE_DRAFT_REJECTED", draftId: req.params.id, userId: user.id });
      res.json(draft);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  return router;
};
