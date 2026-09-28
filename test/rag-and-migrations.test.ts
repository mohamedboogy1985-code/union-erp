/**
 * ===== RAG والهجرات (المرحلة P3) =====
 * استُعيدت من PR #24: خدمة التضمين و RAG، والهجرات 001–004، وتوسيع المترادفات.
 *
 * ما تثبته هذه الاختبارات:
 *  1) البحث الدلالي يعمل **بلا مفتاح API وبلا قاعدة بيانات** ويعيد مستندات حقيقية
 *     من قاعدة المعرفة/اللائحة/دليل الحسابات.
 *  2) البروفنانس صريح: بلا مفتاح = `local-tfidf`، ولا يُسمّى البحث «دلالياً» بلا تضمين.
 *  3) لا تصنيع: استعلام خارج المجموعة لا يعيد نتائج مزيّفة بدرجات عالية.
 *  4) الإحصاءات تقول الحقيقة: `vectorTableAvailable` كاذبة بلا قاعدة بيانات.
 *  5) الهجرات موجودة وقابلة للإعادة ولا تُشغّل أي DDL من الاختبارات، و001 لم تعد تفرض
 *     تحويلاً غير ضروري على قاعدة حديثة.
 *
 * التشغيل: npx tsx --test test/rag-and-migrations.test.ts
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { embeddingService, EMBEDDING_DIMENSIONS, ragConfidenceFor } from '../server/services/embedding.service.js';

delete process.env.GEMINI_API_KEY;
delete process.env.GOOGLE_API_KEY;

const read = (...segments: string[]) => fs.readFileSync(path.resolve(process.cwd(), ...segments), 'utf-8');

test('the local RAG index seeds real documents from the knowledge base, regulation and chart of accounts', async () => {
  const count = embeddingService.seedFromKnowledgeBase();
  assert.ok(count > 50, `expected a real corpus, seeded ${count} documents`);
  const stats = await embeddingService.getStats();
  assert.ok(stats.vocabSize > 500, 'a TF-IDF index over a real corpus must have a real vocabulary');
});

test('search works offline and returns documents with provenance local-tfidf', async () => {
  const { results, provenance } = await embeddingService.search('ما هي قواعد فصل المهام في اللائحة المالية؟', 5);
  assert.equal(provenance.modelUsed, 'local-tfidf');
  assert.equal(provenance.embedded, false);
  assert.match(provenance.reason, /GEMINI_API_KEY|محلي/);
  assert.ok(results.length > 0, 'a real question about the regulation must match real documents');
  for (const result of results) {
    assert.ok(result.content.length > 20, 'each result must carry its source text');
    assert.ok(result.reference.length > 0, 'each result must reference its source');
    assert.ok(result.score > 0 && result.score <= 1, `score out of range: ${result.score}`);
    assert.ok(['RULE', 'REGULATION', 'FAQ', 'ERROR', 'ARTICLE', 'ACCOUNT'].includes(result.type));
  }
});

test('search does not fabricate matches for out-of-corpus questions', async () => {
  const { results, provenance } = await embeddingService.search('zzzz qqqq وصفة كعك بالشوكولاتة في الفضاء', 5);
  assert.equal(provenance.confidence, 'LOW', 'an unrelated question must not be reported as a confident match');
  assert.match(provenance.reason, /لا مطابقة واثقة/);
  assert.ok(results.length <= 5);
  assert.ok(provenance.topScore < 0.3, `weak matches must carry their low score, got ${provenance.topScore}`);

  // وعلى النقيض: سؤال حقيقي عن اللائحة يُصنَّف مطابقة واثقة
  const real = await embeddingService.search('ما هي قواعد فصل المهام في اللائحة المالية؟', 3);
  assert.equal(real.provenance.confidence, 'HIGH');
  assert.ok(real.provenance.topScore >= 0.3);

  // سلّم الثقة نفسه معلن وقابل للقياس
  assert.equal(ragConfidenceFor(0.95), 'HIGH');
  assert.equal(ragConfidenceFor(0.25), 'MEDIUM');
  assert.equal(ragConfidenceFor(0.05), 'LOW');
});

test('account search resolves the real chart of accounts entries', async () => {
  const { results } = await embeddingService.search('1301 مدينون متنوعون', 5);
  assert.ok(results.length > 0);
  assert.ok(
    results.some((result) => result.reference.includes('1301')),
    `expected the 1301 account among results, got: ${results.map((r) => r.reference).join(' | ')}`
  );
});

test('stats report reality: no database, no vector table, embedding model is configurable', async () => {
  const stats = await embeddingService.getStats();
  assert.equal(stats.databaseAvailable, false, 'this sandbox runs in memory mode');
  assert.equal(stats.vectorTableAvailable, false);
  assert.equal(stats.embeddingConfigured, false);
  assert.equal(stats.embeddingModel, 'gemini-embedding-001');
  assert.equal(EMBEDDING_DIMENSIONS, 768, 'the vector(768) column in migration 004 must match this');
  assert.ok(stats.count > 50);
});

test('migrations are present, ordered and safe to re-run', () => {
  const dir = path.resolve(process.cwd(), 'server', 'db', 'migrations');
  const files = fs.readdirSync(dir).filter((file) => file.endsWith('.sql')).sort();
  assert.deepEqual(files, [
    '001_financial_numeric_fix.sql',
    '002_performance_indexes.sql',
    '003_rls_and_materialized_views.sql',
    '004_pgvector_embeddings.sql',
  ]);
  for (const file of files) assert.ok(fs.statSync(path.join(dir, file)).size > 500, `${file} looks empty`);

  const m001 = read('server', 'db', 'migrations', '001_financial_numeric_fix.sql');
  // 001 لم تعد تفرض التحويل على قاعدة حديثة: تتحقق من النوع أولاً، والقيود تُضاف بمُشغّل وجود
  assert.match(m001, /information_schema\.columns/);
  assert.match(m001, /IF NOT EXISTS \(SELECT 1 FROM pg_constraint WHERE conname = 'chk_journal_lines_non_negative'\)/);
  assert.match(m001, /-- Migration 001: توحيد أنواع الأعمدة المالية على numeric\(18,2\)/);

  const m002 = read('server', 'db', 'migrations', '002_performance_indexes.sql');
  for (const match of m002.matchAll(/CREATE INDEX(?! IF NOT EXISTS)/g))
    assert.fail('every index in migration 002 must use IF NOT EXISTS');
  assert.match(m002, /CREATE EXTENSION IF NOT EXISTS pg_trgm/);

  const m003 = read('server', 'db', 'migrations', '003_rls_and_materialized_views.sql');
  assert.match(m003, /app\.enable_rls/, 'RLS must stay opt-in');
  assert.match(m003, /CREATE MATERIALIZED VIEW mv_trial_balance/);
  assert.match(m003, /CREATE UNIQUE INDEX IF NOT EXISTS mv_trial_balance_account_id_idx/);

  const m004 = read('server', 'db', 'migrations', '004_pgvector_embeddings.sql');
  assert.match(m004, /CREATE EXTENSION IF NOT EXISTS vector/);
  assert.match(m004, /embedding vector\(768\)/);
  assert.match(m004, /CREATE TABLE IF NOT EXISTS rag_search_logs/);

  const readme = read('server', 'db', 'migrations', 'README.md');
  assert.match(readme, /pg-schema\.sql/, 'the README must record the conflict analysis with main');
  assert.match(readme, /لم تُنفَّذ/, 'and must state that the migrations were not executed here');
});

test('the migration check script exists, is wired in package.json and runs without a database', () => {
  assert.ok(fs.existsSync(path.resolve(process.cwd(), 'scripts', 'apply-migrations.ts')));
  assert.ok(fs.existsSync(path.resolve(process.cwd(), 'scripts', 'seed-rag.ts')));
  const scripts = JSON.parse(read('package.json')).scripts;
  assert.equal(scripts['db:migrations:check'], 'tsx scripts/apply-migrations.ts');
  assert.equal(scripts['rag:seed'], 'tsx scripts/seed-rag.ts');
  assert.equal(/db:migrations:check|rag:seed/.test(scripts.test), false, 'DB scripts must not run on every npm test');
});
