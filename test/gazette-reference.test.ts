import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { USER_PROVIDED_GAZETTE_REFERENCE } from '../server/data/gazette-reference.js';
import { STATUTE_DOCUMENT } from '../server/data/statute-articles.js';
import { FINANCIAL_REGULATION_SOURCE } from '../server/data/financial-regulation.js';

test('the uploaded Gazette copy supports the issue reference but is not represented as a certified source', () => {
  const sourcePdf = readFileSync(new URL('../الوقائع المصرية 25-12-2025.pdf', import.meta.url));
  const sourceHash = createHash('sha256').update(sourcePdf).digest('hex');

  assert.equal(USER_PROVIDED_GAZETTE_REFERENCE.referenceAr, 'الوقائع المصرية - العدد ۲۷۹ تابع (ب) في ۱۱ ديسمبر سنة ٢٠٢٥');
  assert.equal(USER_PROVIDED_GAZETTE_REFERENCE.issueDate, '2025-12-11');
  assert.equal(USER_PROVIDED_GAZETTE_REFERENCE.sourceFileName, 'الوقائع المصرية 25-12-2025.pdf');
  assert.equal(sourcePdf.byteLength, USER_PROVIDED_GAZETTE_REFERENCE.sourceFileSizeBytes);
  assert.equal(sourceHash, USER_PROVIDED_GAZETTE_REFERENCE.sourceFileSha256);
  assert.equal(USER_PROVIDED_GAZETTE_REFERENCE.sourcePageCount, 47);
  assert.deepEqual(USER_PROVIDED_GAZETTE_REFERENCE.reviewedPhysicalPages, [1, 26, 40, 41]);
  assert.equal(USER_PROVIDED_GAZETTE_REFERENCE.verificationStatus, 'USER_PROVIDED_COPY_REVIEWED_NOT_AUTHENTICATED');
  assert.match(USER_PROVIDED_GAZETTE_REFERENCE.noteAr, /تمت مراجعة نسخة PDF المرفوعة/);
  assert.match(USER_PROVIDED_GAZETTE_REFERENCE.noteAr, /صورة إلكترونية لا يعتد بها عند التداول/);
  assert.match(USER_PROVIDED_GAZETTE_REFERENCE.noteAr, /لا يثبت أصالتها أو رقم محضر الإيداع/);
  assert.match(USER_PROVIDED_GAZETTE_REFERENCE.noteAr, /لا يُنشئ هذا المرجع نصاً قانونياً ولا يعدّل مواد اللوائح/);

  assert.equal(STATUTE_DOCUMENT.officialGazetteRef, USER_PROVIDED_GAZETTE_REFERENCE.referenceAr);
  assert.equal(STATUTE_DOCUMENT.gazetteRecord.gazetteIssueNumber, '279');
  assert.equal(STATUTE_DOCUMENT.gazetteRecord.gazetteIssuePart, 'تابع (ب)');
  assert.equal(STATUTE_DOCUMENT.gazetteRecord.gazetteIssueDate, '2025-12-11');
  assert.equal(STATUTE_DOCUMENT.gazetteRecord.status, 'PARTIAL', 'deposit-record details and a certified copy remain open');
  assert.match(STATUTE_DOCUMENT.openItems.find((item) => item.id === 'ST-OPEN-001')?.blockingAr ?? '', /يثبت الملف المرفق ما يظهر/);

  assert.equal(FINANCIAL_REGULATION_SOURCE.verificationStatus, 'ATTACHED_COPY_NOT_AUTHENTICATED');
  assert.equal(FINANCIAL_REGULATION_SOURCE.gazetteReference, USER_PROVIDED_GAZETTE_REFERENCE);
});
