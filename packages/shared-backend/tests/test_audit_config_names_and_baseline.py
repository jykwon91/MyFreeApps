"""Boot refuses an AuditConfig with a name that matches nothing, or without
the shared baseline.

A skip-table or skip-field typo (``refresh_session`` for ``refresh_sessions``)
used to pass silently and leave the table or column audited in full. And no
check made an app mask the auth secrets and skip the secret-bearing tables
every app has.
"""
from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest
from fastapi import FastAPI
from sqlalchemy import Integer, String
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

from platform_shared.core.audit import (
    AuditConfigurationError,
    attached_audit_config,
    register_audit_listeners,
    register_sensitive_fields,
    register_skip_tables,
    verify_audit_baseline,
    verify_audit_config,
)
from platform_shared.core.audit_baseline_constants import (
    AUDIT_BASELINE_SENSITIVE_FIELDS,
    AUDIT_BASELINE_SKIP_TABLES,
)
from platform_shared.core.audit_config import AuditConfig
from platform_shared.core.lifespan import create_app_lifespan


class _AppBase(DeclarativeBase):
    """An app's models: the shared auth tables plus one domain table."""


class _User(_AppBase):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    email: Mapped[str] = mapped_column(String(320))
    hashed_password: Mapped[str] = mapped_column(String(1024))
    totp_secret: Mapped[str | None] = mapped_column(String(255), nullable=True)
    totp_recovery_codes: Mapped[str | None] = mapped_column(String(1000), nullable=True)


class _AuthEvent(_AppBase):
    __tablename__ = "auth_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)


class _RefreshSession(_AppBase):
    __tablename__ = "refresh_sessions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    current_secret_hash: Mapped[str] = mapped_column(String(64))


class _Document(_AppBase):
    __tablename__ = "documents"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    file_content: Mapped[str | None] = mapped_column(String(100), nullable=True)


def _config(
    *,
    sensitive: frozenset[str] = AUDIT_BASELINE_SENSITIVE_FIELDS,
    skip_tables: frozenset[str] = AUDIT_BASELINE_SKIP_TABLES,
    skip_fields: frozenset[str] = frozenset({"file_content"}),
) -> AuditConfig:
    return AuditConfig(sensitive_fields=sensitive, skip_tables=skip_tables, skip_fields=skip_fields)


def _settings() -> SimpleNamespace:
    return SimpleNamespace(
        environment="development",
        sentry_dsn="",
        turnstile_secret_key="",
        email_backend="console",
        smtp_host="",
        smtp_user="",
        smtp_password="",
        sms_backend="console",
        transparency_primary=False,
        kofi_verification_token="",
    )


class TestNamesMustMatchTheModels:
    def test_a_correct_config_passes(self) -> None:
        verify_audit_config(_config(), base=_AppBase)

    def test_unknown_skip_table_fails(self) -> None:
        typo = _config(skip_tables=frozenset({"auth_events", "refresh_session"}))
        with pytest.raises(AuditConfigurationError) as exc:
            verify_audit_config(typo, base=_AppBase)
        msg = str(exc.value)
        assert "AuditConfig.skip_tables: ['refresh_session']" in msg
        assert "'auth_events'" not in msg

    def test_unknown_skip_field_fails(self) -> None:
        with pytest.raises(AuditConfigurationError) as exc:
            verify_audit_config(_config(skip_fields=frozenset({"file_contents"})), base=_AppBase)
        assert "AuditConfig.skip_fields: ['file_contents']" in str(exc.value)

    def test_a_table_name_is_not_a_skip_field(self) -> None:
        # Skip fields match column names; the listener never compares them to tables.
        with pytest.raises(AuditConfigurationError) as exc:
            verify_audit_config(_config(skip_fields=frozenset({"documents"})), base=_AppBase)
        assert "['documents']" in str(exc.value)

    def test_every_kind_of_unknown_name_is_named_at_once(self) -> None:
        config = _config(
            sensitive=AUDIT_BASELINE_SENSITIVE_FIELDS | {"totp_secrets"},
            skip_tables=AUDIT_BASELINE_SKIP_TABLES | {"document"},
            skip_fields=frozenset({"blob"}),
        )
        with pytest.raises(AuditConfigurationError) as exc:
            verify_audit_config(config, base=_AppBase)
        msg = str(exc.value)
        assert "AuditConfig.sensitive_fields: ['totp_secrets']" in msg
        assert "AuditConfig.skip_tables: ['document']" in msg
        assert "AuditConfig.skip_fields: ['blob']" in msg

    def test_listener_is_not_attached_with_an_unknown_skip_table(self) -> None:
        with pytest.raises(AuditConfigurationError):
            register_audit_listeners(_config(skip_tables=frozenset({"refresh_session"})), base=_AppBase)
        assert attached_audit_config() is None


class TestSharedBaselineIsRequired:
    def test_the_baseline_is_the_shared_auth_secrets_and_tables(self) -> None:
        assert frozenset({"hashed_password", "totp_secret", "totp_recovery_codes"}) == AUDIT_BASELINE_SENSITIVE_FIELDS
        assert frozenset({"auth_events", "refresh_sessions"}) == AUDIT_BASELINE_SKIP_TABLES

    def test_a_config_with_the_baseline_passes(self) -> None:
        verify_audit_baseline(_config())

    @pytest.mark.parametrize("field", sorted(AUDIT_BASELINE_SENSITIVE_FIELDS))
    def test_missing_baseline_sensitive_field_fails(self, field: str) -> None:
        config = _config(sensitive=AUDIT_BASELINE_SENSITIVE_FIELDS - {field})
        with pytest.raises(AuditConfigurationError) as exc:
            verify_audit_baseline(config)
        assert f"AuditConfig.sensitive_fields: [{field!r}]" in str(exc.value)

    @pytest.mark.parametrize("table", sorted(AUDIT_BASELINE_SKIP_TABLES))
    def test_missing_baseline_skip_table_fails(self, table: str) -> None:
        config = _config(skip_tables=AUDIT_BASELINE_SKIP_TABLES - {table})
        with pytest.raises(AuditConfigurationError) as exc:
            verify_audit_baseline(config)
        assert f"AuditConfig.skip_tables: [{table!r}]" in str(exc.value)

    @pytest.mark.asyncio
    async def test_lifespan_refuses_to_boot_without_the_baseline(self, monkeypatch) -> None:
        attach = MagicMock()
        monkeypatch.setattr("platform_shared.core.lifespan.register_audit_listeners", attach)
        bucket = MagicMock()
        lifespan = create_app_lifespan(
            settings=_settings(),
            audit_config=_config(skip_tables=frozenset({"auth_events"})),
            bucket_init=bucket,
        )
        with pytest.raises(AuditConfigurationError, match="refresh_sessions"):
            async with lifespan(FastAPI()):
                pass
        attach.assert_not_called()
        bucket.assert_not_called()

    @pytest.mark.asyncio
    async def test_legacy_registry_path_also_requires_the_baseline(self, monkeypatch) -> None:
        attach = MagicMock()
        monkeypatch.setattr("platform_shared.core.lifespan.register_audit_listeners", attach)
        register_sensitive_fields(["hashed_password"])
        register_skip_tables(AUDIT_BASELINE_SKIP_TABLES)
        lifespan = create_app_lifespan(settings=_settings())
        with pytest.raises(AuditConfigurationError, match="totp_recovery_codes"):
            async with lifespan(FastAPI()):
                pass
        attach.assert_not_called()
