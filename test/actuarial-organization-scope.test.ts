import assert from 'node:assert/strict';
import { once } from 'node:events';
import express from 'express';
import test from 'node:test';
import type { ActuarialFund, User } from '../src/types/erp.js';
import { createActuarialRouter } from '../server/routes/actuarial.routes.js';
import { installApiGuard } from '../server/security/api-guard.js';

const GENERAL_ORG = 'org-general';
const TRAINING_ORG = 'org-training-center';

const generalUser: User = {
  id: 'actuarial-general-reader',
  username: 'actuarial-general-reader',
  fullName: 'General Reader',
  email: 'reader@example.invalid',
  role: 'HEAD_OF_ACCOUNTS',
  organizationId: GENERAL_ORG,
  allowedOrgIds: [GENERAL_ORG],
  isActive: true,
  maxApprovalLimit: 0,
};

const trainingUser: User = {
  ...generalUser,
  id: 'actuarial-training-reader',
  username: 'actuarial-training-reader',
  fullName: 'Training Reader',
  organizationId: TRAINING_ORG,
  allowedOrgIds: [TRAINING_ORG],
};

const systemAdmin: User = {
  ...generalUser,
  id: 'actuarial-system-admin',
  username: 'actuarial-system-admin',
  role: 'SYSTEM_ADMIN',
  maxApprovalLimit: Number.MAX_SAFE_INTEGER,
};

const generalFund: ActuarialFund = {
  id: 'fund-general-test',
  code: 'FND-GEN-TEST',
  name: 'General Union Fund',
  type: 'PENSION',
  currentReserve: 1_000_000,
  targetReserve: 1_200_000,
  actuarialSurplusDeficit: -200_000,
  discountRate: 8.5,
  inflationRate: 12,
  activeMembersCount: 100,
  beneficiariesCount: 20,
  monthlyInflow: 50_000,
  monthlyOutflow: 40_000,
  solvencyRatio: 83.3,
  status: 'WARNING',
  organizationId: GENERAL_ORG,
};

const trainingFund: ActuarialFund = { ...generalFund, id: 'fund-training-test', organizationId: TRAINING_ORG };

test('actuarial funds and simulations stay in the general-union tenant', async (t) => {
  const users = [generalUser, trainingUser, systemAdmin];
  const authenticate = (req: express.Request) => users.find((user) => user.id === req.get('x-user-id')) ?? null;
  const activeOrganizations = new Set([GENERAL_ORG, TRAINING_ORG]);
  const requestedScopes: string[] = [];

  const app = express();
  app.use(express.json());
  installApiGuard(app, { resolveUser: authenticate });
  app.use('/api/actuarial', createActuarialRouter({
    authenticate,
    isOrganizationActive: (organizationId) => activeOrganizations.has(organizationId),
    listFunds: async (organizationId) => {
      requestedScopes.push(organizationId);
      return [generalFund, trainingFund].filter((fund) => fund.organizationId === organizationId);
    },
    createFund: async (organizationId, input) => ({
      ...generalFund,
      id: 'created-fund-test',
      organizationId,
      name: String(input.name ?? 'New fund'),
    }),
    updateFund: async (organizationId, id) =>
      id === generalFund.id && organizationId === generalFund.organizationId,
    simulate: async (organizationId, input) => {
      const fund = [generalFund, trainingFund].find(
        (candidate) => candidate.id === input.fundId && candidate.organizationId === organizationId,
      );
      if (!fund) return null;
      return {
        fundId: fund.id,
        fundName: fund.name,
        horizonYears: Number(input.horizonYears ?? 10),
        depletionYear: null,
        sustainableYears: Number(input.horizonYears ?? 10),
        recommendedContributionIncrease: 0,
        recommendedReserveInjection: 0,
        summaryStatus: 'HEALTHY',
        actuarialOpinion: 'test projection',
        projections: [],
      };
    },
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
      ...(init?.headers ?? {}),
      ...(userId ? { 'x-user-id': userId } : {}),
    },
  });

  const noIdentity = await request(`/api/actuarial/funds?organizationId=${GENERAL_ORG}`);
  assert.equal(noIdentity.status, 401);
  assert.equal((await noIdentity.json() as any).code, 'AUTH_REQUIRED');

  const allowed = await request(`/api/actuarial/funds?organizationId=${GENERAL_ORG}`, generalUser.id);
  assert.equal(allowed.status, 200);
  assert.deepEqual((await allowed.json() as ActuarialFund[]).map((fund) => fund.id), [generalFund.id]);
  assert.deepEqual(requestedScopes, [GENERAL_ORG], 'the repository receives only the authorized organization scope');

  const forgedTenant = await request(`/api/actuarial/funds?organizationId=${GENERAL_ORG}`, trainingUser.id);
  assert.equal(forgedTenant.status, 403, 'a client organization id cannot create a grant');

  const wrongActuarialTenant = await request(`/api/actuarial/funds?organizationId=${TRAINING_ORG}`, systemAdmin.id);
  assert.equal(wrongActuarialTenant.status, 403, 'actuarial records remain explicitly assigned to org-general');

  const crossTenantProjection = await request('/api/actuarial/simulate', generalUser.id, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ organizationId: GENERAL_ORG, fundId: trainingFund.id }),
  });
  assert.equal(crossTenantProjection.status, 404, 'a foreign fund id cannot be simulated in the general-union context');

  const allowedProjection = await request('/api/actuarial/simulate', generalUser.id, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ organizationId: GENERAL_ORG, fundId: generalFund.id, horizonYears: 5 }),
  });
  assert.equal(allowedProjection.status, 200);
  assert.equal((await allowedProjection.json() as any).fundId, generalFund.id);

  const deniedWrite = await request('/api/actuarial/funds', generalUser.id, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ organizationId: GENERAL_ORG, name: 'Unauthorized fund' }),
  });
  assert.equal(deniedWrite.status, 403, 'ordinary readers cannot create funds');

  const authorizedWrite = await request('/api/actuarial/funds', systemAdmin.id, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ organizationId: GENERAL_ORG, name: 'Authorized fund' }),
  });
  assert.equal(authorizedWrite.status, 201);
  assert.equal((await authorizedWrite.json() as ActuarialFund).organizationId, GENERAL_ORG);
});
