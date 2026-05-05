"""Unit tests for platform_shared.core.settings.BaseAppSettings.

Exercises the validator, the database_url_sync property, default values,
and inheritance behaviour. Per-app Settings classes have their own tests
in their respective backends.
"""

import pytest
from pydantic import ValidationError

from platform_shared.core.settings import BaseAppSettings


def _valid_kwargs() -> dict[str, str]:
    """Minimum required fields for BaseAppSettings to validate."""
    return {
        "database_url": "postgresql+asyncpg://user:pass@localhost/db",
        "secret_key": "x" * 32,
        "encryption_key": "y" * 32,
    }


class TestRequiredFields:
    def test_database_url_required(self) -> None:
        kwargs = _valid_kwargs()
        del kwargs["database_url"]
        with pytest.raises(ValidationError) as exc:
            BaseAppSettings(_env_file=None, **kwargs)
        assert "database_url" in str(exc.value)

    def test_secret_key_required(self) -> None:
        kwargs = _valid_kwargs()
        del kwargs["secret_key"]
        with pytest.raises(ValidationError) as exc:
            BaseAppSettings(_env_file=None, **kwargs)
        assert "secret_key" in str(exc.value)

    def test_encryption_key_required(self) -> None:
        kwargs = _valid_kwargs()
        del kwargs["encryption_key"]
        with pytest.raises(ValidationError) as exc:
            BaseAppSettings(_env_file=None, **kwargs)
        assert "encryption_key" in str(exc.value)


class TestKeyLengthValidator:
    def test_secret_key_too_short_raises(self) -> None:
        kwargs = _valid_kwargs()
        kwargs["secret_key"] = "x" * 31
        with pytest.raises(ValidationError) as exc:
            BaseAppSettings(_env_file=None, **kwargs)
        assert "secret_key" in str(exc.value)
        assert "32 characters" in str(exc.value)

    def test_encryption_key_too_short_raises(self) -> None:
        kwargs = _valid_kwargs()
        kwargs["encryption_key"] = "y" * 16
        with pytest.raises(ValidationError) as exc:
            BaseAppSettings(_env_file=None, **kwargs)
        assert "encryption_key" in str(exc.value)

    def test_secret_key_at_minimum_passes(self) -> None:
        kwargs = _valid_kwargs()
        kwargs["secret_key"] = "x" * 32
        s = BaseAppSettings(_env_file=None, **kwargs)
        assert s.secret_key == "x" * 32


class TestDatabaseUrlSync:
    def test_strips_asyncpg_suffix(self) -> None:
        s = BaseAppSettings(
            _env_file=None,
            database_url="postgresql+asyncpg://u:p@h/db",
            secret_key="x" * 32,
            encryption_key="y" * 32,
        )
        assert s.database_url_sync == "postgresql://u:p@h/db"

    def test_passthrough_when_no_asyncpg_suffix(self) -> None:
        s = BaseAppSettings(
            _env_file=None,
            database_url="postgresql://u:p@h/db",
            secret_key="x" * 32,
            encryption_key="y" * 32,
        )
        assert s.database_url_sync == "postgresql://u:p@h/db"


class TestDefaults:
    def test_safe_defaults_for_optional_fields(self) -> None:
        s = BaseAppSettings(_env_file=None, **_valid_kwargs())
        assert s.jwt_lifetime_seconds == 1800
        assert s.lockout_threshold == 5
        assert s.lockout_autoreset_hours == 24
        assert s.hibp_enabled is True
        assert s.turnstile_secret_key == ""
        assert s.turnstile_site_key == ""
        assert s.email_backend == "console"
        assert s.smtp_port == 587
        assert s.minio_secure is False
        assert s.presigned_url_ttl_seconds == 3600
        assert s.minio_skip_startup_check is False
        assert s.environment == "development"
        assert s.sentry_dsn == ""
        assert s.log_level == "INFO"


class TestSubclassInheritance:
    def test_subclass_can_override_defaults(self) -> None:
        class FakeAppSettings(BaseAppSettings):
            jwt_lifetime_seconds: int = 7200
            minio_bucket: str = "fakeapp-files"
            email_from_name: str = "FakeApp"

        s = FakeAppSettings(_env_file=None, **_valid_kwargs())
        assert s.jwt_lifetime_seconds == 7200
        assert s.minio_bucket == "fakeapp-files"
        assert s.email_from_name == "FakeApp"

    def test_subclass_can_add_required_fields(self) -> None:
        class FakeAppSettings(BaseAppSettings):
            anthropic_api_key: str

        with pytest.raises(ValidationError):
            FakeAppSettings(_env_file=None, **_valid_kwargs())

        s = FakeAppSettings(_env_file=None, anthropic_api_key="sk-test", **_valid_kwargs())
        assert s.anthropic_api_key == "sk-test"

    def test_subclass_inherits_validator(self) -> None:
        class FakeAppSettings(BaseAppSettings):
            pass

        kwargs = _valid_kwargs()
        kwargs["secret_key"] = "x" * 8
        with pytest.raises(ValidationError) as exc:
            FakeAppSettings(_env_file=None, **kwargs)
        assert "32 characters" in str(exc.value)
