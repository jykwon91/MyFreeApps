"""MyLanguageTutor audit listener -- thin wrapper over :mod:`platform_shared.core.audit`.

Defines the app's sensitive-field column names, skip-tables and skip-fields as
``AUDIT_CONFIG``, which ``app.main`` passes to ``create_app_lifespan``: the
shared listener cannot attach without it. Re-exports ``current_user_id`` so the
rest of the app keeps importing it from the same path.

Field names MUST match the SQLAlchemy attribute keys on the actual ORM
columns -- verified at boot by platform_shared.core.audit.verify_audit_config.
Misspellings silently disable masking and leak plaintext into audit_logs.
"""
from platform_shared.core.audit import current_user_id
from platform_shared.core.audit_config import AuditConfig

# Sensitive-field allowlist -- generic auth secrets from the shared User model,
# plus every EncryptedString column (the listener sees the decrypted value, so
# an unmasked encrypted column lands in audit_logs as cleartext; boot fails if
# one is missing). Add domain-specific PII column names here as new tables come online.
APP_SENSITIVE_FIELDS: frozenset[str] = frozenset({
    "hashed_password",
    "totp_secret",
    "totp_recovery_codes",
    # tutor_turn transcript text (learner PII, encrypted at rest).
    "learner_text",
    "reply_text",
    "corrections_json",
    "translation_text",
})

# Skip-tables -- high-volume / secret-bearing tables we don't audit.
APP_SKIP_TABLES: frozenset[str] = frozenset({
    "auth_events",
    "refresh_sessions",
})

APP_SKIP_FIELDS: frozenset[str] = frozenset()


# Passed to create_app_lifespan(audit_config=...) in app.main. The listener can
# only be attached with a configuration, and boot fails if an EncryptedString
# column is missing from the sensitive fields.
AUDIT_CONFIG = AuditConfig(
    sensitive_fields=APP_SENSITIVE_FIELDS,
    skip_tables=APP_SKIP_TABLES,
    skip_fields=APP_SKIP_FIELDS,
)


__all__ = [
    "current_user_id",
    "AUDIT_CONFIG",
    "APP_SENSITIVE_FIELDS",
    "APP_SKIP_TABLES",
    "APP_SKIP_FIELDS",
]
