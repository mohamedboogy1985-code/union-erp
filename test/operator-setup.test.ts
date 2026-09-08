import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
import { parse } from 'dotenv';
import {
  buildSetupPatch,
  mergeEnvironment,
  readSetupEnvironment,
  saveSetupEnvironment,
  setupStatus,
  strongSecret,
} from '../scripts/operator-setup-lib.mjs';
import { isWeakSecret } from '../server/security/runtime-config.js';
import { getSessionToken, setSessionToken } from '../src/services/api.js';
import { streamGlobalAiChat } from '../src/services/ai-stream.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const hash = bcrypt.hashSync('dummy-password-for-local-setup', 10);
const key = 'dummy-gemini-api-key-for-test-only';
const didKey = 'dummy-did-user:dummy-did-password';
const existing = () => ({
  JWT_SECRET: 'existing-jwt-secret-for-test-only',
  ENCRYPTION_KEY: 'existing-encryption-secret-test-only',
  ERP_ADMIN_PASSWORD_HASH: hash,
});
const options = () => ({ consent: true, geminiKey: key, passwordHash: hash, enableVideo: false });

function temporary() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'union-operator-setup-'));
  return { directory, cleanup: () => fs.rmSync(directory, { recursive: true, force: true }) };
}

test('initial setup creates strong local secrets, not provider keys, and requires explicit consent', () => {
  const patch = buildSetupPatch({}, options());
  assert.equal(patch.AI_ASSISTANT_GEMINI_API_KEY, key);
  assert.equal(patch.ERP_ADMIN_PASSWORD_HASH, hash);
  assert.equal(patch.DID_AVATAR_ENABLED, 'false');
  assert.ok(/^[0-9a-f]{64}$/.test(patch.JWT_SECRET));
  assert.ok(/^[0-9a-f]{64}$/.test(patch.ENCRYPTION_KEY));
  assert.notEqual(patch.JWT_SECRET, patch.ENCRYPTION_KEY);
  assert.equal(setupStatus(patch).localConfigurationReady, true);
  assert.equal(setupStatus(patch).providerConnectionTested, false);
  assert.throws(() => buildSetupPatch({}, { ...options(), consent: false }));
  assert.throws(() => buildSetupPatch({}, { ...options(), geminiKey: '' }));
  assert.throws(() =>
    buildSetupPatch({}, { ...options(), passwordHash: 'plaintext-is-not-accepted' })
  );
});

test('existing encryption/JWT secrets and unrelated Jules/database settings are not rotated', () => {
  const original = {
    ...existing(),
    JULES_API_KEY: 'existing-jules-key-for-test-only',
    DATABASE_URL: 'postgresql://sample:sample@db/erp',
  };
  const patch = buildSetupPatch(original, { ...options(), passwordHash: undefined });
  assert.ok(!Object.hasOwn(patch, 'JWT_SECRET'));
  assert.ok(!Object.hasOwn(patch, 'ENCRYPTION_KEY'));
  assert.ok(!Object.hasOwn(patch, 'JULES_API_KEY'));
  assert.ok(!Object.hasOwn(patch, 'DATABASE_URL'));
  assert.throws(
    () => buildSetupPatch({ ...original, ENCRYPTION_KEY: 'default-key' }, options()),
    /تدوير/
  );
  const withVideo = buildSetupPatch(original, {
    ...options(),
    enableVideo: true,
    didKey: `Basic ${didKey}`,
    agentId: 'agt_test',
  });
  assert.equal(withVideo.DID_API_KEY, didKey);
  assert.equal(withVideo.DID_AGENT_ID, 'agt_test');
  assert.equal(withVideo.DID_AVATAR_ENABLED, 'true');
  assert.throws(() =>
    buildSetupPatch(original, { ...options(), enableVideo: true, didKey, agentId: '../escape' })
  );
});

test('setup strength policy matches runtime checks for placeholders and valid secrets', () => {
  for (const value of [
    '',
    'secret',
    'default-key',
    'replace_with_a_strong_random_32_byte_hex_key',
    '<strong-random-secret>',
    'short',
    '1234567890123456',
    existing().JWT_SECRET,
  ]) {
    assert.equal(strongSecret(value), !isWeakSecret(value));
  }
});

test('environment editing preserves comments, multiline unrelated values and CRLF; replaces duplicate target assignments', () => {
  const source = [
    '# keep this comment',
    "DATABASE_URL='postgresql://test:test@db/erp'",
    'CERT="first',
    'AI_ASSISTANT_ENABLED=do-not-touch-this-multiline-content',
    'last"',
    'JULES_ENABLED=true',
    'AI_ASSISTANT_ENABLED=false # old value',
    'export AI_ASSISTANT_ENABLED=false',
    '',
  ].join('\r\n');
  const output = mergeEnvironment(source, {
    AI_ASSISTANT_ENABLED: 'true',
    ERP_ADMIN_PASSWORD_HASH: hash,
  });
  const parsed = parse(output),
    before = parse(source);
  assert.equal(parsed.AI_ASSISTANT_ENABLED, 'true');
  assert.equal(parsed.ERP_ADMIN_PASSWORD_HASH, hash);
  assert.equal(parsed.CERT, before.CERT);
  assert.equal(parsed.DATABASE_URL, before.DATABASE_URL);
  assert.equal(parsed.JULES_ENABLED, 'true');
  assert.ok(output.includes('# keep this comment\r\n'));
  assert.equal(output.split("AI_ASSISTANT_ENABLED='true'").length - 1, 1);
  assert.ok(!output.includes('export AI_ASSISTANT_ENABLED'));
  assert.throws(() => mergeEnvironment(source, { DATABASE_URL: 'not-editable' }));
  assert.throws(() => mergeEnvironment(source, { DID_API_KEY: 'injection\nEVIL=true' }));
});

