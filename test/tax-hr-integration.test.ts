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
const globalStylesSource = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8');
const hrsHubSource = readFileSync(new URL('../src/pages/HrsHub.tsx', import.meta.url), 'utf8');
const accountingHubSource = readFileSync(new URL('../src/pages/AccountingHub.tsx', import.meta.url), 'utf8');
const modelsViewerSource = readFileSync(new URL('../src/pages/ModelsViewer.tsx', import.meta.url), 'utf8');
const taxesHubSource = readFileSync(new URL('../src/pages/TaxesHub.tsx', import.meta.url), 'utf8');
const generalAssistantSource = readFileSync(new URL('../server/services/general-assistant.service.ts', import.meta.url), 'utf8');
const serverSource = readFileSync(new URL('../server.ts', import.meta.url), 'utf8');

test('tax and HR hubs are reachable from their portals, assistant navigation, and deep links', () => {
  const tax = SCREENS.find((screen) => screen.id === 'taxes');
  assert.ok(tax, 'the unified tax hub must be registered as a portal screen');
  assert.deepEqual(tax.portals, ['training'], 'the tax tabs now live inside the training HR hub');
  assert.equal(tax.group, 'الموارد البشرية');
  assert.match(layoutSource, /CAIRO_TIME_ZONE = 'Africa\/Cairo'/);
  assert.match(layoutSource, /label: 'ميلادي'/);
  assert.match(layoutSource, /label: 'هجري'/);
  assert.match(layoutSource, /label: 'الوقت'/);
  assert.match(layoutSource, /label: 'الموقع', value: 'القاهرة، مصر/);
  assert.match(layoutSource, /erp-news-ticker__track/);
  assert.match(globalStylesSource, /@keyframes erp-news-ticker/);
  assert.match(globalStylesSource, /prefers-reduced-motion: reduce/);
  assert.match(layoutSource, /id: 'hrs', label: 'الموارد البشرية والعاملين'[\s\S]*tabs: \['employees', 'payroll', 'attendance', 'biometric', 'advances', 'insured-list', 'actuarial'\]/, 'the HR sidebar hub should list HR screens separately from tax');
  assert.match(layoutSource, /id: 'taxes', label: 'الضرائب وكسب العمل', icon: BadgePercent, tabs: \['taxes'\]/, 'tax should have its own visible training-portal sidebar item');
  assert.match(layoutSource, /taxes: 'taxes'/, 'the tax sidebar entry should stay highlighted on the tax screen');
  assert.ok(/كسب العمل/.test(tax.label), 'the navigation label should identify employment tax');
  assert.ok(OPERATOR_NAVIGATION.some((screen) => screen.id === 'taxes'));
  assert.equal(screensForPortal('syndicate').some((screen) => screen.id === 'taxes'), false);
  assert.ok(screensForPortal('training').some((screen) => screen.id === 'taxes'));

  const hrScreenIds = ['employees', 'payroll', 'attendance', 'biometric', 'advances', 'taxes'];
  for (const id of hrScreenIds) {
    assert.match(hrsHubSource, new RegExp(`id: '${id}'`), `${id} must be a visible HR hub tab`);
    const screen = SCREENS.find((candidate) => candidate.id === id);
    assert.ok(screen, `${id} must be registered as an HR screen`);
    assert.deepEqual(new Set(screen.portals), new Set(['training']), 'HR remains isolated to the training portal');
    assert.ok(OPERATOR_NAVIGATION.some((candidate) => candidate.id === id));
  }
  assert.ok(hrScreenIds.every((id) => screensForPortal('training').some((screen) => screen.id === id)));
  assert.equal(screensForPortal('syndicate').some((screen) => hrScreenIds.includes(screen.id)), false);
  assert.equal(screensForPortal('committees').some((screen) => screen.id === 'taxes' || screen.id === 'biometric'), false);
  assert.match(layoutSource, /selectedGateway === 'committees'[\s\S]*hr-training-shortcut[\s\S]*tax-training-shortcut/, 'the committees portal should show separate HR and tax shortcuts to the training portal');
  assert.match(layoutSource, /selectedGateway === 'syndicate'[\s\S]*accountingIndex[\s\S]*hr-training-shortcut[\s\S]*tax-training-shortcut/, 'HR and tax shortcuts should appear directly below Accounting in the syndicate sidebar');
  assert.match(layoutSource, /label: 'الموارد البشرية — بوابة التدريب'/, 'the sidebar should visibly label HR as a training-context shortcut');
  assert.match(layoutSource, /label: 'الضرائب وكسب العمل — بوابة التدريب'/, 'the sidebar should visibly label taxes as a training-context shortcut');
  assert.match(accountingHubSource, /label: 'الموارد البشرية — بوابة التدريب'/, 'HR should be discoverable under Accounting and Finance with an explicit scope label');
  assert.match(accountingHubSource, /tab === 'training-hr-shortcut'[\s\S]*onOpenTrainingHr\(\)/, 'the Accounting shortcut must switch portal context instead of opening HR under the union organization');
  assert.match(layoutSource, /item\.action === 'open-training-hr' \|\| item\.action === 'open-training-taxes'[\s\S]*onOpenTrainingHr\(item\.action === 'open-training-taxes' \? 'taxes' : 'employees'\)/, 'both shortcuts must explicitly switch to the appropriate training hub tab');
  assert.match(appSource, /const handleOpenTrainingHr = \(initialTab: 'employees' \| 'taxes' = 'employees'\) => \{[\s\S]*setSelectedGateway\('training'\)[\s\S]*setSelectedOrgId\(trainingPortal\.organizationId\)[\s\S]*setCurrentTab\(initialTab === 'taxes' \? 'taxes' : 'hrs'\)/);
  assert.match(appSource, /onOpenTrainingHr=\{handleOpenTrainingHr\}/);
  assert.match(appSource, /const TRAINING_HR_SCREEN_IDS = new Set/);
  assert.match(appSource, /const isTrainingHrScreen = TRAINING_HR_SCREEN_IDS\.has\(screenId\)/);
  assert.match(appSource, /const organizationId = isTrainingHrScreen \? trainingPortal\?\.organizationId : target\.organizationId/,
    'assistant HR deep links must canonicalize to the training tenant, not accept a caller-supplied union tenant');
  assert.match(appSource, /const portal = isTrainingHrScreen \? trainingPortal/,
    'assistant HR destinations must switch to the training portal');
  assert.match(appSource, /setSelectedGateway\(portal\.id\); setSelectedOrgId\(organizationId\)/);
  assert.match(appSource, /organizationId=\{getGatewayMeta\('training'\)\?\.organizationId \?\? 'org-training-center'\}/, 'the HR hub itself must not follow a manually selected general-union tenant');
  assert.match(layoutSource, /isTrainingHrTab && trainingOrganizationId && selectedOrgId !== trainingOrganizationId[\s\S]*onOrgChange\(trainingOrganizationId\)/, 'the shared organization selector must remain pinned to training while HR is open');

  assert.match(hrsHubSource, /const TaxesHub = lazy\(/, 'tax views should stay code-split within the HR hub');
  assert.match(hrsHubSource, /activeTab === 'taxes'[\s\S]*<TaxesHub/, 'the HR hub should mount the nested tax hub');
  assert.match(appSource, /currentTab === 'taxes'[\s\S]*<HrsHub/, 'tax deep links should open the HR hub');
  assert.match(appSource, /'payroll-tax': 'taxes'[\s\S]*'business-tax': 'taxes'/, 'legacy tax deep links should select the tax subtab of HR');
  assert.match(layoutSource, /taxes: 'taxes'/, 'tax links should highlight their dedicated sidebar item');
  assert.doesNotMatch(appSource, /const TaxesHub = lazy\(/, 'App should no longer mount taxes as a separate screen');
  assert.match(appSource, /currentTab === 'biometric'/, 'the biometric route must open the HR biometric tab');
  assert.match(appSource, /hrTabs\.includes[\s\S]*taxTabs\.includes[\s\S]*return 'training'/, 'HR and tax deep links must retain the training-portal organization boundary');
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
  assert.match(appSource, /currentTab === 'einvoicing'[\s\S]*<HrsHub/);
  assert.match(appSource, /initialTaxesTab=\{TAXES_HUB_ALIASES\[currentTab\]\}/);
  assert.doesNotMatch(appSource, /const EInvoicing = lazy\(/, 'App should no longer mount a standalone invoice page');
  assert.match(layoutSource, /einvoicing: 'taxes'/, 'the legacy route should highlight the dedicated tax sidebar item');
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
