/**
 * ===== حراسة أسماء النماذج (عقد منع التصنيع P0-1) =====
 * كان سرب الوكيل AetherSwarm يستدعي أسماء نماذج **غير موجودة** لدى المزوّد:
 * `gemini-3.8-flash` (20 موضعاً)، `gemini-3.5-transcribe` (10)، `gemini-3.5-flash` (9)،
 * `gemini-3.8-live` (6)، `gemini-3.1-pro-preview` (5)، `gemini-3.1-flash-lite` (5)
 * — بينما النماذج المعلنة فعلاً هي `AI_MODELS = ['gemini-3.7-flash','gemini-3.6-flash']`
 * (server/services/ai.service.ts:29). النتيجة العملية: كل نداءات الذكاء في السرب تفشل،
 * والواجهة تعرض «النموذج المستخدم» اسماً لم يُستخدم قط — وهو ادّعاء غير صحيح لا يُكتشف.
 *
 * ما تثبته هذه الاختبارات:
 *  1) كل اسم نموذج مكتوب نصاً في شيفرة الخادم أو الواجهة أو السكربتات موجود في `AI_MODELS`.
 *  2) لا وجود لأي من الأسماء المخترَعة السابقة في أي ملف شيفرة.
 *  3) ثوابت الواجهة (`SWARM_AI_MODELS`) وثابت الجلسة الحية (`AI_LIVE_MODEL`) مطابقة للخادم.
 *  4) نوافذ النسخ/المحادثة تعرض الاسم الحقيقي لا اسماً ثابتاً منسوخاً.
 *
 * التشغيل: npx tsx --test test/ai-model-names.test.ts
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { AI_MODELS, AI_PRIMARY_MODEL, AI_LIVE_MODEL } from '../server/services/ai.service.js';

const ROOT = process.cwd();

/** الأسماء التي سمح بها المشروع صراحةً بجانب نماذج التوليد (تضمين فقط) */
const ALLOWED_EXTRA_MODELS = ['gemini-embedding-001'];

/** أسماء مخترَعة أُزيلت — يُمنع رجوعها */
const BANNED = ['gemini-3.8-flash', 'gemini-3.5-transcribe', 'gemini-3.5-flash', 'gemini-3.8-live', 'gemini-3.1-pro-preview', 'gemini-3.1-flash-lite'];

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  const walk = (current: string) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.') || entry.name === '__tests__') continue;
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(ts|tsx|js|mjs|cjs)$/.test(entry.name)) out.push(full);
    }
  };
  walk(path.join(ROOT, dir));
  return out;
}

/** إزالة التعليقات: ذكر الاسم المخترَع في شرح «ما كان خطأً» ليس استدعاءً له */
const stripComments = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:"'\\])\/\/.*$/gm, '$1');

