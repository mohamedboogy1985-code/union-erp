import { Request, Response } from 'express';
import { etaService } from '../services/eta.service.js';

/**
 * ===== مسارات منظومة الفاتورة الإلكترونية (ETA) =====
 * الربط مع مصلحة الضرائب المصرية:
 *  - GET  /api/eta/status        حالة الربط (بيئة/تهيئة/محاكاة/مُصدِر)
 *  - GET  /api/eta/documents     المستندات المحفوظة محلياً
 *  - POST /api/eta/submit        إرسال مستند (يدوي)
 *  - POST /api/eta/submit/receipt/:id   سحب من إيصال
 *  - POST /api/eta/submit/journal/:id   سحب من قيد محاسبي
 *  - GET  /api/eta/submissions/:submissionId  استعلام عن حالة إرسال
 *  - POST /api/eta/documents/:uuid/verify     تحقق من مستند
 *  - GET  /api/eta/documents/:uuid/download   تنزيل المستند
 *  - POST /api/eta/documents/:uuid/cancel     إلغاء مستند
 */

export function registerEtaRoutes(app: any): void {
  app.get('/api/eta/status', (_req: Request, res: Response) => {
    res.json(etaService.getStatus());
  });

  app.get('/api/eta/documents', (_req: Request, res: Response) => {
    res.json(etaService.list());
  });

  // إرسال مستند مبنى يدوياً من الواجهة
  app.post('/api/eta/submit', (req: Request, res: Response) => {
    const user = (req.headers['x-user-id'] as string) || 'usr-mohamed-abdallah';
    const input = req.body?.document;
    if (!input || !input.docNumber || !Array.isArray(input.lines) || input.lines.length === 0) {
      return res.status(400).json({ error: 'بيانات المستند غير مكتملة.' });
    }
    try {
      etaService.submit(input, String(user)).then((r) => res.json(r)).catch((e: any) =>
        res.status(502).json({ error: e.message || 'تعذر الإرسال إلى منظومة الضرائب.' })
      );
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  app.post('/api/eta/submit/receipt/:id', (req: Request, res: Response) => {
    const user = (req.headers['x-user-id'] as string) || 'usr-mohamed-abdallah';
    etaService
      .submitFromReceipt({ id: req.params.id, ...(req.body || {}) }, String(user))
      .then((r) => res.json(r))
      .catch((e: any) => res.status(400).json({ error: e.message || 'تعذر تحويل الإيصال إلى فاتورة.' }));
  });

  app.post('/api/eta/submit/journal/:id', (req: Request, res: Response) => {
    const user = (req.headers['x-user-id'] as string) || 'usr-mohamed-abdallah';
    etaService
      .submitFromJournal({ id: req.params.id, ...(req.body || {}) }, String(user))
      .then((r) => res.json(r))
      .catch((e: any) => res.status(400).json({ error: e.message || 'تعذر تحويل القيد إلى فاتورة.' }));
  });

  app.get('/api/eta/submissions/:submissionId', async (req: Request, res: Response) => {
    try {
      const r = await etaService.querySubmission(req.params.submissionId);
      res.json(r);
    } catch (e: any) {
      res.status(502).json({ error: e.message || 'تعذر الاستعلام عن حالة الإرسال.' });
    }
  });

  app.post('/api/eta/documents/:uuid/verify', async (req: Request, res: Response) => {
    try {
      const r = await etaService.verify(req.params.uuid);
      res.json(r);
    } catch (e: any) {
      res.status(404).json({ error: e.message || 'المستند غير موجود.' });
    }
  });

  app.get('/api/eta/documents/:uuid/download', async (req: Request, res: Response) => {
    try {
      const { buffer, fileName, contentType } = await etaService.download(req.params.uuid);
      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
      res.send(buffer);
    } catch (e: any) {
      res.status(404).json({ error: e.message || 'المستند غير موجود.' });
    }
  });

  app.post('/api/eta/documents/:uuid/cancel', async (req: Request, res: Response) => {
    try {
      const reason = req.body?.reason || '';
      const r = await etaService.cancel(req.params.uuid, reason);
      res.json(r);
    } catch (e: any) {
      res.status(404).json({ error: e.message || 'المستند غير موجود.' });
    }
  });
}
