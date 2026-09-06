-- Migration 001: إصلاح نوع البيانات المالية من double precision إلى numeric(18,2)
-- التاريخ: 2026-09-06
-- السبب: double precision يسبب أخطاء تقريب محاسبية (0.1+0.2 != 0.3)
-- الحل: تحويل كل الأرصدة والمبالغ إلى numeric(18,2) مع الحفاظ على البيانات

-- ملاحظة: شغل هذا الملف يدوياً على قاعدة الإنتاج بعد نسخ احتياطي
-- pg_dump قبل التنفيذ إلزامي

BEGIN;

-- 1) accounts.current_balance
ALTER TABLE accounts ALTER COLUMN current_balance TYPE numeric(18,2) USING current_balance::numeric(18,2);

-- 2) subledger_parties.balance
ALTER TABLE subledger_parties ALTER COLUMN balance TYPE numeric(18,2) USING balance::numeric(18,2);

-- 3) cost_centers
ALTER TABLE cost_centers ALTER COLUMN budget_limit TYPE numeric(18,2) USING budget_limit::numeric(18,2);
ALTER TABLE cost_centers ALTER COLUMN current_spent TYPE numeric(18,2) USING current_spent::numeric(18,2);

-- 4) journal_entries
ALTER TABLE journal_entries ALTER COLUMN total_debit TYPE numeric(18,2) USING total_debit::numeric(18,2);
ALTER TABLE journal_entries ALTER COLUMN total_credit TYPE numeric(18,2) USING total_credit::numeric(18,2);

-- 5) journal_lines
ALTER TABLE journal_lines ALTER COLUMN debit TYPE numeric(18,2) USING debit::numeric(18,2);
ALTER TABLE journal_lines ALTER COLUMN credit TYPE numeric(18,2) USING credit::numeric(18,2);

-- 6) receipts
ALTER TABLE receipts ALTER COLUMN amount TYPE numeric(18,2) USING amount::numeric(18,2);

-- 7) revenue_types
ALTER TABLE revenue_types ALTER COLUMN default_amount TYPE numeric(18,2) USING default_amount::numeric(18,2);

-- 8) revenue_distribution_rules
ALTER TABLE revenue_distribution_rules ALTER COLUMN percentage TYPE numeric(5,2) USING percentage::numeric(5,2);

-- 9) actuarial_funds
ALTER TABLE actuarial_funds ALTER COLUMN current_reserve TYPE numeric(18,2) USING current_reserve::numeric(18,2);
ALTER TABLE actuarial_funds ALTER COLUMN target_reserve TYPE numeric(18,2) USING target_reserve::numeric(18,2);
ALTER TABLE actuarial_funds ALTER COLUMN actuarial_surplus_deficit TYPE numeric(18,2) USING actuarial_surplus_deficit::numeric(18,2);
ALTER TABLE actuarial_funds ALTER COLUMN monthly_inflow TYPE numeric(18,2) USING monthly_inflow::numeric(18,2);
ALTER TABLE actuarial_funds ALTER COLUMN monthly_outflow TYPE numeric(18,2) USING monthly_outflow::numeric(18,2);

-- 10) إضافة قيود تحقق (CHECK) لمنع أرصدة سالبة غير منطقية حيث يلزم
ALTER TABLE journal_lines ADD CONSTRAINT chk_journal_lines_non_negative CHECK (debit >= 0 AND credit >= 0);
ALTER TABLE receipts ADD CONSTRAINT chk_receipts_positive CHECK (amount >= 0);

COMMIT;

-- بعد التنفيذ: شغل ANALYZE لتحديث إحصاءات المخطط
-- ANALYZE accounts, subledger_parties, journal_entries, journal_lines, receipts;
