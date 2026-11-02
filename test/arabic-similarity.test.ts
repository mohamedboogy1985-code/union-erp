/**
 * انحدار: calculateSimilarity كانت تنهار بـ ReferenceError لأي نصين غير متطابقين.
 * التشغيل: npx tsx --test test/arabic-similarity.test.ts
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateSimilarity, normalizeArabicText } from '../server/utils/arabic.js';

test('normalizeArabicText memoization and cache eviction', () => {
  // Test memoization identity and consistency
  const input = '  شَركة الأَهْرامِ للمُقَاوَلَاتِ   ';
  const first = normalizeArabicText(input);
  const second = normalizeArabicText(input);
  assert.equal(first, 'شركه الاهرام للمقاولات');
  assert.equal(first, second);

  // Exercise cache over limit to verify bounded eviction without errors
  for (let i = 0; i < 1100; i++) {
    normalizeArabicText(`عنصر تجريبي رقم ${i}`);
  }
  // Original normalization remains correct
  assert.equal(normalizeArabicText(input), 'شركه الاهرام للمقاولات');
});

test('نصان متطابقان → 1', () => {
  assert.equal(calculateSimilarity('مصروفات صيانة', 'مصروفات صيانة'), 1);
});

test('اختلاف الهمزة يُعدّ تطابقاً بعد التطبيع', () => {
  assert.equal(calculateSimilarity('أحمد', 'احمد'), 1);
});

test('نصان مختلفان لا يرميان استثناءً ويعطيان قيمة بين 0 و1', () => {
  const v = calculateSimilarity('مصروفات صيانة', 'مصاريف الصيانة');
  assert.ok(v > 0 && v < 1, `القيمة ${v}`);
});

test('نص فارغ → 0', () => {
  assert.equal(calculateSimilarity('', 'شيء'), 0);
});

test('الأقرب أعلى تشابهاً من الأبعد', () => {
  const near = calculateSimilarity('مكتب الأهرام للتوريدات', 'مكتب الاهرام للتوريدات الهندسية');
  const far = calculateSimilarity('مكتب الأهرام للتوريدات', 'شركة النور للمقاولات');
  assert.ok(near > far);
});
