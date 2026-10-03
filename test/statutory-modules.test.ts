import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseSchemaDdl } from '../server/db/schema-drift.js';
import { once } from 'node:events';
import test from 'node:test';
import express from 'express';
import type { User } from '../src/types/erp.js';
import { chartStats, auditChartGrounding } from '../server/services/accounting-core.service.js';
import { financialStats, auditFinancialGrounding, checkFinancialAction } from '../server/services/financial.service.js';
import { statuteStats, auditRuleGrounding } from '../server/services/statute.service.js';
import { createFinancialRouter } from '../server/routes/financial.routes.js';
import { createDistributionRouter } from '../server/routes/distribution.routes.js';
import { createRegulationsRouter } from '../server/routes/regulations.routes.js';
import { createGeneralAssistantRouter } from '../server/routes/assistant.routes.js';
import { distributionDocumentView } from '../server/data/revenue-distribution-final.js';
import { erpStore } from '../server/db/store.js';
import { SCREENS } from '../src/config/portals.js';
import { OPERATOR_NAVIGATION } from '../src/config/operator-assistant-navigation.js';

const ADMIN: User = {
  id: 'statutory-test-admin',
  username: 'statutory-test-admin',
  fullName: 'Regression Administrator',
  email: 'statutory-test@example.invalid',
  role: 'SYSTEM_ADMIN',
  organizationId: 'org-general',
  allowedOrgIds: ['org-general'],
  isActive: true,
  maxApprovalLimit: Number.MAX_SAFE_INTEGER,
};

const COMMITTEE_USER: User = {
  id: 'statutory-test-committee',
  username: 'statutory-test-committee',
  fullName: 'Committee Accountant',
  email: 'committee-test@example.invalid',
  role: 'COMMITTEE_ACCOUNTANT',
  organizationId: 'org-eng-committee',
  allowedOrgIds: ['org-eng-committee'],
  isActive: true,
  maxApprovalLimit: 0,
};

const authenticatedUser = (req: express.Request): User | null => {
  if (req.get('x-user-id') === ADMIN.id) return ADMIN;
  if (req.get('x-user-id') === COMMITTEE_USER.id) return COMMITTEE_USER;
  return null;
};

const startApp = async (app: express.Express) => {
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const baseUrl = `http://127.0.0.1:${address.port}`;
  return {
    baseUrl,
    close: async () => {
      server.close();
      await once(server, 'close');
    },
  };
};

test('statutory module acceptance counts and source grounding', () => {
  const statute = statuteStats();
  assert.equal(statute.articles, 69);
  assert.equal(statute.rules, 113);
  assert.equal(auditRuleGrounding().ok, true);

  const financial = financialStats();
  assert.equal(financial.rules, 90);
  assert.equal(financial.thresholds, 53);
  assert.equal(auditFinancialGrounding().ok, true);

  const chart = chartStats();
  assert.equal(chart.accounts, 118);
  assert.equal(chart.uniqueCodes, 118);
  assert.equal(chart.sections, 9);
  assert.equal(auditChartGrounding().ok, true);
});

test('financial distribution checks preserve official article 2 and all four enforcement stages', () => {
  const official = {
    action: 'REVENUE_DISTRIBUTION',
    hasFederation: true,
    federationSharePercent: 10,
    committeeSharePercent: 60,
    generalSharePercent: 30,
  };
  const csvReference = {
    action: 'REVENUE_DISTRIBUTION',
    hasFederation: true,
    federationSharePercent: 10,
    printingSharePercent: 10,
    committeeSharePercent: 50,
    generalSharePercent: 30,
  };

  const legalPass = checkFinancialAction(official, { stage: 'ENFORCE' });
  assert.equal(legalPass.blocked.length, 0);
  assert.equal(legalPass.undetermined.some((rule) => rule.ruleId === 'FR-GATE-052'), false);

  const shadow = checkFinancialAction(csvReference, { stage: 'SHADOW' });
  assert.equal(shadow.blocked.length, 0);
  assert.ok(shadow.enforcement?.effects.some((effect) => effect.ruleId === 'FR-GATE-052' && effect.stage === 'SHADOW'));

  const audit = checkFinancialAction(csvReference, { stage: 'AUDIT' });
  assert.equal(audit.blocked.length, 0);
  assert.ok(audit.infos.some((item) => item.ruleId === 'FR-GATE-052'));

  const warn = checkFinancialAction(csvReference, { stage: 'WARN' });
  assert.equal(warn.blocked.length, 0);
  assert.ok(warn.warnings.some((item) => item.ruleId === 'FR-GATE-052'));

  const enforce = checkFinancialAction(csvReference, { stage: 'ENFORCE' });
  assert.ok(enforce.blocked.some((item) => item.ruleId === 'FR-GATE-052'));
});

