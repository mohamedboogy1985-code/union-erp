-- Migration 005: apply the user-selected Article 72 interpretation to existing SQL stores.
-- The accepted operational rule is 95% for completed, compliant works and a separate
-- 5% guaranteed remainder. New stores receive 95% from REGULATION_ACTIVATED_RULES;
-- this migration updates only an enabled Article 72 works rule still holding the prior
-- application default of 5. The separate 5% remainder and 75% materials rule are untouched.
-- The selected reading is based on a user-provided electronic Gazette copy that is not
-- authenticated for circulation; this migration records the user's operational choice,
-- not a claim that the uploaded file is an original or certified legal instrument.
-- Re-runnable: once updated to 95, the row no longer matches the WHERE clause.

UPDATE "regulation_rules"
SET "value" = '95',
    "value_type" = 'number',
    "article_no" = '72',
    "enabled" = true,
    "updated_at" = now()
WHERE "rule_id" = 'CONTRACT_WORKS_PROGRESS_PCT'
  AND "value" = '5'
  AND "value_type" = 'number'
  AND "article_no" = '72'
  AND "enabled" = true;
