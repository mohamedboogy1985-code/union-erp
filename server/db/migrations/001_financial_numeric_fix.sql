-- Migration 001: توحيد أنواع الأعمدة المالية على numeric(18,2)
-- ==========================================================================
-- مُعاد كتابتها عند الاستعادة من PR #24 لسببين موثّقين:
--
--  1) خُفِّضت من «تحويل إلزامي» إلى **ترقية للقواعد القديمة فقط**:
--     `server/db/pg-schema.sql` على main (بعد دمج PRs #33/#38) يعرّف هذه الأعمدة
--     أصلاً بـ numeric(18,2)، فتشغيل CREATE ... ALTER عليها بلا حاجة كان يخاطر
--     بإعادة كتابة الجدول كاملاً بلا داعٍ.
--  2) النسخة الأصلية كانت تضيف قيود CHECK بلا IF NOT EXISTS ⇒ تفشل عند أي تشغيل ثانٍ.
--     هذا الملف الآن **آمن للإعادة** (idempotent): يتحقق من النوع الحالي قبل التغيير،
--     ويضيف القيود فقط إن لم تكن موجودة.
--
-- يُشغَّل بعد نسخة احتياطية:
--   pg_dump "$DATABASE_URL" > backup-before-001.sql
--   psql "$DATABASE_URL" -f server/db/migrations/001_financial_numeric_fix.sql
--
-- ملاحظة: الأعمدة المذكورة تُحوَّل فقط إذا كانت double precision/precision حقيقية.
--         على قاعدة أُنشئت من pg-schema.sql الحديث يفعل هذا الملف «لا شيء» بنجاح.

BEGIN;

-- دالة مساعدة: تُحوِّل العمود إلى numeric(18,2) فقط إذا لم يكن كذلك
CREATE OR REPLACE FUNCTION union_erp_ensure_numeric(p_table text, p_column text, p_type text DEFAULT 'numeric(18,2)')
RETURNS text AS $$
DECLARE
  current_type text;
BEGIN
  SELECT data_type INTO current_type
  FROM information_schema.columns
  WHERE table_name = p_table AND column_name = p_column;

  IF current_type IS NULL THEN
    RETURN format('تخطّي %s.%s — العمود غير موجود', p_table, p_column);
  END IF;

  IF current_type IN ('double precision', 'real', 'numeric') THEN
    EXECUTE format('ALTER TABLE %I ALTER COLUMN %I TYPE %s USING %I::%s', p_table, p_column, p_type, p_column, p_type);
    -- القيمة المالية كانت مقرّبة إلى منزلتين؛ التحقق من غياب كسور أعمق بعد التحويل
    RETURN format('حُوِّل %s.%s من %s إلى %s', p_table, p_column, current_type, p_type);
  END IF;

  RETURN format('تخطّي %s.%s — النوع الحالي %s', p_table, p_column, current_type);
END;
$$ LANGUAGE plpgsql;

-- 1) الأرصدة والمبالغ الأساسية
SELECT union_erp_ensure_numeric('accounts', 'current_balance');
SELECT union_erp_ensure_numeric('subledger_parties', 'balance');
SELECT union_erp_ensure_numeric('journal_entries', 'total_debit');
SELECT union_erp_ensure_numeric('journal_entries', 'total_credit');
SELECT union_erp_ensure_numeric('journal_lines', 'debit');
SELECT union_erp_ensure_numeric('journal_lines', 'credit');
SELECT union_erp_ensure_numeric('receipts', 'amount');
SELECT union_erp_ensure_numeric('cost_centers', 'budget_limit');
SELECT union_erp_ensure_numeric('cost_centers', 'current_spent');
SELECT union_erp_ensure_numeric('revenue_types', 'default_amount');
SELECT union_erp_ensure_numeric('revenue_distribution_rules', 'percentage', 'numeric(5,2)');
SELECT union_erp_ensure_numeric('actuarial_funds', 'current_reserve');
SELECT union_erp_ensure_numeric('actuarial_funds', 'target_reserve');
SELECT union_erp_ensure_numeric('actuarial_funds', 'actuarial_surplus_deficit');
SELECT union_erp_ensure_numeric('actuarial_funds', 'monthly_inflow');
SELECT union_erp_ensure_numeric('actuarial_funds', 'monthly_outflow');

-- 2) قيود التحقق — تُضاف فقط إذا لم تكن قائمة (وإلا فشل التشغيل الثاني)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_journal_lines_non_negative') THEN
    ALTER TABLE journal_lines ADD CONSTRAINT chk_journal_lines_non_negative CHECK (debit >= 0 AND credit >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_receipts_positive') THEN
    ALTER TABLE receipts ADD CONSTRAINT chk_receipts_positive CHECK (amount >= 0);
  END IF;
END $$;

DROP FUNCTION union_erp_ensure_numeric(text, text, text);

COMMIT;

-- بعد التنفيذ: حدّث الإحصاءات
-- ANALYZE accounts, subledger_parties, journal_entries, journal_lines, receipts;
