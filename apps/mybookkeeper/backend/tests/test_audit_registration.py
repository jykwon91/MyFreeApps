"""Verify MBK's import-time registration of sensitive-field column names.

After PR M3 the audit listener + AuditLog model live in ``platform_shared``.
MBK's ``app/core/audit.py`` is now a thin wrapper that calls the shared
``register_sensitive_fields`` / ``register_skip_tables`` / ``register_skip_fields``
at import time. If that wiring ever breaks (e.g. someone refactors away the
top-level ``register_*`` calls), the listener would still attach but produce
audit rows with PII plaintext leaked into ``new_value`` — a silent security
regression.

This test is the safety net: if it fails, the listener is no longer protecting
PII columns.
"""
from __future__ import annotations

# Importing ``app.core.audit`` runs the module body, which calls
# ``register_sensitive_fields(MBK_SENSITIVE_FIELDS)`` etc. We rely on that side
# effect — do NOT defer the import inside the tests.
from app.core.audit import (  # noqa: F401 — import side-effect populates registry
    MBK_SENSITIVE_FIELDS,
    MBK_SKIP_FIELDS,
    MBK_SKIP_TABLES,
)
from platform_shared.core.audit import (
    get_sensitive_fields,
    get_skip_tables,
)


class TestMBKAuditRegistration:
    def test_inquiries_pii_columns_are_registered(self) -> None:
        registered = get_sensitive_fields()
        for field in (
            "inquirer_name",
            "inquirer_email",
            "inquirer_phone",
            "inquirer_employer",
            "from_address",
            "to_address",
            "notes",
        ):
            assert field in registered, (
                f"{field!r} must be registered as sensitive — adding a new "
                "encrypted PII column without registering it leaks plaintext "
                "into audit_logs.new_value."
            )

    def test_applicants_pii_columns_are_registered(self) -> None:
        registered = get_sensitive_fields()
        for field in (
            "legal_name",
            "dob",
            "employer_or_hospital",
            "vehicle_make_model",
            "reference_name",
            "reference_contact",
        ):
            assert field in registered, f"{field!r} must be registered as sensitive."

    def test_secrets_are_registered(self) -> None:
        registered = get_sensitive_fields()
        for field in ("hashed_password", "access_token", "refresh_token"):
            assert field in registered

    def test_default_audit_logs_skip_table_is_present(self) -> None:
        # platform_shared seeds this — without it the listener would recurse
        # infinitely on every flush.
        assert "audit_logs" in get_skip_tables()

    def test_mbk_high_volume_skip_tables_are_registered(self) -> None:
        registered = get_skip_tables()
        for table in ("auth_events", "processed_emails", "usage_logs", "sync_logs"):
            assert table in registered

    def test_mbk_constants_match_registered_state(self) -> None:
        # The exported MBK_SENSITIVE_FIELDS constant is the documentation
        # surface — every entry must actually have been pushed into the
        # shared registry.
        for field in MBK_SENSITIVE_FIELDS:
            assert field in get_sensitive_fields()
        for table in MBK_SKIP_TABLES:
            assert table in get_skip_tables()
        # MBK_SKIP_FIELDS is registered separately — assert non-empty + present.
        from platform_shared.core import audit as audit_module
        for field in MBK_SKIP_FIELDS:
            assert field in audit_module._skip_fields
