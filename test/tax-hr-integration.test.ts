import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { once } from 'node:events';
import express from 'express';
import test from 'node:test';
import type { User } from '../src/types/erp.js';
import { OPERATOR_NAVIGATION } from '../src/config/operator-assistant-navigation.js';
import { SCREENS, screensForPortal } from '../src/config/portals.js';
import { SCREEN_WRITE_PERMISSIONS } from '../src/types/operator-assistant.js';
import { createTaxRouter } from '../server/routes/tax.routes.js';

const ADMIN: User = {
  id: 'tax-hr-integration-admin',
  username: 'tax-hr-integration-admin',
  fullName: 'Tax HR Integration Test',
  email: 'tax-hr-test@example.invalid',
  role: 'SYSTEM_ADMIN',
  organizationId: 'org-general',
  allowedOrgIds: ['org-general', 'org-training-center'],
  isActive: true,
  maxApprovalLimit: Number.MAX_SAFE_INTEGER,
};

const appSource = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
const layoutSource = readFileSync(new URL('../src/components/Layout.tsx', import.meta.url), 'utf8');
const modelsViewerSource = readFileSync(new URL('../src/pages/ModelsViewer.tsx', import.meta.url), 'utf8');
const taxesHubSource = readFileSync(new URL('../src/pages/TaxesHub.tsx', import.meta.url), 'utf8');
const generalAssistantSource = readFileSync(new URL('../server/services/general-assistant.service.ts', import.meta.url), 'utf8');
const serverSource = readFileSync(new URL('../server.ts', import.meta.url), 'utf8');

test('tax and HR hubs are reachable from their portals, assistant navigation, and deep links', () => {
  const tax = SCREENS.find((screen) => screen.id === 'taxes');
  assert.ok(tax, 'the unified tax hub must be registered as a portal screen');
  assert.deepEqual(new Set(tax.portals), new Set(['syndicate', 'training']));
  assert.ok(/كسب العمل/.test(tax.label), 'the navigation label should identify employment tax');
  assert.ok(OPERATOR_NAVIGATION.some((screen) => screen.id === 'taxes'));
  assert.ok(screensForPortal('syndicate').some((screen) => screen.id === 'taxes'));
  assert.ok(screensForPortal('training').some((screen) => screen.id === 'taxes'));

  const hrScreenIds = ['employees', 'payroll', 'attendance', 'biometric', 'advances'];
  for (const id of hrScreenIds) {
    const screen = SCREENS.find((candidate) => candidate.id === id);
    assert.ok(screen, `${id} must be registered as an HR screen`);
    assert.deepEqual(new Set(screen.portals), new Set(['training']), 'HR remains isolated to the training portal');
    assert.ok(OPERATOR_NAVIGATION.some((candidate) => candidate.id === id));
  }
  assert.ok(hrScreenIds.every((id) => screensForPortal('training').some((screen) => screen.id === id)));
  assert.equal(screensForPortal('syndicate').some((screen) => hrScreenIds.includes(screen.id)), false);
  assert.equal(screensForPortal('committees').some((screen) => screen.id === 'taxes' || screen.id === 'biometric'), false);

  assert.match(appSource, /const TaxesHub = lazy\(/, 'the tax hub should be code-split and mounted by App');
  assert.match(appSource, /currentTab === 'taxes'[\s\S]*<TaxesHub/, 'the tax navigation id should render TaxesHub');
  assert.match(appSource, /currentTab === 'biometric'/, 'the biometric route must open the HR biometric tab');
  assert.match(appSource, /hrTabs\.includes\(requestedTab \?\? ''\)\) return 'training'/, 'HR deep links must retain the training-portal organization boundary');
  assert.match(appSource, /initialTabFromSearch\(window\.location\.search\)/, 'deep-link query tabs must be resolved on app start');
  for (const tab of ['taxes', 'payroll-tax', 'hrs', 'biometric']) {
    assert.ok(appSource.includes(`'${tab}'`), `${tab} must be accepted by the SPA deep-link allowlist`);
  }
  for (const route of ["'/taxes'", "'/payroll-tax'", "'/hr'", "'/hr/biometric'"]) {
    assert.ok(serverSource.includes(`app.get(${route}`), `${route} must redirect into the SPA`);
  }
});

