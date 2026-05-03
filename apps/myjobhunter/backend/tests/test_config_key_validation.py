"""Tests for the Settings key-length validators (CWE-521 guard).

Both ``secret_key`` and ``encryption_key`` must be at least 32 characters.
A shorter value must raise a ValidationError at startup so misconfigured
deployments fail loudly rather than silently weakening crypto.

These tests construct a minimal Settings class mirroring the validator
to avoid triggering the module-level ``settings = Settings()`` singleton
(which requires a live .env or full env with DATABASE_URL etc.).
"""
import pytest
from pydantic import ValidationError, field_validator
from pydantic_settings import BaseSettings


_MIN_KEY_LENGTH = 32
_STRONG_KEY = "a" * 32
_WEAK_KEY = "short"


class _KeySettings(BaseSettings):
    """Minimal settings stand-in with only the key fields + validators.

    Mirrors the validator from ``app.core.config.Settings``.
    """

    secret_key: str
    encryption_key: str

    @field_validator("secret_key", "encryption_key")
    @classmethod
    def _validate_key_length(cls, v: str, info: object) -> str:
        if len(v) < _MIN_KEY_LENGTH:
            field = getattr(info, "field_name", "key")
            raise ValueError(
                f"{field} must be at least {_MIN_KEY_LENGTH} characters "
                f"(got {len(v)})"
            )
        return v

    model_config = {"env_file": None, "extra": "ignore"}


class TestEncryptionKeyValidation:
    def test_accepts_32_char_encryption_key(self) -> None:
        s = _KeySettings(secret_key=_STRONG_KEY, encryption_key=_STRONG_KEY)
        assert s.encryption_key == _STRONG_KEY

    def test_rejects_short_encryption_key(self) -> None:
        with pytest.raises(ValidationError) as exc_info:
            _KeySettings(secret_key=_STRONG_KEY, encryption_key=_WEAK_KEY)
        errors = exc_info.value.errors()
        assert any(e["loc"] == ("encryption_key",) for e in errors), (
            f"Expected validation error on encryption_key, got: {errors}"
        )

    def test_accepts_longer_than_minimum_encryption_key(self) -> None:
        long_key = "x" * 64
        s = _KeySettings(secret_key=_STRONG_KEY, encryption_key=long_key)
        assert s.encryption_key == long_key


class TestSecretKeyValidation:
    def test_accepts_32_char_secret_key(self) -> None:
        s = _KeySettings(secret_key=_STRONG_KEY, encryption_key=_STRONG_KEY)
        assert s.secret_key == _STRONG_KEY

    def test_rejects_short_secret_key(self) -> None:
        with pytest.raises(ValidationError) as exc_info:
            _KeySettings(secret_key=_WEAK_KEY, encryption_key=_STRONG_KEY)
        errors = exc_info.value.errors()
        assert any(e["loc"] == ("secret_key",) for e in errors), (
            f"Expected validation error on secret_key, got: {errors}"
        )

    def test_rejects_both_short_keys_at_once(self) -> None:
        with pytest.raises(ValidationError) as exc_info:
            _KeySettings(secret_key=_WEAK_KEY, encryption_key=_WEAK_KEY)
        locs = {tuple(e["loc"]) for e in exc_info.value.errors()}
        assert ("secret_key",) in locs
        assert ("encryption_key",) in locs

    def test_boundary_31_chars_rejected(self) -> None:
        with pytest.raises(ValidationError):
            _KeySettings(secret_key="b" * 31, encryption_key=_STRONG_KEY)

    def test_boundary_32_chars_accepted(self) -> None:
        s = _KeySettings(secret_key="c" * 32, encryption_key=_STRONG_KEY)
        assert len(s.secret_key) == 32
