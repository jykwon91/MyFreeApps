"""Regression: TOTP enrollment (``setup_totp``) must not raise.

The scaffold-era ``setup_totp`` called the keyword-only shared
``enroll_totp`` positionally (``_shared_enroll_totp(user, get_provisioning_uri)``),
so every enrollment raised ``TypeError``. Mirrors the coordinator contract in
apps/myrecipes/backend/tests/test_totp_setup.py, but drives the service with an
in-memory user so it needs no database.
"""
from contextlib import asynccontextmanager
from types import SimpleNamespace
from unittest.mock import AsyncMock
import uuid

import pytest

from app.services.user import totp_service


@pytest.fixture
def fake_user(monkeypatch: pytest.MonkeyPatch) -> SimpleNamespace:
    user = SimpleNamespace(
        id=uuid.uuid4(),
        email="totp-enroll@example.com",
        totp_secret=None,
        totp_recovery_codes="STALE",
        totp_algorithm="sha1",
        totp_enabled=False,
    )

    @asynccontextmanager
    async def _uow():
        yield object()

    monkeypatch.setattr(totp_service, "unit_of_work", _uow)
    monkeypatch.setattr(
        totp_service.user_repo, "get_by_id", AsyncMock(return_value=user),
    )
    return user


@pytest.mark.asyncio
async def test_setup_totp_returns_secret_and_uri(fake_user: SimpleNamespace) -> None:
    secret, uri = await totp_service.setup_totp(fake_user.id)

    assert secret
    assert uri.startswith("otpauth://totp/")
    assert f"secret={secret}" in uri
    assert "issuer=MyPizzaTracker" in uri


@pytest.mark.asyncio
async def test_setup_totp_persists_secret_and_sha256_without_enabling(
    fake_user: SimpleNamespace,
) -> None:
    secret, _ = await totp_service.setup_totp(fake_user.id)

    assert fake_user.totp_secret == secret
    assert fake_user.totp_algorithm == "sha256"
    assert fake_user.totp_recovery_codes is None
    assert fake_user.totp_enabled is False


@pytest.mark.asyncio
async def test_setup_totp_unknown_user_raises_value_error(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    @asynccontextmanager
    async def _uow():
        yield object()

    monkeypatch.setattr(totp_service, "unit_of_work", _uow)
    monkeypatch.setattr(
        totp_service.user_repo, "get_by_id", AsyncMock(return_value=None),
    )
    with pytest.raises(ValueError):
        await totp_service.setup_totp(uuid.uuid4())
