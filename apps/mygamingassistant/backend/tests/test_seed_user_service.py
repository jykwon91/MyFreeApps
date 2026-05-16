"""Unit tests for seed_user_service.is_valid_seed_email.

Guards the operator-seed boot path: fastapi-users serializes the operator
through an EmailStr field (UserRead), so seeding an operator whose
SEED_USER_EMAIL is not a valid email makes GET /users/me return 500 on every
authenticated request. is_valid_seed_email() must accept/reject exactly what
Pydantic's EmailStr would (email-validator, no deliverability/DNS check).
"""
from __future__ import annotations

import pytest

from app.services.user.seed_user_service import (
    SeedUserInvalidEmailError,
    SeedUserNotConfiguredError,
    is_valid_seed_email,
)


class TestIsValidSeedEmail:
    @pytest.mark.parametrize(
        "email",
        [
            "user@example.com",
            "dev@example.com",          # the recommended local-dev value
            "operator@sub.domain.co",
            "a.b+tag@mail.example.org",
            "first.last@example.io",
        ],
    )
    def test_valid_emails(self, email: str):
        assert is_valid_seed_email(email) is True

    @pytest.mark.parametrize(
        "email",
        [
            "dev@localhost",   # THE bug: no dot in domain → EmailStr rejects → /users/me 500
            "operator@localhost",
            "",
            "notanemail",
            "@example.com",
            "user@",
            "user @example.com",
            "user@exam ple.com",
            "user@.com",
            "user@com",
        ],
    )
    def test_invalid_emails(self, email: str):
        assert is_valid_seed_email(email) is False

    def test_dev_at_localhost_is_rejected_explicitly(self):
        """Regression: this exact value was seeded locally and 500'd
        GET /users/me on every authenticated request."""
        assert is_valid_seed_email("dev@localhost") is False
        # The documented remediation value must pass.
        assert is_valid_seed_email("dev@example.com") is True

    def test_none_is_falsey_safe(self):
        # _on_startup only calls this after the empty-string presence guard,
        # but be defensive anyway.
        assert is_valid_seed_email("") is False


class TestSeedErrorContracts:
    def test_invalid_email_error_is_runtime_error(self):
        assert issubclass(SeedUserInvalidEmailError, RuntimeError)

    def test_not_configured_error_is_runtime_error(self):
        assert issubclass(SeedUserNotConfiguredError, RuntimeError)
