import express from 'express';
import type { NextFunction, Request, Response, Router } from 'express';
import type { User } from '../../src/types/erp.js';
import { can } from '../security/permissions.js';
import { distributionDocumentView } from '../data/revenue-distribution-final.js';

export interface DistributionRouterDeps {
  authenticate: (req: Request) => User | null;
}

/** Read-only view of the CSV-backed distribution reference; it is not the receipt policy. */
export const createDistributionRouter = (deps: DistributionRouterDeps): Router => {
  const router = express.Router();

  router.use((req: Request, res: Response, next: NextFunction) => {
    const user = deps.authenticate(req);
    if (!user) {
      res.status(401).json({ error: 'UNAUTHENTICATED', messageAr: 'الجلسة غير صالحة — أعد تسجيل الدخول.' });
      return;
    }
    if (!can(user, 'view:all')) {
      res.status(403).json({ error: 'FORBIDDEN', messageAr: 'يلزم امتلاك صلاحية الاطلاع على نموذج التوزيع المرجعي.' });
      return;
    }
    next();
  });

  router.get('/final', (_req: Request, res: Response) => {
    res.json(distributionDocumentView());
  });

  return router;
};
