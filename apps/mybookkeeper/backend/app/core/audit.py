"""MBK audit listener — thin wrapper over :mod:`platform_shared.core.audit`.

Defines MBK's sensitive-field column names, skip-tables and skip-fields as
``AUDIT_CONFIG``, which ``app.main`` passes to ``create_app_lifespan``: the
shared listener cannot attach without it. Re-exports ``current_user_id`` so the
rest of MBK (middleware, tests) keeps importing it from the same path.

PII column names are app-specific — MBK's are documented in CLAUDE.md under
"PII encryption (column-level)" and RENTALS_PLAN.md §8.7.
"""
from platform_shared.core.audit import current_user_id
from platform_shared.core.audit_config import AuditConfig

# MBK-specific sensitive-field allowlist. Edit this list when adding a new
# PII-bearing column. The shared listener masks any value attached to a column
# in this set as ``"***"`` BEFORE it lands in the audit_logs table.
MBK_SENSITIVE_FIELDS: frozenset[str] = frozenset({
    "hashed_password",
    # OAuth tokens — masked at the actual column names (access_token /
    # refresh_token on Integration are hybrid_property accessors, not
    # SQLAlchemy mapped columns; the underlying columns are *_encrypted).
    # Mask the ciphertext to avoid bloat in audit_logs.
    "access_token_encrypted",
    "refresh_token_encrypted",
    "issuer_ein",
    # TOTP secrets — service-layer encrypted before reaching SQLAlchemy, but
    # the ciphertext is still bloat + unnecessary exposure to support /
    # analytics paths that read audit_logs. Mask to avoid both.
    "totp_secret",
    "totp_recovery_codes",
    # Inquiries domain PII (RENTALS_PLAN.md §8.7) — encrypted at rest via
    # EncryptedString TypeDecorator; the audit log must not capture decrypted
    # PII (or the ciphertext, which leaks the existence of a value).
    "inquirer_name",
    "inquirer_email",
    "inquirer_phone",
    "inquirer_employer",
    "from_address",
    "to_address",
    # Applicants domain PII (RENTALS_PLAN.md §8.7, Phase 3 PR 3.1a) —
    # encrypted at rest via EncryptedString. Field names are intentionally
    # specific (``legal_name`` not ``name``, ``reference_name`` not ``name``)
    # to avoid masking unrelated columns elsewhere in the schema (Property,
    # Organization, User, ReplyTemplate all have plain ``name`` columns we
    # MUST NOT mask in the audit log).
    "legal_name",
    # ``contact_*`` (not bare ``email``/``phone``) so the global
    # field-name match doesn't collide with users.email (login,
    # intentionally plaintext) or other unrelated columns.
    "contact_email",
    "contact_phone",
    # Welcome-manual send-log PII (PR 3) — free-typed guest recipient,
    # encrypted at rest via EncryptedString. Field names are specific
    # (``recipient_*``) so the audit listener doesn't mask unrelated columns.
    "recipient_email",
    "recipient_name",
    # Rent-reminder send log — the rendered reminder names the tenant, and is
    # encrypted at rest via EncryptedString.
    "message_body",
    # Keyed lookup code of the number a reminder text went to. Anyone holding
    # the key can test a guessed number against it, so it stays out of
    # audit_logs like the number itself.
    "recipient_phone_hash",
    # Insurance domain PII — policy numbers are PII-adjacent (can identify
    # individuals with insurers), encrypted at rest via EncryptedString.
    "policy_number",
    # Mortgage domain PII — a loan account number identifies a person to a
    # financial institution, encrypted at rest via EncryptedString. The same
    # name covers utility_account_link.account_number, a provider account
    # identifier stored plaintext for equality lookup (PII-adjacent, already in
    # core/pii.py PII_FIELD_IDS), so its plaintext never lands in audit_logs.
    "account_number",
    # Payment-attribution payer handle (Zelle email/phone, Venmo @user, Cash
    # App $tag) — a payer's contact identifier, stored on transactions and
    # learned aliases. Mask in audit_logs. (``payer_name`` is intentionally left
    # unmasked — a name is lower-sensitivity and used widely in attribution
    # logs; the handle is the identifying contact value.)
    "payer_handle",
    "dob",
    "employer_or_hospital",
    "vehicle_make_model",
    "reference_name",
    "reference_contact",
    # Guest welcome-manual share PIN — encrypted at rest via EncryptedString.
    # The audit log must never capture the decrypted PIN (or its ciphertext,
    # which would leak that a share link is enabled).
    "share_pin",
    # Bearer secrets: whoever holds one gets in without signing in. The guest
    # share link of a welcome manual, the public iCal feed of a channel
    # listing, the channel's own secret-bearing feed URL and token MBK imports
    # from, and an organization invite. Matching is by column name in every
    # table, so ``token`` would mask any column called that; today only
    # organization_invites.token has the name.
    "share_token",
    "ical_export_token",
    "ical_import_secret_token",
    "ical_import_url",
    "token",
    # Gmail account addresses — the connected account on integrations, and the
    # account a reply/receipt send claim went through. Encrypted at rest.
    "gmail_address",
    "sender_gmail_address",
    # Hosts may put sensitive context into freeform notes (medical info,
    # personal references, candid character assessments) — mask the column
    # to be safe. Applies to inquiries.notes, applicants.pets context,
    # video_call_notes.notes, applicant_events.notes, etc.
    "notes",
    # Public-form (T0) submitter context — IP and UA aren't strictly PII per
    # FCRA but they're tied to identifiable individuals once the inquiry has
    # contact info, so mask them in audit_logs to be safe.
    "client_ip",
    "user_agent",
})

# MBK skip-tables — high-volume / secret-bearing tables we don't audit.
# (``audit_logs`` itself is added by platform_shared as a recursion guard.)
MBK_SKIP_TABLES: frozenset[str] = frozenset({
    "auth_events",
    "refresh_sessions",
    "processed_emails",
    "usage_logs",
    "sync_logs",
    # One row per account per day, derived from balances whose own changes
    # are audited where they happen (financial_accounts, mortgages, properties).
    "balance_snapshots",
})

# Large-binary columns where neither the value nor a masked stub is useful.
MBK_SKIP_FIELDS: frozenset[str] = frozenset({"file_content"})


# Passed to create_app_lifespan(audit_config=...) in app.main. The listener can
# only be attached with a configuration, and boot fails if an EncryptedString
# column is missing from the sensitive fields.
AUDIT_CONFIG = AuditConfig(
    sensitive_fields=MBK_SENSITIVE_FIELDS,
    skip_tables=MBK_SKIP_TABLES,
    skip_fields=MBK_SKIP_FIELDS,
)


__all__ = [
    "AUDIT_CONFIG",
    "MBK_SENSITIVE_FIELDS",
    "MBK_SKIP_FIELDS",
    "MBK_SKIP_TABLES",
    "current_user_id",
]
