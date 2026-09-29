/**
 * حراسة مؤشّر مجلد البيانات: المسارات المعروضة هي التي تستخدمها الخدمات فعلاً،
 * ومتغيرات البيئة تنعكس، والغائب لا يُعلن موجوداً ولا يُقاس كأنه صفر.
 * التشغيل: `npx tsx --test test/data-paths.test.ts`
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import {
  collectDataPaths,
  resolveEtaDocumentsFile,
  resolveModelsDir as resolveModelsDirPath,
  resolvePgDataDir,
  resolveUnionDataDir,
} from '../server/utils/data-paths.js';
import { registerSystemRoutes } from '../server/routes/system.routes.js';
import { CSV_DATA_DIR, CSV_IMPORT_MODULE_DIR } from '../server/services/csv-import.service.js';
import { EMPLOYEE_DATA_DIR } from '../server/services/employee-affairs.service.js';
import { MODELS_DIR, MODELS_MODULE_DIR } from '../server/services/models.service.js';
import { ETA_MODULE_DIR, etaDocumentsFile } from '../server/services/eta/eta-store.js';

const entry = (kind: string, moduleDirs?: { unionData?: string; eta?: string; models?: string }) =>
  collectDataPaths({ moduleDirs }).paths.find((pathEntry) => pathEntry.kind === kind)!;

function withEnv<T>(values: Record<string, string | undefined>, fn: () => T): T {
  const before = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(values)) {
    before.set(key, process.env[key]);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    return fn();
  } finally {
    for (const [key, value] of before) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test('the indicator reports the same resolved folders used by server services', () => {
  const moduleDirs = { unionData: CSV_IMPORT_MODULE_DIR, eta: ETA_MODULE_DIR, models: MODELS_MODULE_DIR };
  const snapshot = collectDataPaths({ moduleDirs });
  const byKind = new Map(snapshot.paths.map((item) => [item.kind, item]));

  assert.equal(byKind.get('POSTGRES_DATA')?.path, resolvePgDataDir().path);
  assert.equal(byKind.get('UNION_DATA')?.path, path.resolve(CSV_DATA_DIR));
  assert.equal(byKind.get('UNION_DATA')?.path, path.resolve(EMPLOYEE_DATA_DIR));
  assert.equal(byKind.get('UNION_DATA')?.path, resolveUnionDataDir(CSV_IMPORT_MODULE_DIR).path);
  assert.equal(byKind.get('ETA_DOCUMENTS_FILE')?.path, etaDocumentsFile());
  assert.equal(byKind.get('ETA_DOCUMENTS_FILE')?.path, resolveEtaDocumentsFile(ETA_MODULE_DIR).path);
  assert.equal(byKind.get('MODELS')?.path, path.resolve(MODELS_DIR));
  assert.equal(byKind.get('MODELS')?.path, resolveModelsDirPath(MODELS_MODULE_DIR).path);

  // كما يجب أن ينجح الحلّ الافتراضي وحده في تشغيل المصدر بلا أي خيارات إضافية.
  const defaults = new Map(collectDataPaths().paths.map((item) => [item.kind, item]));
  assert.equal(defaults.get('UNION_DATA')?.path, path.resolve(CSV_DATA_DIR));
  assert.equal(defaults.get('ETA_DOCUMENTS_FILE')?.path, etaDocumentsFile());
  assert.equal(defaults.get('MODELS')?.path, path.resolve(MODELS_DIR));

  // المسارات الحقيقية تُقاس من القرص؛ لا أعداد أو أحجام افتراضية في الاستجابة.
  for (const item of snapshot.paths) {
    if (item.exists && item.measurement.fileCount !== null) {
      assert.ok(item.measurement.fileCount >= 0);
      assert.ok(item.measurement.totalBytes !== null && item.measurement.totalBytes >= 0);
    }
  }
});

test('PG_DATA_DIR and UNION_DATA_DIR overrides are reflected as absolute live paths', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'union-data-paths-env-'));
  const pg = path.join(root, 'postgres-custom');
  const union = path.join(root, 'union-custom');
  fs.mkdirSync(pg, { recursive: true });
  fs.mkdirSync(union, { recursive: true });
  fs.writeFileSync(path.join(union, 'measured.csv'), 'real bytes');

  try {
    withEnv({ PG_DATA_DIR: pg, UNION_DATA_DIR: union }, () => {
      const snapshot = collectDataPaths({
        moduleDirs: { unionData: CSV_IMPORT_MODULE_DIR, eta: ETA_MODULE_DIR, models: MODELS_MODULE_DIR },
      });
      const pgEntry = snapshot.paths.find((item) => item.kind === 'POSTGRES_DATA')!;
      const unionEntry = snapshot.paths.find((item) => item.kind === 'UNION_DATA')!;
      assert.equal(pgEntry.path, pg);
      assert.equal(pgEntry.source, 'env');
      assert.equal(pgEntry.envVarName, 'PG_DATA_DIR');
      assert.equal(unionEntry.path, union);
      assert.equal(unionEntry.source, 'env');
      assert.equal(unionEntry.envVarName, 'UNION_DATA_DIR');
      assert.equal(unionEntry.measurement.fileCount, 1);
      assert.equal(unionEntry.measurement.totalBytes, Buffer.byteLength('real bytes'));
      assert.equal(pgEntry.status, 'READY');
      assert.equal(pgEntry.writeProbeRan, true);
    });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('a configured but nonexistent directory is reported missing, not present or ready', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'union-data-paths-missing-'));
  const missing = path.join(root, 'does-not-exist');
  try {
    withEnv({ PG_DATA_DIR: missing }, () => {
      const pg = entry('POSTGRES_DATA');
      assert.equal(pg.path, missing);
      assert.equal(pg.source, 'env');
      assert.equal(pg.exists, false);
      assert.equal(pg.status, 'MISSING');
      assert.equal(pg.writeProbeRan, false);
      assert.equal(pg.measurement.fileCount, null);
      assert.equal(pg.measurement.totalBytes, null);
      assert.ok(!fs.existsSync(missing), 'the read-only indicator must not create a missing target');
    });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('environment paths may be relative but the returned path is full and names the real target', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'union-data-paths-relative-'));
  const before = process.cwd();
  try {
    process.chdir(root);
    fs.mkdirSync('relative-pg');
    withEnv({ PG_DATA_DIR: 'relative-pg' }, () => {
      const pg = entry('POSTGRES_DATA');
      assert.equal(pg.path, path.join(root, 'relative-pg'));
      assert.equal(path.isAbsolute(pg.path), true);
      assert.equal(pg.exists, true);
    });
  } finally {
    process.chdir(before);
    fs.rmSync(root, { recursive: true, force: true });
  }
});


test('GET /api/system/data-paths enforces system:admin before measuring data paths', async () => {
  const app = express();
  let authorized = false;
  let permissionSeen = '';
  let measurements = 0;
  const sample = { status: 'ok', paths: [], summary: { ready: 0, missing: 0, notWritable: 0, unavailable: 0 } };
  registerSystemRoutes(app, {
    requirePermission: (_req, res, permission) => {
      permissionSeen = permission;
      if (!authorized) {
        res.status(403).json({ error: 'forbidden' });
        return null;
      }
      return {} as any;
    },
    databaseStatus: () => ({ connected: false, mode: 'test' }),
    getActiveUser: () => null,
    dataPaths: () => {
      measurements += 1;
      return sample as any;
    },
  });

  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address() as AddressInfo;
  try {
    const denied = await fetch(`http://127.0.0.1:${port}/api/system/data-paths`);
    assert.equal(denied.status, 403);
    assert.equal(permissionSeen, 'system:admin');
    assert.equal(measurements, 0, 'unauthorized requests must not trigger disk scans');

    authorized = true;
    const allowed = await fetch(`http://127.0.0.1:${port}/api/system/data-paths`);
    assert.equal(allowed.status, 200);
    assert.deepEqual(await allowed.json(), sample);
    assert.equal(measurements, 1);

    const detailed = await fetch(`http://127.0.0.1:${port}/api/system/health-detailed`);
    assert.equal(detailed.status, 200);
    assert.deepEqual((await detailed.json() as any).dataPaths, sample);
    assert.equal(measurements, 2, 'detailed health must include a live data-path snapshot too');
  } finally {
    server.close();
    await once(server, 'close');
  }
});

test('file targets are write-probed without changing their measured contents', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'union-data-paths-file-probe-'));
  const before = process.cwd();
  try {
    process.chdir(root);
    fs.mkdirSync('data');
    const file = path.join(root, 'data', 'payroll-imports.json');
    fs.writeFileSync(file, 'kept-content');
    const payroll = entry('PAYROLL_IMPORTS_FILE');
    assert.equal(payroll.path, file);
    assert.equal(payroll.status, 'READY');
    assert.equal(payroll.writeProbeRan, true);
    assert.equal(payroll.measurement.fileCount, 1);
    assert.equal(payroll.measurement.totalBytes, Buffer.byteLength('kept-content'));
    assert.equal(fs.readFileSync(file, 'utf8'), 'kept-content');
  } finally {
    process.chdir(before);
    fs.rmSync(root, { recursive: true, force: true });
  }
});
