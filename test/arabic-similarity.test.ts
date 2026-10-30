/**
 * انحدار: calculateSimilarity كانت تنهار بـ ReferenceError لأي نصين غير متطابقين.
 * التشغيل: npx tsx --test test/arabic-similarity.test.ts
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateSimilarity, normalizeArabicText } from '../server/utils/arabic.js';

test('تطبيع النص العربي وإزالة التشكيل والهمزات', () => {
  assert.equal(normalizeArabicText('أَحْمَدُ مَحْمُودٌ'), 'احمد محمود');
  assert.equal(normalizeArabicText('فَاطِمَةُ'), 'فاطمه');
  assert.equal(normalizeArabicText('مُسْتَشْفَى'), 'مستشفي');
});

test('تكرار استدعاء التطبيع يسترجع النتيجة المخبأة من الـ Cache', () => {
  const input = 'شركة الأمل للمقاولات والتطوير';
  const firstPass = normalizeArabicText(input);
  const secondPass = normalizeArabicText(input);
  assert.equal(firstPass, 'شركه الامل للمقاولات والتطوير');
  assert.equal(secondPass, firstPass);
});

test('تطبيع نص فارغ يُعيد نص فارغ', () => {
  assert.equal(normalizeArabicText(''), '');
  assert.equal(normalizeArabicText(null as unknown as string), '');
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
