/**
 * ===== توسيع مترادفات المساعد المحلي (المرحلة P3) =====
 * استُعيد من PR #24: قاموس المترادفات كان 6 مجموعات، وأصبح 25 مجموعة (154 مفردة فريدة).
 *
 * ما تثبته هذه الاختبارات:
 *  1) القاموس بالحجم المعلن فعلاً (25 مجموعة/154 مفردة فريدة) — لا ادّعاء بلا قياس.
 *  2) التوسيع يضيف كلمات المجموعة الحقيقية للمفردات (والكلمات الأصلية لا تُحذف).
 *  3) التوسيع يطابق المفردات حتى مع اختلاف الهمزات/التشكيل (تطبيع عربي).
 *  4) لا يُضاف شيء لسؤال خارج القاموس، ولا يتحول التوسيع إلى «إجابة» — نص الاستعلام فقط.
 *
 * التشغيل: npx tsx --test test/smart-agent-synonyms.test.ts
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { expandArabicQueryForTest } from '../server/services/smart-agent.service.js';

const source = fs.readFileSync(path.resolve(process.cwd(), 'server', 'services', 'smart-agent.service.ts'), 'utf-8');
const groupsBlock = source.slice(source.indexOf('const SYNONYM_GROUPS'), source.indexOf('];', source.indexOf('const SYNONYM_GROUPS')));

function parseGroups(): { group: string; words: string[] }[] {
  return [...groupsBlock.matchAll(/\{ group: '([^']+)', words: \[([^\]]*)\] \}/g)].map((match) => ({
    group: match[1],
    words: [...match[2].matchAll(/'([^']*)'/g)].map((word) => word[1]),
  }));
}

test('the synonym dictionary declares 25 groups and 154 unique words', () => {
  const groups = parseGroups();
  assert.equal(groups.length, 25, `expected 25 groups, found ${groups.length}`);
  const words = groups.flatMap((group) => group.words);
  assert.equal(words.length, 154, `expected 154 word entries, found ${words.length}`);
  assert.equal(new Set(words).size, 154, 'word entries must not be duplicated across groups');
  for (const { group, words: list } of groups) assert.ok(list.length >= 4, `group «${group}» looks thin`);
  // المجموعات الست الأصلية باقية بلا تراجع
  for (const original of ['مصروفات', 'مشتريات', 'مدينون', 'اشتراكات', 'رواتب', 'معاشات'])
    assert.ok(groups.some((group) => group.group === original), `original group «${original}» was dropped`);
});

test('expansion adds the sibling synonyms of the matched group and keeps the user wording', () => {
  const expanded = expandArabicQueryForTest('عايز أعرف المصاريف الشهرية');
  assert.ok(expanded.includes('مصاريف'), 'the user word must stay');
  assert.ok(expanded.includes('نفقات'), 'expansion must add siblings of the same group');
  assert.ok(expanded.includes('مصروفات عمومية'));
});

test('expansion matches through Arabic normalization (hamza/spacing) without inventing answers', () => {
  const expanded = expandArabicQueryForTest('ايجار المقر');
  assert.ok(expanded.includes('كراء'), 'the إيجار group must expand');
  assert.ok(expanded.includes('سكن'));

  const unrelated = expandArabicQueryForTest('ما هو الطقس اليوم؟');
  assert.equal(unrelated.includes('نفقات'), false, 'unrelated questions must not be expanded');
  assert.equal(unrelated.includes('كراء'), false);
  assert.ok(unrelated.length > 0);
});

test('the expansion is deterministic and additive only', () => {
  const first = expandArabicQueryForTest('سلفة عامل');
  const second = expandArabicQueryForTest('سلفة عامل');
  assert.equal(first, second, 'expansion must be deterministic');
  assert.ok(first.includes('عهدة') && first.includes('قرض'));
  // التوسيع لا يحذف كلمات المستخدم
  for (const token of ['سلفة', 'عامل']) assert.ok(first.includes(token));
});
