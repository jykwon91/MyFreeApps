# Privacy & Data Rights

MyBookkeeper is a personal bookkeeping app. Your financial data is yours.

## Your rights

**Right to export (data portability)**
You can download a complete copy of all your data at any time from **Security → Download my data**. The export is a JSON file containing your properties, document metadata, transactions, and integration connection status. It never includes raw file content, OAuth tokens, or password hashes.

Endpoint: `GET /api/users/me/export`

**Right to erasure**
You can permanently delete your account and all associated data from **Security → Delete my account**. Deletion is immediate and irreversible — there is no grace period or soft-delete. Your data is hard-deleted from the database, including all properties, documents, transactions, integrations, and usage logs.

Endpoint: `DELETE /api/users/me` (requires password + email confirmation; TOTP code if 2FA is enabled)

## What we do with your data

- We use your data solely to provide the bookkeeping service.
- We do not sell your data to third parties.
- We do not share your data except as required to operate the service (e.g. Anthropic API for AI extraction, Google for Gmail OAuth).

## Data retention

- Active accounts: data retained indefinitely while the account is active.
- Deleted accounts: all data is removed immediately upon deletion.
- Automated daily database backups are retained for 30 days. A deleted user's data will be purged from backups within 30 days of deletion.
