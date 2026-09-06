import { Request, Response } from 'express';
import { erpStore } from '../db/store.js';
import { receiptsService } from '../services/receipts.service.js';
import { postgresManager } from '../db/postgresSync.js';
import { paginationService } from '../utils/pagination.js';
import { normalizeArabicText } from '../utils/arabic.js';
import { hashNationalId, maskNationalId, generateVerificationToken } from '../utils/crypto.js';
import type { User } from '../../src/types/erp.js';

export function registerReceiptsMembersRoutes(app: any, deps: { requirePermission: (req: Request, res: Response, perm: string) => User | null; getActiveUser: (req: Request) => User | null }) {
  app.get('/api/receipts', (req: Request, res: Response) => {
    const { organizationId, search } = req.query;
    let list = erpStore.receipts;
    if (organizationId) list = list.filter((r) => r.organizationId === organizationId);
    if (search) {
      const q = normalizeArabicText(String(search));
      list = list.filter((r) => normalizeArabicText(r.payerName).includes(q) || r.receiptNumber.includes(q));
    }
    if (req.query.page || req.query.limit || search) {
      return res.json(paginationService.paginate(list, paginationService.fromQuery(req.query as any)));
    }
    res.json(list.slice(0, 500));
  });

  app.post('/api/receipts', (req: Request, res: Response) => {
    const user = deps.requirePermission(req, res, 'receipts:issue');
    if (!user) return;
    try {
      const result = receiptsService.issueReceipt(req.body, user);
      postgresManager.persistReceipt(result.receipt);
      res.status(201).json(result);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.get('/api/members', (req: Request, res: Response) => {
    let list = erpStore.members;
    const q = typeof req.query.q === 'string' ? req.query.q : typeof req.query.search === 'string' ? req.query.search : '';
    if (q) {
      const norm = normalizeArabicText(String(q));
      list = list.filter((m) => normalizeArabicText(m.fullName).includes(norm) || m.membershipNumber.includes(norm));
    }
    if (req.query.page || req.query.limit || q) {
      return res.json(paginationService.paginate(list, paginationService.fromQuery(req.query as any)));
    }
    res.json(list.slice(0, 500));
  });

  app.post('/api/members', (req: Request, res: Response) => {
    const user = deps.requirePermission(req, res, 'members:manage');
    if (!user) return;
    const { fullName, nationalId, syndicateCommitteeId, companyName, profession, phone, email } = req.body;
    if (!fullName || !nationalId) return res.status(400).json({ error: 'الاسم والرقم القومي حقول إلزامية.' });
    const nHash = hashNationalId(nationalId);
    if (erpStore.members.some((m) => m.nationalIdHash === nHash)) return res.status(400).json({ error: 'هذا العضو مسجل مسبقاً بنفس الرقم القومي.' });
    const comm = erpStore.organizations.find((o) => o.id === syndicateCommitteeId) || erpStore.organizations[1];
    const count = erpStore.members.length + 1;
    const member = {
      id: `mem-${Date.now()}`,
      membershipNumber: `MEM-2026-${String(count + 500).padStart(5, '0')}`,
      fullName,
      nationalIdMasked: maskNationalId(nationalId),
      nationalIdHash: nHash,
      syndicateCommitteeId: comm.id,
      syndicateCommitteeName: comm.name,
      companyName,
      profession,
      status: 'ACTIVE' as const,
      joinDate: new Date().toISOString().split('T')[0],
      phone: phone || '',
      email: email || '',
    };
    erpStore.members.push(member);
    postgresManager.persistMember(member);
    erpStore.recordAudit(user.id, user.fullName, user.role, user.organizationId, 'MEMBER_REGISTERED', 'MEMBER', member.id, `تسجيل عضوية جديدة: [${fullName}]`);
    res.status(201).json(member);
  });

  app.post('/api/membership-certificates', (req: Request, res: Response) => {
    const user = deps.requirePermission(req, res, 'members:manage');
    if (!user) return;
    const { memberId } = req.body;
    const member = erpStore.members.find((m) => m.id === memberId);
    if (!member) return res.status(404).json({ error: 'العضو غير موجود.' });
    const count = erpStore.certificates.length + 1;
    const certNumber = `CERT-2026-${String(count + 9000).padStart(4, '0')}`;
    const token = generateVerificationToken('CERT');
    const issueDate = new Date().toISOString().split('T')[0];
    const expiry = new Date(); expiry.setFullYear(expiry.getFullYear() + 1);
    const expiryDate = expiry.toISOString().split('T')[0];
    const cert = {
      id: `cert-${Date.now()}`,
      certificateNumber: certNumber,
      memberId: member.id,
      memberName: member.fullName,
      membershipNumber: member.membershipNumber,
      issueDate,
      expiryDate,
      status: 'VALID' as const,
      verificationToken: token,
    };
    (member as any).lastCertificateExpiry = expiryDate;
    erpStore.certificates.unshift(cert);
    erpStore.recordAudit(user.id, user.fullName, user.role, user.organizationId, 'CERTIFICATE_ISSUED', 'CERTIFICATE', cert.id, `إصدار شهادة [${certNumber}] للعضو [${member.fullName}]`);
    res.status(201).json(cert);
  });

  app.get('/api/membership-certificates', (req: Request, res: Response) => {
    if (req.query.page || req.query.limit) {
      return res.json(paginationService.paginate(erpStore.certificates, paginationService.fromQuery(req.query as any)));
    }
    res.json(erpStore.certificates.slice(0, 200));
  });
}
