"""MJH audit listener — thin wrapper over :mod:`platform_shared.core.audit`.

Mirrors MyBookkeeper's wrapper pattern. Registers MJH-specific sensitive-field
column names + skip-tables at import time so the shared listener masks PII the
moment it attaches. Re-exports ``current_user_id`` and ``register_audit_listeners``
so the rest of MJH (``app.main`` lifespan + middleware) keeps importing from
the same path.

Phase 1 has no plaintext PII columns — ``job_board_credentials.encrypted_credentials``
is already encrypted at the value level via Fernet, not at the audit boundary.
The empty allowlist is reserved for Phase 2+ extension (e.g. resume parsed
fields, contact email columns).
"""
from platform_shared.core.audit import (
    current_user_id,
    register_audit_listeners,
    register_sensitive_fields,
    register_skip_fields,
    register_skip_tables,
)

# MJH-specific sensitive-field allowlist. Phase 1: only generic auth secrets
# from the shared User model (hashed_password, totp_secret_encrypted,
# totp_recovery_codes). Add new PII column names here when Phase 2+ introduces
# encrypted columns (parsed resume fields, contact emails, etc.).
MJH_SENSITIVE_FIELDS: frozenset[str] = frozenset({
    "hashed_password",
    "totp_secret_encrypted",
    "totp_recovery_codes",
})

# MJH skip-tables — high-volume / secret-bearing tables we don't audit.
# (``audit_logs`` itself is added by platform_shared as a recursion guard.)
# - ``auth_events``: separate audit channel with its own retention policy
# - ``extraction_logs``: token + cost metering, write-heavy and no PII
# - ``resume_upload_jobs``: worker job state churn, not user-facing data
MJH_SKIP_TABLES: frozenset[str] = frozenset({
    "auth_events",
    "extraction_logs",
    "resume_upload_jobs",
})

# Large-binary / blob columns where neither the value nor a masked stub is
# useful. ``encrypted_credentials`` is a Fernet ciphertext blob — capturing it
# in audit_logs would just bloat the table without adding security value.
MJH_SKIP_FIELDS: frozenset[str] = frozenset({
    "encrypted_credentials",
})


# Register at IMPORT time — not lazily — so the listener (registered later in
# the FastAPI lifespan) never fires without these sets populated. Importing
# ``app.core.audit`` anywhere during app startup is sufficient; ``app.main``
# already imports it before the lifespan runs.
register_sensitive_fields(MJH_SENSITIVE_FIELDS)
register_skip_tables(MJH_SKIP_TABLES)
register_skip_fields(MJH_SKIP_FIELDS)


__all__ = [
    "current_user_id",
    "register_audit_listeners",
    "MJH_SENSITIVE_FIELDS",
    "MJH_SKIP_TABLES",
    "MJH_SKIP_FIELDS",
]
