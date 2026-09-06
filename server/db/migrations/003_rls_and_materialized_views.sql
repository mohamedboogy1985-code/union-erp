-- Migration 003: RLS + Materialized Views + Partitioning + pgvector (اختياري)
-- التاريخ: 2026-09-06
-- ملاحظة: RLS يُفعل فقط في الإنتاج متعدد المنظمات، لا في وضع العرض المحلي

BEGIN;

-- 1) Row Level Security للعزل متعدد المنظمات
-- تفعيل RLS
ALTER TABLE journal_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Policy: كل منظمة ترى بياناتها فقط (يُضبط app.org_id عبر SET LOCAL)
-- مثال: SET LOCAL app.org_id = 'org-general';
DROP POLICY IF EXISTS org_isolation_journal_entries ON journal_entries;
CREATE POLICY org_isolation_journal_entries ON journal_entries
  FOR ALL USING (organization_id = current_setting('app.org_id', true) OR current_setting('app.org_id', true) IS NULL);

DROP POLICY IF EXISTS org_isolation_receipts ON receipts;
CREATE POLICY org_isolation_receipts ON receipts
  FOR ALL USING (organization_id = current_setting('app.org_id', true) OR current_setting('app.org_id', true) IS NULL);

-- 2) Materialized View لميزان المراجعة (يتحدث كل ساعة عبر cron)
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
GROUP BY jl.account_id, a.code, a.name, a.type;

CREATE UNIQUE INDEX IF NOT EXISTS mv_trial_balance_account_id_idx ON mv_trial_balance(account_id);
CREATE INDEX IF NOT EXISTS mv_trial_balance_type_idx ON mv_trial_balance(account_type);

-- 3) Materialized View لملخص شهري للإيرادات/المصروفات
DROP MATERIALIZED VIEW IF EXISTS mv_monthly_income_expense;
CREATE MATERIALIZED VIEW mv_monthly_income_expense AS
SELECT
  SUBSTRING(je.date FROM 1 FOR 7) AS month, -- YYYY-MM
  a.type AS account_type,
  SUM(jl.debit) AS total_debit,
  SUM(jl.credit) AS total_credit
FROM journal_lines jl
JOIN journal_entries je ON je.id = jl.journal_entry_id
JOIN accounts a ON a.id = jl.account_id
WHERE je.status = 'POSTED'
GROUP BY month, a.type
ORDER BY month DESC;

CREATE INDEX IF NOT EXISTS mv_monthly_month_idx ON mv_monthly_income_expense(month DESC);

-- 4) Partitioning لجدول audit_logs شهرياً (اختياري — للإنتاج الكبير)
-- يتطلب pg_partman أو إنشاء يدوي للأقسام
-- CREATE TABLE audit_logs_2026_09 PARTITION OF audit_logs FOR VALUES FROM ('2026-09-01') TO ('2026-10-01');

-- 5) pgvector للـ RAG الدلالي (اختياري — يحتاج تثبيت pgvector extension)
-- CREATE EXTENSION IF NOT EXISTS vector;
-- CREATE TABLE IF NOT EXISTS kb_embeddings (
--   id text PRIMARY KEY,
--   content text NOT NULL,
--   embedding vector(768),
--   type text, -- RULE, REGULATION, FAQ, ACCOUNT
--   reference text,
--   created_at timestamp DEFAULT now()
-- );
-- CREATE INDEX IF NOT EXISTS kb_embeddings_vector_idx ON kb_embeddings USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

COMMIT;

-- تعليمات التحديث:
-- REFRESH MATERIALIZED VIEW CONCURRENTLY mv_trial_balance;
-- REFRESH MATERIALIZED VIEW CONCURRENTLY mv_monthly_income_expense;
-- يمكن جدولتها عبر cron كل ساعة: 0 * * * * psql -c "REFRESH MATERIALIZED VIEW CONCURRENTLY mv_trial_balance"
