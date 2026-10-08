import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const viteConfig = readFileSync(new URL('../vite.config.ts', import.meta.url), 'utf8');
const serverSource = readFileSync(new URL('../server.ts', import.meta.url), 'utf8');

test('Vite preview shares a single React runtime and accepts the proxied preview host', () => {
  assert.match(viteConfig, /dedupe:\s*\[['"]react['"],\s*['"]react-dom['"]\]/);
  assert.match(viteConfig, /allowedHosts:\s*\[[^\]]*['"]\.arena\.site['"]/);
  assert.match(viteConfig, /allowedHosts:\s*\[[^\]]*['"]\.e2b\.app['"]/);
  assert.match(serverSource, /app\.use\('\/api', createRateLimiter\(/, 'API request limits should not throttle Vite modules/HMR during a page load');
  assert.doesNotMatch(serverSource, /app\.use\(createRateLimiter\(/, 'the generic rate limiter must not wrap the entire frontend preview');
});

test('middleware-mode HMR shares the application HTTP server and supports HTTPS proxy ports', () => {
  assert.equal((serverSource.match(/const httpServer = http\.createServer\(app\)/g) ?? []).length, 1);
  assert.match(serverSource, /server:\s*httpServer/);
  assert.match(serverSource, /clientPort:\s*hmrClientPort/);
  assert.match(serverSource, /process\.env\.DISABLE_HMR === 'true'[\s\S]*?false/);
});