test('committee data and models share one navigation entry while preserving portal scope and legacy links', () => {
  const unifiedScreen = SCREENS.find((screen) => screen.id === 'models');
  assert.ok(unifiedScreen, 'the combined committees/models screen should exist');
  assert.deepEqual(new Set(unifiedScreen.portals), new Set(['syndicate', 'committees']));
  assert.equal(SCREENS.some((screen) => screen.id === 'committee-data'), false, 'the duplicate screen must leave the portal menu');
  assert.equal(OPERATOR_NAVIGATION.some((screen) => screen.id === 'committee-data'), false, 'operator navigation must not offer a duplicate');
  assert.ok(OPERATOR_NAVIGATION.some((screen) => screen.id === 'models'));
  assert.equal(screensForPortal('syndicate').filter((screen) => screen.id === 'models').length, 1);
  assert.equal(screensForPortal('committees').filter((screen) => screen.id === 'models').length, 1);

  assert.match(appSource, /'committee-data': 'committees'/, 'the legacy data link should open the committees tab');
  assert.match(appSource, /currentTab === 'models' \|\| currentTab === 'committee-data'/);
  assert.match(appSource, /showModelsLibrary=\{selectedGateway === 'syndicate'\}/, 'the forms library remains syndicate-only');
  assert.match(modelsViewerSource, /props\.showModelsLibrary === false[\s\S]*<CommitteeDataViewer/);
  assert.match(layoutSource, /'committee-data': 'models'/, 'the old link should highlight the single current menu entry');
  assert.match(appSource, /'committee-data', 'models'/, 'both legacy query IDs should be accepted as deep links');
  assert.match(appSource, /requestedTab === 'models'\) return 'syndicate'/);
  assert.match(serverSource, /app\.get\('\/committee-data'[\s\S]*\?tab=committee-data/);
  assert.match(serverSource, /app\.get\('\/models'[\s\S]*\?tab=models/);
  assert.doesNotMatch(generalAssistantSource, /id: "committee-data"/, 'the assistant should use the unified destination');
  assert.match(generalAssistantSource, /id: "models"[\s\S]*بيانات اللجان والمكاتب/);
});

test('electronic invoicing remains a tax tab, not a separate navigation screen', () => {
  assert.equal(SCREENS.some((screen) => screen.id === 'einvoicing'), false, 'no standalone invoice menu item should remain');
  assert.equal(OPERATOR_NAVIGATION.some((screen) => screen.id === 'einvoicing'), false, 'assistant navigation should use the tax hub');
  assert.ok(SCREENS.some((screen) => screen.id === 'taxes'));
  assert.match(taxesHubSource, /id: 'einvoicing'/);
  assert.match(taxesHubSource, /activeTab === 'einvoicing'[\s\S]*<EInvoicing/);
  assert.match(appSource, /einvoicing: 'einvoicing'/, 'the old route should select the invoice tab');
  assert.match(appSource, /currentTab === 'einvoicing'[\s\S]*<TaxesHub/);
  assert.doesNotMatch(appSource, /const EInvoicing = lazy\(/, 'App should no longer mount a standalone invoice page');
  assert.match(layoutSource, /einvoicing: 'taxes'/, 'the legacy route should highlight the taxes menu item');
  for (const route of ["'/einvoicing'", "'/e-invoicing'"]) {
    assert.ok(serverSource.includes(`app.get(${route}`), `${route} should redirect to the unified tax hub`);
  }
  assert.equal(SCREEN_WRITE_PERMISSIONS.models, 'documents:manage', 'model write permission must remain unchanged');
  assert.equal(SCREEN_WRITE_PERMISSIONS.einvoicing, 'accounts:manage', 'invoice permission must remain unchanged');
});

test('employment-income tax API requires authentication and returns a coherent progressive calculation', async (t) => {
  const app = express();
  app.use(express.json());
  app.use('/api/tax', createTaxRouter({
    authenticate: (req) => req.get('x-user-id') === ADMIN.id ? ADMIN : null,
  }));
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => {
    server.close();
    await once(server, 'close');
  });

  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const baseUrl = `http://127.0.0.1:${address.port}/api/tax/payroll/calculate`;
  const denied = await fetch(baseUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ monthlyGross: 20_000, monthlyInsurance: 2_200 }),
  });
  assert.equal(denied.status, 401);

  const response = await fetch(baseUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-user-id': ADMIN.id },
    body: JSON.stringify({ monthlyGross: 20_000, monthlyInsurance: 2_200 }),
  });
  assert.equal(response.status, 200);
  const result = await response.json() as {
    annualTax: number;
    monthlyTax: number;
    taxableBase: number;
    brackets: { taxAmount: number }[];
    parametersVersion: string;
  };
  assert.equal(result.taxableBase, 193_600);
  assert.equal(result.annualTax, result.brackets.reduce((sum, row) => sum + row.taxAmount, 0));
  assert.equal(result.monthlyTax * 12, result.annualTax);
  assert.match(result.parametersVersion, /^EG-TAX-/);
});