test('CSV distribution display is authenticated and isolated from operating receipt rules', async (t) => {
  const app = express();
  app.use('/api/revenue-distribution', createDistributionRouter({ authenticate: authenticatedUser }));
  app.use('/api/financial', createFinancialRouter({ authenticate: authenticatedUser, enforcementStage: 'SHADOW' }));
  const server = await startApp(app);
  t.after(server.close);

  const unauthenticated = await fetch(`${server.baseUrl}/api/revenue-distribution/final`);
  assert.equal(unauthenticated.status, 401);

  const response = await fetch(`${server.baseUrl}/api/revenue-distribution/final`, {
    headers: { 'x-user-id': ADMIN.id },
  });
  assert.equal(response.status, 200);
  const reference = await response.json() as ReturnType<typeof distributionDocumentView>;
  assert.equal(reference.document.id, 'REV-DIST-FINAL');
  assert.equal(reference.openItems[0]?.status, 'PENDING');
  assert.equal(reference.percentages.find((item) => item.id === 'pct-committee')?.percent, 50);
  assert.match(reference.openItems[0]?.detailAr ?? '', /60% للجنة/);

  // The reference endpoint is read-only; it must not replace the live 50/30/20 or certificate rules.
  const operatingCodes = erpStore.distributionRules.map((rule) => rule.ruleCode).sort();
  assert.deepEqual(operatingCodes, ['DIST-CERT-V1', 'DIST-MEMB-V1']);
  assert.equal(erpStore.distributionRules.find((rule) => rule.ruleCode === 'DIST-MEMB-V1')?.lines
    .map((line) => line.percentage).join('/'), '50/30/20');

  const financialUnauthenticated = await fetch(`${server.baseUrl}/api/financial/rules`);
  assert.equal(financialUnauthenticated.status, 401);
  const financialResponse = await fetch(`${server.baseUrl}/api/financial/rules`, {
    headers: { 'x-user-id': ADMIN.id },
  });
  assert.equal(financialResponse.status, 200);
  const financialBody = await financialResponse.json() as { counts: { total: number } };
  assert.equal(financialBody.counts.total, 90);
});

test('assistant intent endpoints require auth/permissions and logs omit raw request text', async (t) => {
  const app = express();
  app.use(express.json());
  app.use('/api/assistant', createGeneralAssistantRouter({ authenticate: authenticatedUser }));
  const server = await startApp(app);
  t.after(server.close);

  for (const endpoint of ['/api/assistant/intents/schema', '/api/assistant/intents']) {
    const denied = await fetch(`${server.baseUrl}${endpoint}`);
    assert.equal(denied.status, 401, `${endpoint} must reject an unauthenticated request`);
  }

  const schemaResponse = await fetch(`${server.baseUrl}/api/assistant/intents/schema`, {
    headers: { 'x-user-id': ADMIN.id },
  });
  assert.equal(schemaResponse.status, 200);
  const schema = await schemaResponse.json() as { schemaVersion: string; functions: unknown[] };
  assert.equal(schema.schemaVersion, 'intent-v1');
  assert.ok(schema.functions.length > 0);

  const marker = 'PRIVATE_TEST_PAYLOAD_7f439d';
  const intentResponse = await fetch(`${server.baseUrl}/api/assistant/intent`, {
    method: 'POST',
    headers: { 'x-user-id': ADMIN.id, 'content-type': 'application/json' },
    body: JSON.stringify({ text: marker, execute: false, organizationId: ADMIN.organizationId }),
  });
  assert.equal(intentResponse.status, 200);

  const logResponse = await fetch(`${server.baseUrl}/api/assistant/intents`, {
    headers: { 'x-user-id': ADMIN.id },
  });
  assert.equal(logResponse.status, 200);
  const log = await logResponse.text();
  assert.ok(log.includes('count'));
  assert.equal(log.includes(marker), false, 'intent audit rows must never contain the submitted text');

  const ownerDenied = await fetch(`${server.baseUrl}/api/assistant/intent`, {
    method: 'POST',
    headers: { 'x-user-id': COMMITTEE_USER.id, 'content-type': 'application/json' },
    body: JSON.stringify({ text: 'مساعدة', execute: false, organizationId: ADMIN.organizationId }),
  });
  assert.equal(ownerDenied.status, 403, 'a user cannot submit an intent for another organization');
});

