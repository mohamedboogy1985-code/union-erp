-- Migration 003: عزل الصفوف (اختياري) + Materialized Views
-- ==========================================================================
-- استُعيدت من PR #24 مع تغيير واحد جوهري: **RLS لم يبقَ تلقائياً**.
--
--   • في النسخة الأصلية كانت `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` تُنفَّذ دائماً،
--     وفيها سياسات تسمح بكل الصفوف عندما لا يُضبط `app.org_id` — أي أن تفعيل RLS
--     بلا ضبط الإعداد يعطي شكلاً من العزل بلا عزل فعلي، وهو خطر أمني مضلّل.
--   • هنا: لا يُفعَّل RLS إلا إذا طلبت الجلسة ذلك صراحةً:
--       SET app.enable_rls = 'on';
--       psql "$DATABASE_URL" -f server/db/migrations/003_rls_and_materialized_views.sql
--     وبلا هذا الإعداد يمر الملف بلا تغيير RLS (مع NOTICE واضح).
--
--   • Materialized Views تُنشأ دائماً (آمنة وقابلة للإعادة) مع الفهارس الفريدة اللازمة
--     لـ REFRESH ... CONCURRENTLY.
--
-- ملاحظة: لم تُنفَّذ الهجرات في بيئة هذا المستودع (لا PostgreSQL متاح) — نفّذها على قاعدة
--         حقيقية بعد نسخة احتياطية، وأعد الأمر عند الحاجة (الملف قابل للإعادة).

BEGIN;

-- 1) عزل الصفوف — اختياري وصريح
DO $$
BEGIN
  IF current_setting('app.enable_rls', true) IS DISTINCT FROM 'on' THEN
    RAISE NOTICE 'RLS غير مُفعّل: مرّر app.enable_rls=on في الجلسة نفسها لتفعيله';
    RETURN;
  END IF;

  EXECUTE 'ALTER TABLE journal_entries ENABLE ROW LEVEL SECURITY';
  EXECUTE 'ALTER TABLE journal_lines ENABLE ROW LEVEL SECURITY';
  EXECUTE 'ALTER TABLE receipts ENABLE ROW LEVEL SECURITY';
  EXECUTE 'ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY';

  EXECUTE 'DROP POLICY IF EXISTS org_isolation_journal_entries ON journal_entries';
  EXECUTE $policy$
    CREATE POLICY org_isolation_journal_entries ON journal_entries
      FOR ALL USING (organization_id = current_setting('app.org_id', true))
  $policy$;

  EXECUTE 'DROP POLICY IF EXISTS org_isolation_receipts ON receipts';
  EXECUTE $policy$
    CREATE POLICY org_isolation_receipts ON receipts
      FOR ALL USING (organization_id = current_setting('app.org_id', true))
  $policy$;

  RAISE NOTICE 'تم تفعيل RLS وسياسات العزل على 4 جداول';
END $$;

-- 2) ميزان المراجعة كمادة مُخزَّنة (يتحدث دورياً)
DROP MATERIALIZED VIEW IF EXISTS mv_trial_balance;
CREATE MATERIALIZED VIEW mv_trial_balance AS
SELECT
  jl.account_id,
  a.code AS account_code,
  a.name AS account_name,
  a.type AS account_type,
  SUM(jl.debit) AS total_debit,
  SUM(jl.credit) AS total_credit,
  SUM(jl.debit - jl.credit) AS net_balance
FROM journal_lines jl
JOIN journal_entries je ON je.id = jl.journal_entry_id
JOIN accounts a ON a.id = jl.account_id
WHERE je.status = 'POSTED'
GROUP BY jl.account_id, a.code, a.name, a.type
WITH DATA;

-- فهرس فريد مطلوب لـ REFRESH MATERIALIZED VIEW CONCURRENTLY
CREATE UNIQUE INDEX IF NOT EXISTS mv_trial_balance_account_id_idx ON mv_trial_balance(account_id);
CREATE INDEX IF NOT EXISTS mv_trial_balance_type_idx ON mv_trial_balance(account_type);

-- 3) صافي الإيرادات والمصروفات شهرياً
DROP MATERIALIZED VIEW IF EXISTS mv_monthly_income_expense;
CREATE MATERIALIZED VIEW mv_monthly_income_expense AS
SELECT
  SUBSTRING(je.date FROM 1 FOR 7) AS month,
  a.type AS account_type,
  SUM(jl.debit) AS total_debit,
  SUM(jl.credit) AS total_credit
FROM journal_lines jl
JOIN journal_entries je ON je.id = jl.journal_entry_id
JOIN accounts a ON a.id = jl.account_id
WHERE je.status = 'POSTED'
GROUP BY month, a.type
WITH DATA;

CREATE UNIQUE INDEX IF NOT EXISTS mv_monthly_income_expense_month_type_idx
  ON mv_monthly_income_expense(month, account_type);
CREATE INDEX IF NOT EXISTS mv_monthly_month_idx ON mv_monthly_income_expense(month DESC);

COMMIT;

-- التحديث الدوري (كل ساعة عبر cron):
--   REFRESH MATERIALIZED VIEW CONCURRENTLY mv_trial_balance;
--   REFRESH MATERIALIZED VIEW CONCURRENTLY mv_monthly_income_expense;
