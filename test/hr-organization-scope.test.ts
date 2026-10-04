import assert from 'node:assert/strict';
import { once } from 'node:events';
import express from 'express';
import test from 'node:test';
import type { User } from '../src/types/erp.js';
import { erpStore } from '../server/db/store.js';
import { createHrReadRouter } from '../server/routes/hr-read.routes.js';
import { createBiometricRouter } from '../server/routes/biometric.routes.js';
import { createGeneralAssistantRouter } from '../server/routes/assistant.routes.js';
import { installApiGuard } from '../server/security/api-guard.js';
import { biometricService } from '../server/services/biometric.service.js';

const TRAINING_ORG = 'org-training-center';
const GENERAL_ORG = 'org-general';

const trainingUser: User = {
  id: 'hr-scope-training-user',
  username: 'hr-scope-training-user',
  fullName: 'Training User',
  email: 'training@example.invalid',
  role: 'HEAD_OF_ACCOUNTS',
  organizationId: TRAINING_ORG,
  allowedOrgIds: [TRAINING_ORG],
  isActive: true,
  maxApprovalLimit: 0,
};

const generalUser: User = {
  id: 'hr-scope-general-user',
  username: 'hr-scope-general-user',
  fullName: 'General User',
  email: 'general@example.invalid',
  role: 'HEAD_OF_ACCOUNTS',
  organizationId: GENERAL_ORG,
  allowedOrgIds: [GENERAL_ORG],
  isActive: true,
  maxApprovalLimit: 0,
};

const systemAdmin: User = {
  id: 'hr-scope-system-admin',
  username: 'hr-scope-system-admin',
  fullName: 'HR Scope Administrator',
  email: 'admin@example.invalid',
  role: 'SYSTEM_ADMIN',
  organizationId: GENERAL_ORG,
  allowedOrgIds: [GENERAL_ORG],
  isActive: true,
  maxApprovalLimit: Number.MAX_SAFE_INTEGER,
};

const users = [trainingUser, generalUser, systemAdmin];

function testEmployee(id: string, organizationId: string, fullName: string) {
  return {
    id,
    employeeCode: id.toUpperCase(),
    organizationId,
    fullName,
    totalSalary: 10_000,
    insuranceSalary: 9_000,
    unionShareForm2: 500,
    workerShareForm2: 300,
    unionShareDeducted: 450,
    workerShareDeducted: 280,
    status: 'ACTIVE' as const,
  };
}

function testRun(id: string, organizationId?: string) {
  return {
    id,
    runNumber: `PR-2026-02-${id}`,
    year: 2026,
    month: 2,
    monthLabelAr: 'فبراير 2026',
    status: 'DRAFT' as const,
    organizationId,
    lines: [],
    totals: {
      employeesCount: 1,
      totalBase: 10_000,
      totalBonus: 0,
      totalDeduction: 0,
      totalAdvanceDeduction: 0,
      totalNet: 10_000,
    },
    createdBy: 'test',
    createdAt: '2026-02-01T00:00:00.000Z',
  };
}

function testImport(id: string, organizationId?: string) {
  return {
    id,
    organizationId,
    year: 2026,
    month: 2,
    monthLabelAr: 'فبراير 2026',
    employeesCount: 1,
    totals: { gross: 10_000, net: 9_000 },
    rows: [{ name: `Sensitive ${id}`, gross: 10_000, net: 9_000 }],
    entryNumber: `JE-${id}`,
    status: 'COMMITTED',
    committedAt: '2026-02-01T00:00:00.000Z',
    committedBy: 'test',
  };
}

