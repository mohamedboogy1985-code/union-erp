-- Migration 002: فهارس أداء مركبة + pg_trgm للبحث العربي
-- التاريخ: 2026-09-06

BEGIN;

-- تفعيل امتداد البحث النصي العربي (trigram)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- accounts
CREATE INDEX IF NOT EXISTS accounts_type_idx ON accounts(type);
CREATE INDEX IF NOT EXISTS accounts_parent_id_idx ON accounts(parent_id);
CREATE INDEX IF NOT EXISTS accounts_is_active_idx ON accounts(is_active);
CREATE INDEX IF NOT EXISTS accounts_org_idx ON accounts(organization_id);
CREATE INDEX IF NOT EXISTS accounts_name_trgm_idx ON accounts USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS accounts_code_trgm_idx ON accounts USING gin (code gin_trgm_ops);

-- subledger_parties
CREATE INDEX IF NOT EXISTS subledger_parties_name_idx ON subledger_parties(name);
CREATE INDEX IF NOT EXISTS subledger_parties_name_trgm_idx ON subledger_parties USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS subledger_parties_type_idx ON subledger_parties(type);
CREATE INDEX IF NOT EXISTS subledger_parties_org_idx ON subledger_parties(organization_id);

-- journal_entries: أهم فهرس مركب للتقارير
CREATE INDEX IF NOT EXISTS journal_entries_org_idx ON journal_entries(organization_id);
CREATE INDEX IF NOT EXISTS journal_entries_date_idx ON journal_entries(date DESC);
CREATE INDEX IF NOT EXISTS journal_entries_status_idx ON journal_entries(status);
CREATE INDEX IF NOT EXISTS journal_entries_period_idx ON journal_entries(period_id);
CREATE INDEX IF NOT EXISTS journal_entries_org_status_date_idx ON journal_entries(organization_id, status, date DESC);

-- journal_lines
CREATE INDEX IF NOT EXISTS journal_lines_entry_idx ON journal_lines(journal_entry_id);
CREATE INDEX IF NOT EXISTS journal_lines_account_idx ON journal_lines(account_id);
CREATE INDEX IF NOT EXISTS journal_lines_subledger_idx ON journal_lines(subledger_party_id);
CREATE INDEX IF NOT EXISTS journal_lines_account_entry_idx ON journal_lines(account_id, journal_entry_id);

-- receipts
CREATE INDEX IF NOT EXISTS receipts_org_date_idx ON receipts(organization_id, date DESC);
CREATE INDEX IF NOT EXISTS receipts_number_idx ON receipts(receipt_number);

-- audit_logs
CREATE INDEX IF NOT EXISTS audit_logs_user_idx ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS audit_logs_action_idx ON audit_logs(action);
CREATE INDEX IF NOT EXISTS audit_logs_timestamp_idx ON audit_logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS audit_logs_entity_idx ON audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS audit_logs_org_idx ON audit_logs(organization_id);
CREATE INDEX IF NOT EXISTS audit_logs_org_timestamp_idx ON audit_logs(organization_id, timestamp DESC);

COMMIT;
