"""What every app's :class:`~platform_shared.core.audit_config.AuditConfig` must
contain, because every app has these shared auth columns and tables.

Boot fails (:func:`platform_shared.core.audit.verify_audit_baseline`) when an
app's configuration leaves any of them out. Apps list them explicitly rather
than having them merged in, so ``app/core/audit.py`` reads as the whole truth.
"""

# The fastapi-users password hash and the TOTP secret and recovery codes on
# every app's user table.
AUDIT_BASELINE_SENSITIVE_FIELDS: frozenset[str] = frozenset({
    "hashed_password",
    "totp_secret",
    "totp_recovery_codes",
})

# ``auth_events`` is a separate audit channel with its own retention, and
# ``refresh_sessions`` holds the hashes of signed-in devices' refresh secrets.
AUDIT_BASELINE_SKIP_TABLES: frozenset[str] = frozenset({
    "auth_events",
    "refresh_sessions",
})
