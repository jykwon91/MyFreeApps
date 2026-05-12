"""MGA audit listener — thin wrapper over :mod:`platform_shared.core.audit`.

Mirrors MyJobHunter's wrapper pattern. Registers MGA-specific sensitive-field
column names + skip-tables at import time so the shared listener masks PII the
moment it attaches. Re-exports ``current_user_id`` and ``register_audit_listeners``
so the rest of MGA (``app.main`` lifespan + middleware) keeps importing from
the same path.

Phase 1 has no plaintext PII columns — TOTP secrets are already encrypted.
The empty allowlist is reserved for future extension.
"""
from platform_shared.core.audit import (
    current_user_id,
    register_audit_listeners,
    register_sensitive_fields,
    register_skip_fields,
    register_skip_tables,
)

# MGA-specific sensitive-field allowlist. Phase 1: only generic auth secrets
# from the shared User model.
MGA_SENSITIVE_FIELDS: frozenset[str] = frozenset({
    "hashed_password",
    "totp_secret_encrypted",
    "totp_recovery_codes",
})

# MGA skip-tables — high-volume / secret-bearing tables we don't audit.
MGA_SKIP_TABLES: frozenset[str] = frozenset({
    "auth_events",
})

MGA_SKIP_FIELDS: frozenset[str] = frozenset()


register_sensitive_fields(MGA_SENSITIVE_FIELDS)
register_skip_tables(MGA_SKIP_TABLES)
register_skip_fields(MGA_SKIP_FIELDS)


__all__ = [
    "current_user_id",
    "register_audit_listeners",
    "MGA_SENSITIVE_FIELDS",
    "MGA_SKIP_TABLES",
    "MGA_SKIP_FIELDS",
]
