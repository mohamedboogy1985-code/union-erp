import assert from 'node:assert/strict';
import { once } from 'node:events';
import express from 'express';
import test from 'node:test';
import type { User } from '../src/types/erp.js';
import { erpStore } from '../server/db/store.js';
import { createGeneralAssistantRouter } from '../server/routes/assistant.routes.js';
import { installApiGuard } from '../server/security/api-guard.js';

const TRAINING_ORG = 'org-training-center';
const GENERAL_ORG = 'org-general';

const trainingUser: User = {
  id: 'assistant-search-training-user',
  username: 'assistant-search-training-user',
  fullName: 'Training Search User',
  email: 'assistant-training@example.invalid',
  role: 'HEAD_OF_ACCOUNTS',
  organizationId: TRAINING_ORG,
  allowedOrgIds: [TRAINING_ORG],
  isActive: true,
  maxApprovalLimit: 0,
};

const generalUser: User = {
  ...trainingUser,
  id: 'assistant-search-general-user',
  username: 'assistant-search-general-user',
  fullName: 'General Search User',
  email: 'assistant-general@example.invalid',
  organizationId: GENERAL_ORG,
  allowedOrgIds: [GENERAL_ORG],
};

test('general assistant search scopes journals, bank transactions, and subledgers to the authorized organization', async (t) => {
  const original = {
    journalEntries: erpStore.journalEntries,
    bankAccounts: erpStore.bankAccounts,
    bankTransactions: erpStore.bankTransactions,
    subledgerParties: erpStore.subledgerParties,
  };
  erpStore.journalEntries = [
    { id: 'jr-training', entryNumber: 'TR-1', date: '2026-02-01', organizationId: TRAINING_ORG, description: 'training secret 900123', status: 'POSTED', lines: [] },
    { id: 'jr-general', entryNumber: 'GN-1', date: '2026-02-01', organizationId: GENERAL_ORG, description: 'general secret 900123', status: 'POSTED', lines: [] },
    { id: 'jr-unassigned', entryNumber: 'LG-1', date: '2026-02-01', description: 'legacy secret 900123', status: 'POSTED', lines: [] },
  ] as any;
  erpStore.bankAccounts = [
    { id: 'bank-training', bankName: 'Training Bank', organizationId: TRAINING_ORG },
    { id: 'bank-general', bankName: 'General Bank', organizationId: GENERAL_ORG },
  ] as any;
  erpStore.bankTransactions = [
    { id: 'bt-training', bankAccountId: 'bank-training', transactionDate: '2026-02-01', referenceNumber: '900123', description: 'training bank cheque', debit: 10, credit: 0 },
    { id: 'bt-general', bankAccountId: 'bank-general', transactionDate: '2026-02-01', referenceNumber: '900123', description: 'general bank cheque', debit: 20, credit: 0 },
    { id: 'bt-orphan', bankAccountId: 'missing-account', transactionDate: '2026-02-01', referenceNumber: '900123', description: 'unassigned bank cheque', debit: 30, credit: 0 },
  ] as any;
  erpStore.subledgerParties = [
    { id: 'party-training', organizationId: TRAINING_ORG, name: 'training private-marker', currentBalance: 1 },
    { id: 'party-general', organizationId: GENERAL_ORG, name: 'general private-marker', currentBalance: 2 },
    { id: 'party-unassigned', name: 'legacy private-marker', currentBalance: 3 },
  ] as any;

  t.after(() => {
    erpStore.journalEntries = original.journalEntries;
    erpStore.bankAccounts = original.bankAccounts;
    erpStore.bankTransactions = original.bankTransactions;
    erpStore.subledgerParties = original.subledgerParties;
  });

  const users = [trainingUser, generalUser];
  const authenticate = (req: express.Request) => users.find((user) => user.id === req.get('x-user-id')) ?? null;
  const app = express();
  app.use(express.json());
  installApiGuard(app, { resolveUser: authenticate });
  app.use('/api/assistant', createGeneralAssistantRouter({ authenticate }));

  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => {
    server.close();
    await once(server, 'close');
  });
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const search = async (user: User, organizationId: string, text: string) => {
    const response = await fetch(`${baseUrl}/api/assistant/run`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-user-id': user.id },
      body: JSON.stringify({ text, organizationId }),
    });
    assert.equal(response.status, 200);
    return response.json() as Promise<any>;
  };

  const trainingCheque = await search(trainingUser, TRAINING_ORG, 'ابحث عن الشيك رقم 900123');
  const trainingRows = trainingCheque.payload.rows.map((row: any) => row.cells.join(' ')).join('\n');
  assert.match(trainingRows, /training/);
  assert.doesNotMatch(trainingRows, /general|legacy/i);

  const generalCheque = await search(generalUser, GENERAL_ORG, 'ابحث عن الشيك رقم 900123');
  const generalRows = generalCheque.payload.rows.map((row: any) => row.cells.join(' ')).join('\n');
  assert.match(generalRows, /general/);
  assert.doesNotMatch(generalRows, /training|legacy/i);

  const trainingDescription = await search(trainingUser, TRAINING_ORG, 'ابحث عن private-marker');
  const descriptionRows = trainingDescription.payload.rows.map((row: any) => row.cells.join(' ')).join('\n');
  assert.match(descriptionRows, /training private-marker/);
  assert.doesNotMatch(descriptionRows, /general|legacy/i);
});
