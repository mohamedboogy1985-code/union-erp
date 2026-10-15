/**
 * تصلّب الشبكة: عنوان الاستماع، وحدة SQL، وعدم تسريب stack.
 * التشغيل: npx tsx --test test/network-hardening.test.ts
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { getListenHost, isSqlConsoleAllowed } from '../server/security/runtime-config.js';

const KEYS = ['HOST', 'DEMO_MODE', 'ALLOW_SQL_CONSOLE'] as const;

function withEnv(env: Partial<Record<(typeof KEYS)[number], string | undefined>>, fn: () => void) {
  const saved: Record<string, string | undefined> = {};
  for (const k of KEYS) saved[k] = process.env[k];
  try {
    for (const k of KEYS) {
      if (env[k] === undefined) delete process.env[k];
      else process.env[k] = env[k] as string;
    }
    fn();
  } finally {
    for (const k of KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k] as string;
    }
  }
}

test('وضع العرض (الافتراضي) يستمع على loopback فقط', () => {
  withEnv({}, () => assert.equal(getListenHost(), '127.0.0.1'));
});

test('الوضع الصارم يستمع على كل الواجهات للنشر الشبكي', () => {
  withEnv({ DEMO_MODE: 'false' }, () => assert.equal(getListenHost(), '0.0.0.0'));
});

test('داخل Electron يبقى على loopback حتى في الوضع الصارم', () => {
  const versions = process.versions as Record<string, string | undefined>;
  const had = Object.prototype.hasOwnProperty.call(versions, 'electron');
  const prev = versions.electron;
  try {
    Object.defineProperty(process.versions, 'electron', { value: '99.0.0', configurable: true });
    withEnv({ DEMO_MODE: 'false' }, () => assert.equal(getListenHost(), '127.0.0.1'));
    withEnv({ DEMO_MODE: 'false', HOST: '0.0.0.0' }, () => assert.equal(getListenHost(), '0.0.0.0'));
  } finally {
    if (had) Object.defineProperty(process.versions, 'electron', { value: prev, configurable: true });
    else delete versions.electron;
  }
});

test('HOST الصريح يتقدّم على الافتراضات', () => {
  withEnv({ HOST: '10.0.0.5' }, () => assert.equal(getListenHost(), '10.0.0.5'));
  withEnv({ HOST: '0.0.0.0', DEMO_MODE: 'true' }, () => assert.equal(getListenHost(), '0.0.0.0'));
});

test('وحدة SQL مقفلة افتراضياً حتى في وضع العرض', () => {
  withEnv({}, () => assert.equal(isSqlConsoleAllowed(), false));
  withEnv({ DEMO_MODE: 'true' }, () => assert.equal(isSqlConsoleAllowed(), false));
  withEnv({ DEMO_MODE: 'false' }, () => assert.equal(isSqlConsoleAllowed(), false));
});

test('وحدة SQL تُفتح فقط بـ ALLOW_SQL_CONSOLE=true صراحةً', () => {
  withEnv({ ALLOW_SQL_CONSOLE: 'true' }, () => assert.equal(isSqlConsoleAllowed(), true));
  withEnv({ ALLOW_SQL_CONSOLE: 'yes' }, () => assert.equal(isSqlConsoleAllowed(), false));
});

test('executeSql لا يُعيد err.stack للعميل', () => {
  const src = fs.readFileSync(path.resolve(process.cwd(), 'src/utils/migrate.ts'), 'utf-8');
  assert.ok(!/error:\s*err\.stack/.test(src), 'يجب ألا تُعاد stack trace في الاستجابة');
});

test('server.ts يستخدم getListenHost ولا يثبّت 0.0.0.0', () => {
  const src = fs.readFileSync(path.resolve(process.cwd(), 'server.ts'), 'utf-8');
  assert.match(src, /httpServer\.listen\(PORT, LISTEN_HOST/);
  assert.ok(!/httpServer\.listen\(PORT, '0\.0\.0\.0'/.test(src));
});
