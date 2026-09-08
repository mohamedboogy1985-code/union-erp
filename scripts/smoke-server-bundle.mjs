// One-shot startup regression check for the CJS server used by the Windows package.
// No live provider keys, database writes, microphone, or real login credentials are used.
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { once } from 'node:events';
import assert from 'node:assert/strict';

const portProbe = createServer();
portProbe.listen(0, '127.0.0.1');
await once(portProbe, 'listening');
const port = portProbe.address().port;
await new Promise((resolve) => portProbe.close(resolve));

const child = spawn(process.execPath, ['dist-server/index.cjs'], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    NODE_ENV: 'production',
    PORT: String(port),
    DEMO_MODE: 'true',
    DISABLE_EMBEDDED_PG: 'true',
    DATABASE_URL: '',
    SQL_HOST: '',
    ERP_ADMIN_PASSWORD_HASH: '',
    ERP_USER_PASSWORD_HASHES: '',
    JULES_ENABLED: 'false',
    JULES_API_KEY: '',
    AI_ASSISTANT_ENABLED: 'false',
    AI_ASSISTANT_GEMINI_API_KEY: '',
    DID_AVATAR_ENABLED: 'false',
    DID_API_KEY: '',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let output = '',
  errors = '',
  checking = false;
try {
  await new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('The bundled server did not start within 25 seconds.')),
      25000
    );
    child.stderr.on('data', (data) => {
      errors = (errors + data.toString()).slice(-2500);
    });
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('exit', (code) => {
      if (!checking) {
        clearTimeout(timer);
        reject(new Error(`Bundled server exited ${code}: ${errors}`));
      }
    });
    child.stdout.on('data', async (data) => {
      output = (output + data.toString()).slice(-4000);
      if (checking || !output.includes('Server running on')) return;
      checking = true;
      try {
        const response = await fetch(`http://127.0.0.1:${port}/api/operator-assistant/status`, {
          signal: AbortSignal.timeout(5000),
        });
        assert.equal(response.status, 200);
        const state = await response.json();
        assert.equal(state.textReady, false);
        assert.equal(state.avatarReady, false);
        const page = await fetch(`http://127.0.0.1:${port}/`, {
          signal: AbortSignal.timeout(5000),
        });
        assert.equal(page.status, 200);
        assert.equal(page.headers.get('x-frame-options'), 'SAMEORIGIN');
        await page.arrayBuffer();
        clearTimeout(timer);
        resolve();
      } catch (error) {
        clearTimeout(timer);
        reject(error);
      }
    });
  });
  console.log(
    'PASS: bundled server starts, serves the application, and keeps the assistant disabled without setup.'
  );
} finally {
  child.kill('SIGTERM');
  if (child.exitCode === null && child.signalCode === null) await once(child, 'exit');
}
