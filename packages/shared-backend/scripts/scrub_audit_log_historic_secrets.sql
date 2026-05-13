-- Scrub historic plaintext/ciphertext secrets from the audit_logs table.
--
-- WHY: prior to PR #618, the audit mask did not fire for these field names
-- because either the name was misspelled (MJH/MGA: "totp_secret_encrypted"
-- vs actual column "totp_secret") or the name pointed at a hybrid_property
-- accessor instead of the underlying column (MBK: "access_token" /
-- "refresh_token" vs actual columns "access_token_encrypted" /
-- "refresh_token_encrypted"). The listener captured raw values into
-- audit_logs.old_value / new_value. PR #618 fixes the masking; this script
-- scrubs the historic rows that already shipped.
--
-- SEVERITY: MJH/MGA totp_secret / totp_recovery_codes rows contained
-- PLAINTEXT (their columns use the EncryptedString TypeDecorator, which
-- encrypts at bind-time AFTER the audit listener reads the Python value).
-- MBK rows contained CIPHERTEXT (service-layer encryption sets the
-- attribute to ciphertext before the listener fires). Both are scrubbed
-- to "***" for parity.
--
-- WHEN: run AFTER PR #618 is deployed to each app. Running before deploy
-- is harmless — the listener will continue to write fresh leaks until the
-- new code is live, so the rerun-friendly idempotency keeps you safe.
--
-- HOW TO RUN (one DB at a time):
--
--   # MyBookkeeper (apps/mybookkeeper)
--   docker compose -f apps/mybookkeeper/docker-compose.yml exec -T postgres \
--     psql -U mybookkeeper mybookkeeper \
--     < packages/shared-backend/scripts/scrub_audit_log_historic_secrets.sql
--
--   # MyJobHunter (apps/myjobhunter)
--   docker compose -f apps/myjobhunter/docker-compose.yml exec -T postgres \
--     psql -U myjobhunter myjobhunter \
--     < packages/shared-backend/scripts/scrub_audit_log_historic_secrets.sql
--
--   # MyGamingAssistant (apps/mygamingassistant)
--   docker compose -f apps/mygamingassistant/docker-compose.yml exec -T postgres \
--     psql -U mygamingassistant mygamingassistant \
--     < packages/shared-backend/scripts/scrub_audit_log_historic_secrets.sql
--
-- IDEMPOTENT: re-running the UPDATE is a no-op once rows are already
-- masked. The pre/post counts let you confirm the scrub took effect.
--
-- NOT REVERSIBLE: the scrubbed values cannot be recovered. That is the
-- point — these rows should never have held the values in the first place.
--
-- APPEND-ONLY TRIGGER (observed 2026-05-13 on MBK prod):
--
-- audit_logs has a ``prevent_audit_log_mutation()`` BEFORE-UPDATE-OR-DELETE
-- trigger that aborts the transaction with:
--   "audit_logs table is append-only: UPDATE operations are not allowed"
--
-- This is the correct security design — audit trails must be tamper-proof —
-- and it WILL block this script if rows exist. The pre-scrub count still
-- runs (SELECT is allowed), so you can see how many rows would be touched
-- before the UPDATE statement aborts.
--
-- When this happens:
--   * If the rows are CIPHERTEXT (MBK service-layer-encrypted columns:
--     access_token_encrypted, refresh_token_encrypted, totp_secret,
--     totp_recovery_codes) → LOW severity. Leave them. The new audit mask
--     stops fresh ciphertext from being added; existing rows are useless
--     without ENCRYPTION_KEY anyway. Preserving the append-only guarantee
--     is more valuable than scrubbing 22 rows of ciphertext.
--   * If the rows are PLAINTEXT (MJH/MGA EncryptedString columns, where
--     the audit listener captures the Python value before bind-time
--     encryption fires) → real exposure. Coordinate with the operator to
--     temporarily disable the trigger via SQL:
--       ALTER TABLE audit_logs DISABLE TRIGGER prevent_audit_log_mutation;
--       -- run this script's UPDATE
--       ALTER TABLE audit_logs ENABLE TRIGGER prevent_audit_log_mutation;
--     Document the action in the operational runbook (the audit chain
--     for THIS scrub is now broken; the disable/enable boundary IS the
--     evidence).
--
-- As of PR #618 deploy: MJH had 0 plaintext rows (no TOTP enrollments
-- ever happened pre-fix); MGA wasn't yet deployed; MBK had 22 ciphertext
-- rows that were left in place per the LOW-severity rule above.

BEGIN;

-- ----------------------------------------------------------------------------
-- Pre-scrub: count rows that will be modified.
-- ----------------------------------------------------------------------------
SELECT
    field_name,
    COUNT(*) AS rows_to_scrub,
    COUNT(DISTINCT changed_by) AS distinct_actors,
    MIN(id) AS earliest_id,
    MAX(id) AS latest_id
FROM audit_logs
WHERE
    field_name IN (
        'totp_secret',
        'totp_recovery_codes',
        'access_token_encrypted',
        'refresh_token_encrypted'
    )
    AND (
        (old_value IS NOT NULL AND old_value <> '***')
        OR
        (new_value IS NOT NULL AND new_value <> '***')
    )
GROUP BY field_name
ORDER BY field_name;

-- ----------------------------------------------------------------------------
-- Scrub: overwrite non-null, non-masked old_value / new_value with '***'.
-- Idempotent: rows already at '***' are excluded by the WHERE filter.
-- ----------------------------------------------------------------------------
UPDATE audit_logs
SET
    old_value = CASE WHEN old_value IS NOT NULL THEN '***' ELSE NULL END,
    new_value = CASE WHEN new_value IS NOT NULL THEN '***' ELSE NULL END
WHERE
    field_name IN (
        'totp_secret',
        'totp_recovery_codes',
        'access_token_encrypted',
        'refresh_token_encrypted'
    )
    AND (
        (old_value IS NOT NULL AND old_value <> '***')
        OR
        (new_value IS NOT NULL AND new_value <> '***')
    );

-- ----------------------------------------------------------------------------
-- Post-scrub: this query MUST return 0 rows. If it doesn't, something is
-- wrong (mismatched field-name set, partial update). Investigate before
-- committing.
-- ----------------------------------------------------------------------------
SELECT COUNT(*) AS rows_still_unmasked
FROM audit_logs
WHERE
    field_name IN (
        'totp_secret',
        'totp_recovery_codes',
        'access_token_encrypted',
        'refresh_token_encrypted'
    )
    AND (
        (old_value IS NOT NULL AND old_value <> '***')
        OR
        (new_value IS NOT NULL AND new_value <> '***')
    );

COMMIT;
