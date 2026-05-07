"""MBK audit listener — thin wrapper over :mod:`platform_shared.core.audit`.

Registers MBK-specific sensitive-field column names + skip-tables at import
time so the shared listener masks PII the moment it attaches. Re-exports
``current_user_id`` and ``register_audit_listeners`` so the rest of MBK
(``app.main`` lifespan + middleware) keeps importing from the same path.

PII column names are app-specific — MBK's are documented in CLAUDE.md under
"PII encryption (column-level)" and RENTALS_PLAN.md §8.7.
"""
from platform_shared.core.audit import (
    current_user_id,
    register_audit_listeners,
    register_sensitive_fields,
    register_skip_fields,
    register_skip_tables,
)

# MBK-specific sensitive-field allowlist. Edit this list when adding a new
# PII-bearing column. The shared listener masks any value attached to a column
# in this set as ``"***"`` BEFORE it lands in the audit_logs table.
MBK_SENSITIVE_FIELDS: frozenset[str] = frozenset({
    "hashed_password",
    "access_token",
    "refresh_token",
    "issuer_ein",
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
    # Insurance domain PII — policy numbers are PII-adjacent (can identify
    # individuals with insurers), encrypted at rest via EncryptedString.
    "policy_number",
    "dob",
    "employer_or_hospital",
    "vehicle_make_model",
    "reference_name",
    "reference_contact",
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
    "processed_emails",
    "usage_logs",
    "sync_logs",
})

# Large-binary columns where neither the value nor a masked stub is useful.
MBK_SKIP_FIELDS: frozenset[str] = frozenset({"file_content"})


# Register at IMPORT time — not lazily — so the listener (registered later in
# the FastAPI lifespan) never fires without these sets populated. Importing
# ``app.core.audit`` anywhere during app startup is sufficient; ``app.main``
# already imports it before the lifespan runs.
register_sensitive_fields(MBK_SENSITIVE_FIELDS)
register_skip_tables(MBK_SKIP_TABLES)
register_skip_fields(MBK_SKIP_FIELDS)


# Backwards-compatible re-exports — older MBK code referenced these as
# module-level names on app.core.audit. Keep them working.
SENSITIVE_FIELDS: frozenset[str] = MBK_SENSITIVE_FIELDS
SKIP_TABLES: frozenset[str] = MBK_SKIP_TABLES
SKIP_FIELDS: frozenset[str] = MBK_SKIP_FIELDS

__all__ = [
    "current_user_id",
    "register_audit_listeners",
    "MBK_SENSITIVE_FIELDS",
    "MBK_SKIP_TABLES",
    "MBK_SKIP_FIELDS",
    "SENSITIVE_FIELDS",
    "SKIP_TABLES",
    "SKIP_FIELDS",
]