test('every model name literal in code is one the server actually declares', () => {
  const files = [...sourceFiles('server'), ...sourceFiles('src'), ...sourceFiles('scripts')];
  const offenders: string[] = [];

  for (const file of files) {
    const code = stripComments(fs.readFileSync(file, 'utf-8'));
    // اسم النموذج لا بد أن يحمل رقماً (3.7-flash / embedding-001)؛ «Gemini» وحده اسم المنتج لا نموذج
    for (const match of code.matchAll(/['"`]((?:gemini|gemma|gpt|claude)-[a-z0-9.\-]*\d[a-z0-9.\-]*)['"`]/gi)) {
      const name = match[1];
      if (name.endsWith('-')) continue; // بادئة أو مقطع نصي
      if (AI_MODELS.includes(name) || ALLOWED_EXTRA_MODELS.includes(name)) continue;
      offenders.push(`${path.relative(ROOT, file)} → ${name}`);
    }
  }

  assert.deepEqual(offenders, [], `أسماء نماذج غير معلنة في الشيفرة:\n${offenders.join('\n')}`);
});

test('the previously invented model names never come back', () => {
  const files = [...sourceFiles('server'), ...sourceFiles('src'), ...sourceFiles('scripts')];
  const found: string[] = [];
  for (const file of files) {
    const code = stripComments(fs.readFileSync(file, 'utf-8'));
    for (const banned of BANNED) if (code.includes(banned)) found.push(`${path.relative(ROOT, file)} → ${banned}`);
  }
  assert.deepEqual(found, [], `أسماء نماذج مخترَعة عادت:\n${found.join('\n')}`);
  for (const banned of BANNED) assert.equal(AI_MODELS.includes(banned), false);
});

test('the swarm route uses the declared models, not hard-coded strings', () => {
  const route = fs.readFileSync(path.join(ROOT, 'server', 'routes', 'aetherswarm.routes.ts'), 'utf-8');
  assert.match(route, /AI_PRIMARY_MODEL/, 'the orchestrator/step calls must use the declared primary model');
  assert.match(route, /AI_MODELS/, 'the chat endpoint must allow only the declared models');
  assert.match(route, /AI_LIVE_MODEL/, 'the live session must use the configurable live model');
  assert.match(route, /const allowedModels = \[\.\.\.AI_MODELS\]/, 'the allow-list must derive from AI_MODELS');
  assert.equal(/model: 'gemini-/.test(route), false, 'no model may be hard-coded in a call');
});

test('the swarm UI exposes the same models as the server (and no invented label)', () => {
  const modelFile = fs.readFileSync(path.join(ROOT, 'src', 'aetherswarm', 'model.ts'), 'utf-8');
  const declared = [...modelFile.matchAll(/'([a-z0-9.\-]*gemini[a-z0-9.\-]*)'/gi)].map((match) => match[1]);
  const swarmModels = declared.filter((name) => !name.includes('embedding'));
  assert.deepEqual(swarmModels, [...AI_MODELS], 'the UI model list must equal the server AI_MODELS');

  const app = fs.readFileSync(path.join(ROOT, 'src', 'aetherswarm', 'AetherSwarmApp.tsx'), 'utf-8');
  // بعد التصلّب: خطوات السرب حتمية عبر أدوات ERP — لا استدعاء نموذج لكل وكيل.
  // لذلك بطاقة الوكيل تُعلن `DETERMINISTIC`، وأسماء النماذج تبقى في أسطح المحادثة/الصوت فقط.
  assert.match(app, /model: 'DETERMINISTIC'/, 'agent cards must not claim a model call they never make');
  assert.equal(/model: SWARM_AI_MODEL/.test(app), false, 'لا بطاقة وكيل تدّعي استدعاء نموذج');
  assert.equal(app.includes('gemini-3.8'), false);

  const chatbot = fs.readFileSync(path.join(ROOT, 'src', 'aetherswarm', 'components', 'GeminiChatbotView.tsx'), 'utf-8');
  assert.match(chatbot, /SWARM_AI_MODELS\[0\]/);
  assert.match(chatbot, /SWARM_AI_MODELS\[1\]/);
  assert.equal(/modelUsed: 'gemini-/.test(chatbot), false, 'no model may be reported as used unless it is declared');

  for (const component of ['AudioTranscribeModal.tsx', 'VoiceChatBar.tsx', 'Header.tsx', 'LiveVoiceModal.tsx']) {
    const source = fs.readFileSync(path.join(ROOT, 'src', 'aetherswarm', 'components', component), 'utf-8');
    for (const banned of BANNED) assert.equal(source.includes(banned), false, `${component} still names ${banned}`);
  }
});

test('the live model is configurable rather than invented', () => {
  assert.equal(AI_LIVE_MODEL, process.env.AI_LIVE_MODEL || AI_PRIMARY_MODEL);
  assert.ok(AI_MODELS.includes(AI_PRIMARY_MODEL));
  const aiService = fs.readFileSync(path.join(ROOT, 'server', 'services', 'ai.service.ts'), 'utf-8');
  assert.match(aiService, /export const AI_LIVE_MODEL = process\.env\.AI_LIVE_MODEL \|\| AI_PRIMARY_MODEL/);
});
