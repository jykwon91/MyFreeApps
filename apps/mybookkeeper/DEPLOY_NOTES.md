# Deploy Notes

Deployment-specific instructions for migrations and other changes that require
manual steps or extra care in production.

---

## PR: Email Verification

**Migration:** `b7e9d3a14f02_grandfather_existing_users_verified`

### What this migration does

Sets `is_verified = TRUE` for all existing users so they are not locked out
when the `LOGIN_USER_NOT_VERIFIED` check goes live. New registrations after
this deploy will follow the full email verification flow.

### After deploying

Verify all existing users are marked verified:

```sql
-- Both counts should match (zero unverified existing users).
SELECT
  COUNT(*) AS total_users,
  COUNT(*) FILTER (WHERE is_verified) AS verified_users
FROM users;
```

### Rollback

The downgrade function for this migration is intentionally a no-op — there
is no safe way to distinguish grandfathered users from genuinely unverified
ones after the fact. If rollback is needed, restore from a pre-deploy backup.

---

## PR: Encrypt Integration OAuth Tokens

**Migration:** `aa1bb2cc3dd4_encrypt_integration_oauth_tokens`

### Before deploying

1. Take a full database backup:
   ```bash
   sudo mybookkeeper-backup
   # or manually:
   pg_dump -Fc mybookkeeper > backup-pre-encrypt-tokens-$(date +%Y%m%d%H%M%S).dump
   ```
   Store the backup file somewhere safe — this migration drops the original
   `access_token` and `refresh_token` plaintext columns and **cannot be
   rolled back via `alembic downgrade`**.

2. Verify `ENCRYPTION_KEY` is set in the production `.env`:
   ```bash
   grep ENCRYPTION_KEY /srv/mybookkeeper/.env
   ```
   The application will fail to start if this variable is missing.

### Migration behaviour

- Adds `access_token_encrypted` (Text, nullable), `refresh_token_encrypted` (Text, nullable), and `key_version` (SmallInteger, default 1)
- Backfills all existing rows: tokens that were already Fernet-encrypted by the application are detected by their `gAAAAA` prefix and copied as-is; truly plaintext tokens are encrypted with Fernet before being written to the new columns
- The backfill is idempotent — rows where `access_token_encrypted IS NOT NULL` are skipped, so re-running the migration after an interruption is safe
- Drops the old `access_token` and `refresh_token` plaintext columns after backfill

### After deploying

Verify no plaintext token data remains:

```sql
-- Should return 0 rows (no unencrypted tokens present).
-- Fernet tokens always start with 'gAAAAA'.
SELECT id, provider
FROM integrations
WHERE access_token_encrypted IS NOT NULL
  AND access_token_encrypted NOT LIKE 'gAAAAA%';
```

### Rollback

This migration is **intentionally irreversible via `alembic downgrade`** — the
downgrade function raises `NotImplementedError`. If rollback is needed, restore
from the backup taken before deployment:

```bash
sudo mybookkeeper-restore /path/to/backup-pre-encrypt-tokens.dump
```

See `deploy/DATABASE_BACKUP_RECOVERY.md` for full restore instructions.
