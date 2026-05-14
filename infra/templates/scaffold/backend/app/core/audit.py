"""__APP_DISPLAY_NAME__ audit listener -- thin wrapper over :mod:`platform_shared.core.audit`.

Registers app-specific sensitive-field column names + skip-tables at import time
so the shared listener masks PII the moment it attaches. Re-exports
``current_user_id`` and ``register_audit_listeners`` so the rest of the app
keeps importing from the same path.

Field names MUST match the SQLAlchemy attribute keys on the actual ORM
columns -- verified at boot by platform_shared.core.audit.verify_sensitive_field_names.
Misspellings silently disable masking and leak plaintext into audit_logs.
"""
from platform_shared.core.audit import (
    current_user_id,
    register_audit_listeners,
    register_sensitive_fields,
    register_skip_fields,
    register_skip_tables,
)

# Sensitive-field allowlist -- generic auth secrets from the shared User model.
# Add domain-specific PII column names here as new tables come online.
APP_SENSITIVE_FIELDS: frozenset[str] = frozenset({
    "hashed_password",
    "totp_secret",
    "totp_recovery_codes",
})

# Skip-tables -- high-volume / secret-bearing tables we don't audit.
APP_SKIP_TABLES: frozenset[str] = frozenset({
    "auth_events",
})

APP_SKIP_FIELDS: frozenset[str] = frozenset()


register_sensitive_fields(APP_SENSITIVE_FIELDS)
register_skip_tables(APP_SKIP_TABLES)
register_skip_fields(APP_SKIP_FIELDS)


__all__ = [
    "current_user_id",
    "register_audit_listeners",
    "APP_SENSITIVE_FIELDS",
    "APP_SKIP_TABLES",
    "APP_SKIP_FIELDS",
]