test('HR employee and payroll reads use authenticated tenant scope and fail closed for legacy rows', async (t) => {
  const originalStore = {
    employees: erpStore.employees,
    employeeAffairs: erpStore.employeeAffairs,
    employeeAdvances: erpStore.employeeAdvances,
    payrollRuns: erpStore.payrollRuns,
    payrollImports: erpStore.payrollImports,
    attendanceRecords: erpStore.attendanceRecords,
  };
  const biometricState = (biometricService as any).state;

  const trainingEmployee = testEmployee('emp-training-test', TRAINING_ORG, 'Training Employee');
  const generalEmployee = testEmployee('emp-general-test', GENERAL_ORG, 'General Employee');
  const legacyEmployee = { ...testEmployee('emp-legacy-test', '', 'Legacy Employee') } as any;
  delete legacyEmployee.organizationId;

  erpStore.employees = [trainingEmployee, generalEmployee, legacyEmployee];
  erpStore.employeeAffairs = [
    { id: 'aff-training', employeeId: trainingEmployee.id, employeeName: trainingEmployee.fullName, type: 'BONUS', startDate: '2026-02-01', reason: 'training only', status: 'APPROVED', createdBy: 'test', createdAt: '2026-02-01' },
    { id: 'aff-general', employeeId: generalEmployee.id, employeeName: generalEmployee.fullName, type: 'BONUS', startDate: '2026-02-01', reason: 'general only', status: 'APPROVED', createdBy: 'test', createdAt: '2026-02-01' },
    { id: 'aff-legacy', employeeId: legacyEmployee.id, employeeName: legacyEmployee.fullName, type: 'BONUS', startDate: '2026-02-01', reason: 'unassigned', status: 'APPROVED', createdBy: 'test', createdAt: '2026-02-01' },
  ] as any;
  erpStore.employeeAdvances = [
    { id: 'adv-training', employeeId: trainingEmployee.id, employeeName: trainingEmployee.fullName, amount: 1_000, paidAmount: 0, installmentAmount: 100, issueDate: '2026-02-01', status: 'ACTIVE', payments: [], createdBy: 'test', createdAt: '2026-02-01' },
    { id: 'adv-general', employeeId: generalEmployee.id, employeeName: generalEmployee.fullName, amount: 2_000, paidAmount: 0, installmentAmount: 200, issueDate: '2026-02-01', status: 'ACTIVE', payments: [], createdBy: 'test', createdAt: '2026-02-01' },
  ] as any;
  erpStore.payrollRuns = [
    testRun('run-training', TRAINING_ORG),
    testRun('run-general', GENERAL_ORG),
    testRun('run-legacy'),
  ] as any;
  erpStore.payrollImports = [
    testImport('import-training', TRAINING_ORG),
    testImport('import-general', GENERAL_ORG),
    testImport('import-legacy'),
  ];
  erpStore.attendanceRecords = [
    { id: 'att-training', employeeId: trainingEmployee.id, employeeCode: trainingEmployee.employeeCode, employeeName: trainingEmployee.fullName, date: '2026-02-02', status: 'PRESENT', createdBy: 'test', createdAt: '2026-02-02', updatedAt: '2026-02-02' },
    { id: 'att-general', employeeId: generalEmployee.id, employeeCode: generalEmployee.employeeCode, employeeName: generalEmployee.fullName, date: '2026-02-02', status: 'PRESENT', createdBy: 'test', createdAt: '2026-02-02', updatedAt: '2026-02-02' },
    { id: 'att-legacy', employeeId: legacyEmployee.id, employeeCode: legacyEmployee.employeeCode, employeeName: legacyEmployee.fullName, date: '2026-02-02', status: 'PRESENT', createdBy: 'test', createdAt: '2026-02-02', updatedAt: '2026-02-02' },
  ] as any;

  (biometricService as any).state = {
    ...biometricState,
    enrollments: {
      training: { id: 'bio-training', employeeId: trainingEmployee.id, enrolledAt: '2026-02-01' },
      general: { id: 'bio-general', employeeId: generalEmployee.id, enrolledAt: '2026-02-01' },
      legacy: { id: 'bio-legacy', employeeId: legacyEmployee.id, enrolledAt: '2026-02-01' },
    },
    punches: [
      { id: 'punch-training', employeeId: trainingEmployee.id, timestamp: '2026-02-02T09:00:00.000Z' },
      { id: 'punch-general', employeeId: generalEmployee.id, timestamp: '2026-02-02T09:00:00.000Z' },
      { id: 'punch-legacy', employeeId: legacyEmployee.id, timestamp: '2026-02-02T09:00:00.000Z' },
    ],
  };

  t.after(() => {
    erpStore.employees = originalStore.employees;
    erpStore.employeeAffairs = originalStore.employeeAffairs;
    erpStore.employeeAdvances = originalStore.employeeAdvances;
    erpStore.payrollRuns = originalStore.payrollRuns;
    erpStore.payrollImports = originalStore.payrollImports;
    erpStore.attendanceRecords = originalStore.attendanceRecords;
    (biometricService as any).state = biometricState;
  });

  const app = express();
  app.use(express.json());
  const authenticate = (req: express.Request) =>
    users.find((user) => user.id === req.get('x-user-id')) ?? null;
  installApiGuard(app, { resolveUser: authenticate });
  app.use('/api', createHrReadRouter({ authenticate }));
  app.use('/api/biometric', createBiometricRouter({ authenticate }));
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
  const request = async (path: string, userId = trainingUser.id) =>
    fetch(`${baseUrl}${path}`, { headers: { 'x-user-id': userId } });
  const assistantRequest = (text: string, organizationId: string, userId = trainingUser.id) =>
    fetch(`${baseUrl}/api/assistant/run`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-user-id': userId },
      body: JSON.stringify({ text, organizationId }),
    });

  const unauthenticatedResponse = await fetch(`${baseUrl}/api/employees?organizationId=${TRAINING_ORG}`);
  assert.equal(unauthenticatedResponse.status, 401, 'the global /api authentication guard remains active');
  assert.equal((await unauthenticatedResponse.json() as any).code, 'AUTH_REQUIRED');

  const trainingEmployeesResponse = await request(`/api/employees?organizationId=${TRAINING_ORG}`);
  assert.equal(trainingEmployeesResponse.status, 200);
  assert.deepEqual((await trainingEmployeesResponse.json() as any[]).map((employee) => employee.id), [trainingEmployee.id]);

  const forgedOrganizationResponse = await request(`/api/employees?organizationId=${GENERAL_ORG}`);
  assert.equal(forgedOrganizationResponse.status, 403, 'a client-supplied tenant cannot override the authenticated user grants');

  const generalEmployeesResponse = await request(`/api/employees?organizationId=${GENERAL_ORG}`, generalUser.id);
  assert.equal(generalEmployeesResponse.status, 200);
  assert.deepEqual((await generalEmployeesResponse.json() as any[]).map((employee) => employee.id), [generalEmployee.id]);

  const assistantPeopleResponse = await assistantRequest('كام عامل عندكم؟', TRAINING_ORG);
  assert.equal(assistantPeopleResponse.status, 200);
  const assistantPeople = await assistantPeopleResponse.json() as any;
  assert.deepEqual(assistantPeople.payload.rows.map((row: any) => row.cells[0]), ['Training Employee']);
  assert.equal((await assistantRequest('كام عامل عندكم؟', GENERAL_ORG)).status, 403);

  const assistantExportResponse = await assistantRequest('استخرج بيانات العاملين CSV', TRAINING_ORG);
  assert.equal(assistantExportResponse.status, 200);
  const assistantExport = await assistantExportResponse.json() as any;
  assert.match(assistantExport.payload.csvAr.content, /Training Employee/);
  assert.doesNotMatch(assistantExport.payload.csvAr.content, /General Employee/);

  const summaryResponse = await request(`/api/employee-affairs/summary?organizationId=${TRAINING_ORG}`);
  const summary = await summaryResponse.json() as any;
  assert.equal(summary.employeesCount, 1);
  assert.equal(summary.totalSalaries, trainingEmployee.totalSalary);
  assert.equal(summary.affairs.total, 1);
  assert.equal(summary.advances.totalAmount, 1_000);

  const affairs = await (await request(`/api/employee-affairs?organizationId=${TRAINING_ORG}`)).json() as any[];
  assert.deepEqual(affairs.map((affair) => affair.id), ['aff-training']);
  const advances = await (await request(`/api/employee-advances?organizationId=${TRAINING_ORG}`)).json() as any[];
  assert.deepEqual(advances.map((advance) => advance.id), ['adv-training']);

  const trainingRuns = await (await request(`/api/payroll/runs?organizationId=${TRAINING_ORG}`)).json() as any[];
  assert.deepEqual(trainingRuns.map((run) => run.id), ['run-training']);
  assert.equal((await request(`/api/payroll/runs/run-general?organizationId=${TRAINING_ORG}`)).status, 404);
  assert.equal((await request(`/api/payroll/runs/run-legacy?organizationId=${TRAINING_ORG}`)).status, 404);

  const importedMonths = await (await request(`/api/payroll/imported-months?organizationId=${TRAINING_ORG}`)).json() as any[];
  assert.deepEqual(importedMonths.map((month) => month.id), ['import-training']);
  assert.equal((await request(`/api/payroll/imported-months/import-general?organizationId=${TRAINING_ORG}`)).status, 404);
  assert.equal((await request(`/api/payroll/imported-months/import-legacy?organizationId=${TRAINING_ORG}`)).status, 404);

  const attendance = await (await request(`/api/attendance?organizationId=${TRAINING_ORG}`)).json() as any[];
  assert.deepEqual(attendance.map((record) => record.id), ['att-training']);
  const attendanceSummaries = await (await request(`/api/attendance/monthly/2026/2?organizationId=${TRAINING_ORG}`)).json() as any[];
  assert.deepEqual(attendanceSummaries.map((record) => record.employeeId), [trainingEmployee.id]);
  assert.equal(
    (await request(`/api/attendance/monthly/2026/2/${generalEmployee.id}?organizationId=${TRAINING_ORG}`)).status,
    404,
  );

  const biometric = await (await request(`/api/biometric/overview?organizationId=${TRAINING_ORG}`, systemAdmin.id)).json() as any;
  assert.deepEqual(biometric.employees.map((employee: any) => employee.id), [trainingEmployee.id]);
  assert.deepEqual(biometric.enrollments.map((enrollment: any) => enrollment.employeeId), [trainingEmployee.id]);
  assert.deepEqual(biometric.punches.map((punch: any) => punch.employeeId), [trainingEmployee.id]);
});
