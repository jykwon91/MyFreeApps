"""MJH audit listener — thin wrapper over :mod:`platform_shared.core.audit`.

Mirrors MyBookkeeper's wrapper pattern. Defines MJH's sensitive-field column
names, skip-tables and skip-fields as ``AUDIT_CONFIG``, which ``app.main``
passes to ``create_app_lifespan``: the shared listener cannot attach without
it. Re-exports ``current_user_id`` so the rest of MJH keeps importing it from
the same path.

Phase 1 has no plaintext PII columns — ``job_board_credentials.encrypted_credentials``
is already encrypted at the value level via Fernet, not at the audit boundary.
The empty allowlist is reserved for Phase 2+ extension (e.g. resume parsed
fields, contact email columns).
"""
from platform_shared.core.audit import current_user_id
from platform_shared.core.audit_config import AuditConfig

# MJH-specific sensitive-field allowlist. Phase 1: only generic auth secrets
# from the shared User model (hashed_password, totp_secret, totp_recovery_codes).
# Add new PII column names here when Phase 2+ introduces encrypted columns
# (parsed resume fields, contact emails, etc.).
#
# Field names MUST match the SQLAlchemy attribute keys on the actual ORM
# columns — verified at boot by platform_shared.core.audit.verify_audit_config.
# Misspellings would silently disable masking and leak plaintext into audit_logs.
MJH_SENSITIVE_FIELDS: frozenset[str] = frozenset({
    "hashed_password",
    "totp_secret",
    "totp_recovery_codes",
})

# MJH skip-tables — high-volume / secret-bearing tables we don't audit.
# (``audit_logs`` itself is added by platform_shared as a recursion guard.)
# - ``auth_events``: separate audit channel with its own retention policy
# - ``extraction_logs``: token + cost metering, write-heavy and no PII
# - ``resume_upload_jobs``: worker job state churn, not user-facing data
MJH_SKIP_TABLES: frozenset[str] = frozenset({
    "auth_events",
    "refresh_sessions",
    "extraction_logs",
    "resume_upload_jobs",
})

# Large-binary / blob columns where neither the value nor a masked stub is
# useful. ``encrypted_credentials`` is a Fernet ciphertext blob — capturing it
# in audit_logs would just bloat the table without adding security value.
MJH_SKIP_FIELDS: frozenset[str] = frozenset({
    "encrypted_credentials",
})


# Passed to create_app_lifespan(audit_config=...) in app.main. The listener can
# only be attached with a configuration, and boot fails if an EncryptedString
# column is missing from the sensitive fields.
AUDIT_CONFIG = AuditConfig(
    sensitive_fields=MJH_SENSITIVE_FIELDS,
    skip_tables=MJH_SKIP_TABLES,
    skip_fields=MJH_SKIP_FIELDS,
)


__all__ = [
    "current_user_id",
    "AUDIT_CONFIG",
    "MJH_SENSITIVE_FIELDS",
    "MJH_SKIP_TABLES",
    "MJH_SKIP_FIELDS",
]
