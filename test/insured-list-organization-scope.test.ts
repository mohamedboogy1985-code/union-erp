import assert from 'node:assert/strict';
import { once } from 'node:events';
import express from 'express';
import test from 'node:test';
import type { User, InsuredMember } from '../src/types/erp.js';
import { createInsuredListRouter } from '../server/routes/insured-list.routes.js';
import { installApiGuard } from '../server/security/api-guard.js';

const GENERAL_ORG = 'org-general';
const TRAINING_ORG = 'org-training-center';

const generalUser: User = {
  id: 'insured-general-reader',
  username: 'insured-general-reader',
  fullName: 'General Reader',
  email: 'insured-reader@example.invalid',
  role: 'HEAD_OF_ACCOUNTS',
  organizationId: GENERAL_ORG,
  allowedOrgIds: [GENERAL_ORG],
  isActive: true,
  maxApprovalLimit: 0,
};

const trainingUser: User = {
  ...generalUser,
  id: 'insured-training-reader',
  username: 'insured-training-reader',
  fullName: 'Training Reader',
  organizationId: TRAINING_ORG,
  allowedOrgIds: [TRAINING_ORG],
};

const member: InsuredMember = {
  number: '1001',
  name: 'General Insured Member',
  occupation: 'Engineer',
  dateOfBirth: '1980-01-01',
  maturityDate: '2040-01-01',
  age: '46',
  monthlyPremium: '100',
  maturityAmount: '100000',
};

test('insured-list PII is restricted to authenticated readers in org-general', async (t) => {
  const users = [generalUser, trainingUser];
  const authenticate = (req: express.Request) => users.find((user) => user.id === req.get('x-user-id')) ?? null;
  const app = express();
  app.use(express.json());
  installApiGuard(app, { resolveUser: authenticate });
  app.use('/api/insured-list', createInsuredListRouter({
    authenticate,
    isOrganizationActive: (organizationId) => organizationId === GENERAL_ORG || organizationId === TRAINING_ORG,
    listInsured: (query) => !query || member.name.includes(query) ? [member] : [],
  }));

  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => {
    server.close();
    await once(server, 'close');
  });
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const request = (path: string, userId?: string, init?: RequestInit) => fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      ...(init?.headers as Record<string, string> | undefined),
      ...(userId ? { 'x-user-id': userId } : {}),
    },
  });

  const anonymous = await request(`/api/insured-list?organizationId=${GENERAL_ORG}`);
  assert.equal(anonymous.status, 401);
  assert.equal((await anonymous.json() as any).code, 'AUTH_REQUIRED');

  const allowed = await request(`/api/insured-list?organizationId=${GENERAL_ORG}`, generalUser.id);
  assert.equal(allowed.status, 200);
  assert.deepEqual((await allowed.json() as InsuredMember[]).map((row) => row.name), [member.name]);

  const forgedRead = await request(`/api/insured-list?organizationId=${GENERAL_ORG}`, trainingUser.id);
  assert.equal(forgedRead.status, 403);

  const forgedSearch = await request('/api/insured-list/search', trainingUser.id, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ organizationId: GENERAL_ORG, q: 'General' }),
  });
  assert.equal(forgedSearch.status, 403, 'POST search uses the same organization authorization as the PII read');
});
