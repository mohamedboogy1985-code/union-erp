import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Request, Response, NextFunction } from 'express';
import { createRegulationLibraryView } from '../data/regulations-library.js';
import { erpStore } from '../db/store.js';
import { regulationChatService } from '../services/regulation-chat.service.js';
import { normalizeForSearch, regulationSearchHaystack } from '../utils/regulation-search.js';
import { can } from '../security/permissions.js';
import type { User } from '../../src/types/erp.js';

interface RegulationsRouterDeps {
  authenticate: (req: Request) => User | null;
}

/** مكتبة القراءة ومساعد اللوائح — مصادر ثابتة ومُدرجة، بلا كتابة أو تسجيل للسؤال الخام. */
export const createRegulationsRouter = (deps: RegulationsRouterDeps): Router => {
  const router = Router();
  const moduleDir = path.dirname(fileURLToPath(import.meta.url));
  const law35Dir = path.resolve(moduleDir, '../data/laws/law35-2018');

  router.use((req: Request, res: Response, next: NextFunction) => {
    const user = deps.authenticate(req);
    if (!user) {
      res.status(401).json({ error: 'UNAUTHENTICATED', messageAr: 'الجلسة غير صالحة — أعد تسجيل الدخول.' });
      return;
    }
    if (!can(user, 'view:all')) {
      res.status(403).json({ error: 'FORBIDDEN', messageAr: 'يلزم امتلاك صلاحية الاطلاع على اللوائح.' });
      return;
    }
    next();
  });

  router.get('/overview', (_req: Request, res: Response) => {
    const library = createRegulationLibraryView(erpStore.regulationSources, erpStore.regulationDocuments);
    res.json({
      ...library,
      inDatabase: {
        backend: erpStore.regulationStorageBackend,
        sources: erpStore.regulationSources.length,
        documents: erpStore.regulationDocuments.length,
      },
    });
  });

  router.get('/sources', (_req: Request, res: Response) => {
    res.json(erpStore.regulationSources);
  });

  router.get('/search', (req: Request, res: Response) => {
    const query = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 160) : '';
    const sourceId = req.query.sourceId ? String(req.query.sourceId).slice(0, 80) : null;
    const limit = Math.min(Math.max(Number(req.query.limit ?? 40) || 40, 1), 200);
    const needle = normalizeForSearch(query);
    const rows = erpStore.regulationDocuments
      .filter((doc) => (sourceId ? doc.sourceId === sourceId : true))
      .filter((doc) => {
        if (!needle) return true;
        const hay = normalizeForSearch(regulationSearchHaystack(doc));
        return needle.split(/\s+/).every((part) => hay.includes(part));
      })
      .slice(0, limit);
    // لا نعيد عبارة البحث مجدداً ولا نكتبها في سجل التدقيق.
    res.json({ sourceId, count: rows.length, documents: rows });
  });

  router.get('/documents/:id', (req: Request, res: Response) => {
    const doc = erpStore.regulationDocuments.find((row) => row.id === String(req.params.id));
    if (!doc) {
      res.status(404).json({ error: 'البند غير موجود في قاعدة اللوائح.' });
      return;
    }
    res.json(doc);
  });

  router.post('/chat', (req: Request, res: Response) => {
    const question = typeof req.body?.question === 'string' ? req.body.question.trim().slice(0, 500) : '';
    res.json(regulationChatService.ask(question));
  });

  router.get('/law35/pages/:page', (req: Request, res: Response) => {
    const page = Math.min(Math.max(Number(req.params.page) || 1, 1), 17);
    const file = path.join(law35Dir, `page-${String(page).padStart(2, '0')}.jpg`);
    if (!fs.existsSync(file)) {
      res.status(404).json({ error: 'صفحة الملف المرفق غير موجودة.' });
      return;
    }
    res.sendFile(file);
  });

  router.get('/law35/file', (_req: Request, res: Response) => {
    const file = path.join(law35Dir, 'قرار-35-لسنة-2018-اللائحة-التنفيذية.pdf');
    if (!fs.existsSync(file)) {
      res.status(404).json({ error: 'الملف المرفق غير موجود.' });
      return;
    }
    res.sendFile(file);
  });

  return router;
};
