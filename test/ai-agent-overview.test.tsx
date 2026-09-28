/**
 * ===== تبويب «نظرة عامة — الوكيل الذكي المتكامل» (AiAgentOverview) =====
 * الشاشة استُعيدت من PR #24/#26 بعد إعادة كتابتها: كل رقم عليها يُقرأ من الخادم لحظياً
 * أو يُعرض «—»، وكل مسار مذكور عليها موجود فعلاً في مسارات الخادم.
 *
 * العقد المرجعي: docs/AI_AGENT_AUDIT.md (بند P0-1) + test/ai-no-fabrication.test.ts.
 *
 * ما تثبته هذه الاختبارات:
 *  1) الشاشة تُصيّر القدرات الأربع بعناوينها الحقيقية بلا انهيار في أول رسم.
 *  2) كل مسار `/api/...` مذكور في الشاشة (أو في مستندها) مُسجَّل فعلاً في الخادم —
 *     لا مسارات متقاعدة مثل `/api/live-agent` (يعيد 410) ولا أسماء وهمية.
 *  3) لا أرقام أداء مُختلَقة في الشاشة أو المستند (1247/94%/892/23/1.2s...).
 *  4) شعار تبويب AiHub يُشتق من عدد القدرات الفعلي، لا رقم مكتوب يدوياً.
 *
 * التشغيل: npx tsx --test test/ai-agent-overview.test.tsx
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AiAgentOverview, AI_AGENT_CAPABILITY_COUNT } from '../src/pages/AiAgentOverview.js';

const read = (...segments: string[]) => fs.readFileSync(path.resolve(process.cwd(), ...segments), 'utf-8');

/** يزيل التعليقات حتى لا تُحسب الملاحظات التوثيقية (مثل «هذا المسار متقاعد») كانتهاكات */
const stripTsComments = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:"'\\])\/\/.*$/gm, '$1');

/** أسطر وثّقَت مسارات متقاعدة أو أرقاماً أُزيلت تبقى مذكورة بالقصد — تُستثنى من الفحص */
const liveDocLines = (markdown: string) =>
  markdown
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('>') && !/متقاعد|retired/.test(line))
    .join('\n');

/** كل شيفرة الخادم في نص واحد: server.ts + ملفات server/ */
function serverSource(): string {
  const files: string[] = [read('server.ts')];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.ts$/.test(entry.name)) files.push(fs.readFileSync(full, 'utf-8'));
    }
  };
  walk(path.resolve(process.cwd(), 'server'));
  return files.join('\n');
}

test('AiAgentOverview renders its four real capabilities without crashing', () => {
  const html = renderToStaticMarkup(
    <AiAgentOverview organizationId="org-general" onShowToast={() => undefined} onNavigate={() => undefined} />
  );
  assert.equal(AI_AGENT_CAPABILITY_COUNT, 4, 'the badge count must follow the capability list');
  assert.match(html, /الوكيل الذكي المتكامل/);
  assert.match(html, /المستشار المالي الذكي/);
  assert.match(html, /التحويل الصوتي إلى قيود/);
  assert.match(html, /قراءة الفواتير والمستندات/);
  assert.match(html, /التدقيق وكشف الشذوذ/);
  // القيم غير المقروءة تُعرض «—» لا صفراً ولا رقماً وهمياً
  assert.match(html, /—/);
});

test('every endpoint named on the screen is actually registered by the server', () => {
  const screen = stripTsComments(read('src', 'pages', 'AiAgentOverview.tsx'));
  const doc = liveDocLines(read('docs', 'AI_AGENT_OVERVIEW.md'));
  const server = serverSource();

  const endpoints = new Set<string>();
  for (const source of [screen, doc])
    for (const match of source.matchAll(/(?:\/api\/[a-z0-9-]+(?:\/[a-z0-9-]+)*)/g)) endpoints.add(match[0]);

  assert.ok(endpoints.size >= 10, `expected a real endpoint table, found ${endpoints.size}`);
  const missing = [...endpoints].filter((endpoint) => !server.includes(endpoint));
  assert.deepEqual(missing, [], `endpoints documented but not registered on the server: ${missing.join(', ')}`);

  // المسار المتقاعد بعد Operator Assistant (يعيد 410) لا يُذكر في الشاشة كمسار حيّ
  assert.equal(screen.includes('live-agent'), false, 'the retired /api/live-agent must not be named');
  for (const endpoint of endpoints) assert.equal(/^\/api\/(stream|agent)$/.test(endpoint), false);
});

test('no fabricated performance numbers are shown on the overview screen or its document', () => {
  const sources = [
    stripTsComments(read('src', 'pages', 'AiAgentOverview.tsx')),
    liveDocLines(read('docs', 'AI_AGENT_OVERVIEW.md')),
  ];
  const forbidden = [
    '1247', // عدد استعلامات مُختلَق
    '94%', // دقة مُختلَقة
    '892', // قيود مُختلَقة
    '1.2s', // زمن استجابة مُختلَق
    '23 حالة', // حالات ذهبية مُختلَقة
  ];
  for (const source of sources)
    for (const value of forbidden) assert.equal(source.includes(value), false, `fabricated value ${value} found`);
});

test('AiHub derives the overview badge from the capability count', () => {
  const hub = read('src', 'pages', 'AiHub.tsx');
  assert.match(hub, /AI_AGENT_CAPABILITY_COUNT/);
  assert.equal(/badge: '\d+ قدرات'/.test(hub), false, 'the badge must not hard-code a number');
});
