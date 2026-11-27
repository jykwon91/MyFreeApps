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
- We do not share your data except as required to operate the service (e.g. Anthropic API for AI extraction, Google for Gmail OAuth, Twilio for rent reminder texts and tenants' replies to them).
- When a tenant texts back within 120 days of a rent reminder text, Twilio passes the reply to us and we email it to the landlord whose reminder went to that number. We don't keep the reply, and we never download pictures sent with it; Twilio keeps its own record of the message. To tell whose reply it is, we keep a code made from each phone number a reminder text went to, using a secret key, so the code doesn't show the number.

## Data retention

- Active accounts: data retained indefinitely while the account is active.
- Reminder text lookup codes: kept with each reminder until the account is deleted, and only used to match tenants' replies to texts from the last 120 days.
- Deleted accounts: all data is removed immediately upon deletion.
- Automated daily database backups are retained for 30 days. A deleted user's data will be purged from backups within 30 days of deletion.
