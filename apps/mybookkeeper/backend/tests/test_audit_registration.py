"""MBK's production lifespan attaches the audit listener with MBK's masking config.

The listener used to read sets that ``app/core/audit.py`` registered as an
import-time side effect. PR #2623 removed the only import of that module from
``app/main.py`` (it looked unused), so the listener attached with nothing
registered and copied TOTP secrets, password hashes and encrypted PII into
``audit_logs`` in cleartext. These tests run ``app.main``'s real lifespan up to
the audit step and check what the listener attached with.
"""
from __future__ import annotations

import pytest
from platform_shared.core.audit_config import AuditConfig
from platform_shared.testing.audit_wiring import audit_config_attached_by_lifespan

from app.core.audit import AUDIT_CONFIG
from app.main import app


@pytest.fixture()
async def attached() -> AuditConfig:
    return await audit_config_attached_by_lifespan(app)


class TestMBKAuditRegistration:
    @pytest.mark.asyncio
    async def test_lifespan_attaches_the_app_config(self, attached: AuditConfig) -> None:
        assert attached == AUDIT_CONFIG

    @pytest.mark.asyncio
    async def test_inquiries_pii_columns_are_masked(self, attached: AuditConfig) -> None:
        for field in (
            "inquirer_name",
            "inquirer_email",
            "inquirer_phone",
            "inquirer_employer",
            "from_address",
            "to_address",
            "notes",
        ):
            assert field in attached.sensitive_fields, (
                f"{field!r} must be masked — adding a new encrypted PII column "
                "without masking it leaks plaintext into audit_logs.new_value."
            )

    @pytest.mark.asyncio
    async def test_applicants_pii_columns_are_masked(self, attached: AuditConfig) -> None:
        for field in (
            "legal_name",
            "dob",
            "employer_or_hospital",
            "vehicle_make_model",
            "reference_name",
            "reference_contact",
        ):
            assert field in attached.sensitive_fields, f"{field!r} must be masked."

    @pytest.mark.asyncio
    async def test_secrets_are_masked(self, attached: AuditConfig) -> None:
        # `access_token` / `refresh_token` are @hybrid_property accessors on
        # Integration, not mapped columns — the audit listener only sees the
        # underlying `*_encrypted` columns.
        for field in (
            "hashed_password",
            "access_token_encrypted",
            "refresh_token_encrypted",
            "totp_secret",
            "totp_recovery_codes",
        ):
            assert field in attached.sensitive_fields

    @pytest.mark.asyncio
    async def test_high_volume_and_secret_tables_are_skipped(self, attached: AuditConfig) -> None:
        for table in ("auth_events", "refresh_sessions", "processed_emails", "usage_logs", "sync_logs"):
            assert table in attached.skip_tables

    @pytest.mark.asyncio
    async def test_file_content_is_left_out(self, attached: AuditConfig) -> None:
        assert "file_content" in attached.skip_fields