test('statutory modules are registered in portal navigation, assistant navigation, and App routes', () => {
  const requiredScreens = [
    'statutory',
    'financial-core',
    'accounting-core',
    'statutory-check',
    'statute',
    'regulations-library',
    'regulation-assistant',
  ];

  for (const id of requiredScreens) {
    assert.ok(SCREENS.some((screen) => screen.id === id), `${id} must be registered in portal screens`);
    assert.ok(OPERATOR_NAVIGATION.some((screen) => screen.id === id), `${id} must be allowed as an assistant destination`);
  }

  const appSource = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
  const layoutSource = readFileSync(new URL('../src/components/Layout.tsx', import.meta.url), 'utf8');
  assert.match(appSource, /const StatutoryHub = lazy\(/, 'the statutory hub must be mounted as an App route');
  assert.match(appSource, /currentTab === 'financial-core'/, 'the financial-core assistant route must render');
  assert.match(appSource, /currentTab === 'accounting-core'/, 'the accounting-core assistant route must render');
  assert.match(appSource, /currentTab === 'regulations-library'/, 'the regulations library route must render');
  assert.match(layoutSource, /'financial-core': 'statutory'/, 'legacy module IDs must resolve to the visible statutory navigation group');
  assert.match(layoutSource, /'regulations-library': 'regulation-budgets'/, 'regulations sub-tabs must resolve to the visible finance navigation group');
});

test('regulation library is served from the structured store and retains page metadata/schema sync', async (t) => {
  const app = express();
  app.use(express.json());
  app.use('/api/regulations', createRegulationsRouter({ authenticate: authenticatedUser }));
  const server = await startApp(app);
  t.after(server.close);

  const overviewResponse = await fetch(`${server.baseUrl}/api/regulations/overview`, {
    headers: { 'x-user-id': ADMIN.id },
  });
  assert.equal(overviewResponse.status, 200);
  const overview = await overviewResponse.json() as {
    stats: { sources: number; documents: number; statuteArticles: number; financialArticles: number; law35Chunks: number };
    inDatabase: { backend: string; sources: number; documents: number };
  };
  assert.deepEqual(overview.stats, {
    sources: 3,
    documents: 115,
    statuteArticles: 69,
    financialArticles: 17,
    law35Chunks: 29,
    ocrDocuments: 24,
  });
  assert.equal(overview.inDatabase.sources, 3);
  assert.equal(overview.inDatabase.documents, 115);

  const searchResponse = await fetch(`${server.baseUrl}/api/regulations/search?sourceId=src-financial&q=60%25`, {
    headers: { 'x-user-id': ADMIN.id },
  });
  const search = await searchResponse.json() as { documents: { id: string; textAr: string; pageNumber?: number | null }[] };
  const article2 = search.documents.find((document) => document.id === 'doc-financial-2');
  assert.ok(article2);
  assert.match(article2.textAr, /60% للجنة/);
  assert.equal(article2.pageNumber ?? null, null);

  const ocrDocument = erpStore.regulationDocuments.find((document) => document.sourceId === 'src-law35' && document.ocrDerived);
  assert.ok(ocrDocument?.pageNumber);
  const documentResponse = await fetch(`${server.baseUrl}/api/regulations/documents/${ocrDocument.id}`, {
    headers: { 'x-user-id': ADMIN.id },
  });
  const storedDocument = await documentResponse.json() as { pageNumber: number | null };
  assert.equal(storedDocument.pageNumber, ocrDocument.pageNumber);

  const chatResponse = await fetch(`${server.baseUrl}/api/regulations/chat`, {
    method: 'POST',
    headers: { 'x-user-id': ADMIN.id, 'content-type': 'application/json' },
    body: JSON.stringify({ question: 'إيه نص المادة (2) الخاصة بتوزيع حصيلة الاشتراكات؟' }),
  });
  const answer = await chatResponse.json() as { origin: string; answerAr: string; citations: { sourceCode: string }[] };
  assert.equal(answer.origin, 'ARTICLE_EXACT');
  assert.match(answer.answerAr, /60% للجنة النقابية/);
  assert.equal(answer.citations[0]?.sourceCode, 'FINANCIAL');

  const ddl = readFileSync(new URL('../server/db/pg-schema.sql', import.meta.url), 'utf8');
  const schemaTables = parseSchemaDdl(ddl);
  assert.equal(schemaTables.size, 20, 'the DDL parser must retain every PostgreSQL table across blank statement-breakpoint lines');
  assert.ok(schemaTables.get('users')?.some((column) => column.name === 'uid'));
  assert.equal(schemaTables.get('users')?.some((column) => column.name === 'code'), false, 'regulation columns must not be misattributed to users');
  assert.ok(schemaTables.get('regulation_sources')?.some((column) => column.name === 'code'));
  assert.ok(schemaTables.get('regulation_documents')?.some((column) => column.name === 'page_number'));
  const schemaSource = readFileSync(new URL('../src/db/schema.ts', import.meta.url), 'utf8');
  const persistenceSource = readFileSync(new URL('../server/db/postgresSync.ts', import.meta.url), 'utf8');
  assert.match(schemaSource, /integer\('page_number'\)/);
  assert.match(persistenceSource, /private async seedRegulations\(store: ERPStore\): Promise<void>/);
  assert.match(persistenceSource, /pageNumber: document\.pageNumber \?\? null/);
  assert.match(persistenceSource, /db\.select\(\)\.from\(schema\.regulationDocuments\)/);
  assert.match(persistenceSource, /onConflictDoUpdate/);
  assert.doesNotMatch(persistenceSource, /delete\(schema\.regulationDocuments|TRUNCATE/i);
});