test('saving is atomic, private, has no plaintext backup and refuses concurrent edits', () => {
  const temp = temporary();
  try {
    const original = readSetupEnvironment(temp.directory);
    const patch = buildSetupPatch({}, options());
    const status = saveSetupEnvironment(temp.directory, original, patch);
    assert.equal(status.localConfigurationReady, true);
    assert.deepEqual(fs.readdirSync(temp.directory), ['.env']);
    if (process.platform !== 'win32')
      assert.equal(fs.statSync(path.join(temp.directory, '.env')).mode & 0o777, 0o600);
    assert.equal(readSetupEnvironment(temp.directory).values.AI_ASSISTANT_GEMINI_API_KEY, key);
    const snapshot = readSetupEnvironment(temp.directory);
    fs.appendFileSync(path.join(temp.directory, '.env'), '# changed elsewhere\n');
    assert.throws(() => saveSetupEnvironment(temp.directory, snapshot, patch), /تغيّر/);
    assert.ok(
      fs.readFileSync(path.join(temp.directory, '.env'), 'utf8').endsWith('# changed elsewhere\n')
    );
    assert.deepEqual(fs.readdirSync(temp.directory), ['.env']);
  } finally {
    temp.cleanup();
  }
});

test(
  'setup refuses symlinked .env files without modifying their destinations',
  { skip: process.platform === 'win32' },
  () => {
    const temp = temporary();
    try {
      const destination = path.join(temp.directory, 'private-target');
      fs.writeFileSync(destination, 'untouched');
      fs.symlinkSync(destination, path.join(temp.directory, '.env'));
      assert.throws(() => readSetupEnvironment(temp.directory));
      assert.equal(fs.readFileSync(destination, 'utf8'), 'untouched');
    } finally {
      temp.cleanup();
    }
  }
);

test('CLI readiness check does not print secrets, write .env, or claim a live provider connection', () => {
  const before = readSetupEnvironment(root);
  const result = spawnSync(
    process.execPath,
    ['scripts/configure-operator-assistant.mjs', '--check'],
    {
      cwd: root,
      encoding: 'utf8',
      env: {
        ...process.env,
        ...existing(),
        AI_ASSISTANT_ENABLED: 'true',
        AI_ASSISTANT_MODEL: 'gemini-3.7-flash',
        DEMO_MODE: 'false',
        AI_ASSISTANT_GEMINI_API_KEY: key,
        DID_API_KEY: didKey,
        DID_AGENT_ID: 'agt_test',
        DID_AVATAR_ENABLED: 'true',
      },
    }
  );
  assert.equal(result.status, 0);
  const status = JSON.parse(result.stdout);
  assert.equal(status.localConfigurationReady, true);
  assert.equal(status.videoConfigurationReady, true);
  assert.equal(status.providerConnectionTested, false);
  for (const secret of [key, didKey, hash, existing().JWT_SECRET, existing().ENCRYPTION_KEY])
    assert.ok(!`${result.stdout}${result.stderr}`.includes(secret));
  const after = readSetupEnvironment(root);
  assert.equal(after.source === before.source && after.existed === before.existed, true);
});

test('interactive setup refuses closed stdin and rejects secret-bearing CLI arguments without echoing them', () => {
  for (const args of [[], ['--api-key=do-not-echo-this-credential']]) {
    const result = spawnSync(
      process.execPath,
      ['scripts/configure-operator-assistant.mjs', ...args],
      { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
    );
    assert.equal(result.status, 1);
    assert.ok(result.stderr.includes('طرفية'));
    assert.ok(!`${result.stdout}${result.stderr}`.includes('do-not-echo-this-credential'));
  }
});

test('the shared streaming client forwards the authenticated ERP session instead of relying only on demo headers', async () => {
  const originalFetch = globalThis.fetch,
    oldToken = getSessionToken();
  setSessionToken('dummy-stream-session-token');
  let authorization: string | null = null;
  globalThis.fetch = async (url, options = {}) => {
    assert.equal(url, '/api/ai/global-chat/stream');
    authorization = new Headers(options.headers).get('Authorization');
    return new Response('data: {"chunk":"رد اختبار"}\n\ndata: {"done":true}\n\n', {
      headers: { 'Content-Type': 'text/event-stream' },
    });
  };
  try {
    assert.equal(await streamGlobalAiChat({ message: 'اختبار' }), 'رد اختبار');
    assert.equal(authorization, 'Bearer dummy-stream-session-token');
  } finally {
    globalThis.fetch = originalFetch;
    setSessionToken(oldToken);
  }
});
