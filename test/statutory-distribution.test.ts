import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { once } from 'node:events';
import express from 'express';
import test from 'node:test';
import type { User } from '../src/types/erp.js';
import { parseSchemaDdl } from '../server/db/schema-drift.js';
import { STATUTORY_DISTRIBUTION_MODELS } from '../server/data/statutory-distribution-models.js';
import { createStatutoryUiRouter } from '../server/routes/statutory-ui.routes.js';
import type { StatutoryDistributionModelsResponse } from '../src/types/erp.distribution.js';

const ADMIN: User = {
  id: 'distribution-model-test-admin',
  username: 'distribution-model-test-admin',
  fullName: 'Distribution Model Test Admin',
  email: 'distribution-model-test@example.invalid',
  role: 'SYSTEM_ADMIN',
  organizationId: 'org-general',
  allowedOrgIds: ['org-general'],
  isActive: true,
  maxApprovalLimit: Number.MAX_SAFE_INTEGER,
};

const startApp = async (app: express.Express) => {
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: async () => {
      server.close();
      await once(server, 'close');
    },
  };
};

test('the Excel Article 2 models preserve source amounts, bases, and unresolved fields', () => {
  assert.equal(STATUTORY_DISTRIBUTION_MODELS.length, 2);
  const [company, professional] = STATUTORY_DISTRIBUTION_MODELS;
  assert.ok(company && professional);

  for (const model of STATUTORY_DISTRIBUTION_MODELS) {
    assert.equal(model.articleNo, '2');
    assert.equal(model.isActive, true);
    assert.equal(model.postingEnabled, false, 'activation must not guess unresolved COA account mappings');
    assert.equal(
      model.shareConfig.generalPercent + model.shareConfig.committeePercent + model.shareConfig.federationPercent,
      100,
    );
    const sourceBytes = readFileSync(model.sourcePath);
    assert.equal(createHash('sha256').update(sourceBytes).digest('hex'), model.sourceSha256);
    assert.equal(model.rows.length, model.sourceRowCount);
  }

  assert.equal(company.modelKind, 'COMPANY_COMMITTEES');
  assert.equal(company.rows.length, 58);
  assert.equal(company.shareConfig.generalPercent, 30);
  assert.equal(company.shareConfig.committeePercent, 60);
  assert.equal(company.shareConfig.federationPercent, 10);
  assert.equal(company.totals?.memberCount, 91_136);
  assert.equal(company.totals?.grossCollected, 455_680);
  assert.equal(company.totals?.generalShare, 136_704);
  assert.equal(company.totals?.committeeShare, 273_408);
  assert.equal(company.totals?.federationShare, 45_568);
  assert.equal(company.totals?.grossCollected,
    (company.totals?.generalShare ?? 0) + (company.totals?.committeeShare ?? 0) + (company.totals?.federationShare ?? 0));

  assert.equal(professional.modelKind, 'PROFESSIONAL_COMMITTEES');
  assert.equal(professional.rows.length, 54);
  assert.equal(professional.shareConfig.educationSupportPerReceipt, 5);
  assert.equal(professional.rows.filter((row) => row.calculated).length, 1);
  const calculated = professional.rows.find((row) => row.calculated);
  assert.ok(calculated);
  assert.equal(calculated.receiptsCount, 1_000);
  assert.equal(calculated.receiptFee, 40);
  assert.equal(calculated.grossCollected, 40_000);
  assert.equal(calculated.educationSupport, 5_000);
  assert.equal(calculated.distributionBase, 35_000);
  assert.equal(calculated.generalShare, 10_500);
  assert.equal(calculated.committeeShare, 21_000);
  assert.equal(calculated.federationShare, 3_500);
  assert.equal(calculated.generalCollected, 15_500);
  assert.equal(calculated.printingShare, null);
  assert.equal(professional.totals, null, 'the workbook does not publish a professional-committee total');
  assert.ok(professional.openItemsAr.some((item) => item.includes('المطبوعات')));
  assert.ok(professional.rows.filter((row) => !row.calculated).every((row) => row.grossCollected === null && row.generalShare === null));
});

test('statutory distribution SQL schema stores enabled model metadata and source rows without account guesses', () => {
  const ddl = readFileSync('server/db/pg-schema.sql', 'utf8');
  const persistence = readFileSync('server/services/statutory-distribution-models.service.ts', 'utf8');
  const tables = parseSchemaDdl(ddl);
  assert.match(persistence, /isActive:\s*true/, 'the Excel reference models are activated during SQL seeding');
  assert.match(persistence, /postingEnabled:\s*false/, 'activation must not enable unresolved ledger posting');
  assert.match(persistence, /onConflictDoUpdate/, 'restarts refresh and activate the configured source-backed records');
  assert.ok(tables.has('statutory_distribution_models'));
  assert.ok(tables.has('statutory_distribution_model_rows'));
  const modelColumns = new Set((tables.get('statutory_distribution_models') ?? []).map((column) => column.name));
  const rowColumns = new Set((tables.get('statutory_distribution_model_rows') ?? []).map((column) => column.name));
  for (const column of ['is_active', 'posting_enabled', 'source_sha256', 'share_config', 'totals']) {
    assert.ok(modelColumns.has(column), `model table must include ${column}`);
  }
  for (const column of ['member_count', 'receipt_fee', 'education_support', 'distribution_base', 'general_share', 'committee_share', 'federation_share', 'printing_share', 'source_formulas']) {
    assert.ok(rowColumns.has(column), `row table must include ${column}`);
  }
  assert.equal(rowColumns.has('target_account_id'), false, 'unresolved COA mappings must not be fabricated');
});

test('the statutory models page and API are connected through the approved /api/statutory path', () => {
  const hub = readFileSync('src/pages/StatutoryHub.tsx', 'utf8');
  const apiClient = readFileSync('src/services/statutory-api.ts', 'utf8');
  const server = readFileSync('server.ts', 'utf8');
  const persistence = readFileSync('server/db/postgresSync.ts', 'utf8');
  assert.match(hub, /activeTab === 'distribution'/);
  assert.match(hub, /StatutoryDistributionModelsBoard/);
  assert.match(apiClient, /\/api\/statutory\/distribution-models/);
  assert.match(server, /app\.use\('\/api\/statutory'/);
  assert.doesNotMatch(server, /\/api\/statutory-ui/);
  assert.match(persistence, /ensureStatutoryDistributionTables\(\)/);
  assert.match(persistence, /seedStatutoryDistributionModels\(\)/);
});

test('the /api/statutory distribution-model route remains authenticated and serves its configured SQL view', async (t) => {
  const app = express();
  const payload: StatutoryDistributionModelsResponse = {
    storageBackend: 'postgres',
    models: STATUTORY_DISTRIBUTION_MODELS,
  };
  app.use('/api/statutory', createStatutoryUiRouter({
    authenticate: (req) => req.get('x-user-id') === ADMIN.id ? ADMIN : null,
    getDistributionModels: async () => payload,
  }));
  const server = await startApp(app);
  t.after(server.close);

  const denied = await fetch(`${server.baseUrl}/api/statutory/distribution-models`);
  assert.equal(denied.status, 401);

  const response = await fetch(`${server.baseUrl}/api/statutory/distribution-models`, {
    headers: { 'x-user-id': ADMIN.id },
  });
  assert.equal(response.status, 200);
  const result = await response.json() as StatutoryDistributionModelsResponse;
  assert.equal(result.storageBackend, 'postgres');
  assert.deepEqual(result.models.map((model) => model.id), STATUTORY_DISTRIBUTION_MODELS.map((model) => model.id));
});
