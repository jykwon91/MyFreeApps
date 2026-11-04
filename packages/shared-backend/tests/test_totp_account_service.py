"""The two-factor account operations every app shares."""
from __future__ import annotations

import hashlib
import uuid
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from types import SimpleNamespace
from typing import Any
from unittest.mock import AsyncMock, MagicMock

import pyotp
import pytest

from platform_shared.services import totp_account_service
from platform_shared.services.totp_account_service import TotpAccountService
from platform_shared.services.totp_service import (
    decrypt_for_user,
    encrypt_for_user,
    generate_secret,
)

_MASTER_KEY = "test-master-key"


def _encrypt(value: str, user_id: uuid.UUID) -> str:
    return encrypt_for_user(value, _MASTER_KEY, user_id)


def _decrypt(value: str, user_id: uuid.UUID) -> str:
    return decrypt_for_user(value, _MASTER_KEY, user_id)


@asynccontextmanager
async def _unit_of_work() -> AsyncIterator[Any]:
    yield MagicMock()


def _service(*, encrypted: bool = False) -> TotpAccountService:
    codec = {"encrypt": _encrypt, "decrypt": _decrypt} if encrypted else {}
    return TotpAccountService(
        user_model=object, issuer="MyApp", unit_of_work_factory=_unit_of_work, **codec,
    )


def _user(
    *,
    secret: str | None = None,
    enabled: bool = True,
    recovery: str | None = None,
    algorithm: str = "sha256",
) -> SimpleNamespace:
    return SimpleNamespace(
        id=uuid.uuid4(),
        email="a@example.com",
        totp_secret=secret,
        totp_enabled=enabled,
        totp_recovery_codes=recovery,
        totp_algorithm=algorithm,
        totp_last_used_step=None,
    )


def _code(secret: str, algorithm: str = "sha256") -> str:
    return pyotp.TOTP(secret, digest=getattr(hashlib, algorithm)).now()


@pytest.fixture
def stored(monkeypatch: pytest.MonkeyPatch) -> Any:
    def _store(user: SimpleNamespace | None) -> None:
        monkeypatch.setattr(totp_account_service, "lock_by_id", AsyncMock(return_value=user))
        monkeypatch.setattr(totp_account_service, "lock_by_email", AsyncMock(return_value=user))

    return _store


@pytest.mark.asyncio
async def test_setup_stores_a_new_secret_and_leaves_2fa_off(stored: Any) -> None:
    user = _user(secret="OLD", enabled=False, recovery="STALE", algorithm="sha1")
    user.totp_last_used_step = 99
    stored(user)

    secret, uri = await _service().setup_totp(user.id)

    assert user.totp_secret == secret
    assert user.totp_recovery_codes is None
    assert user.totp_algorithm == "sha256"
    assert user.totp_last_used_step is None
    assert user.totp_enabled is False
    assert uri.startswith("otpauth://totp/")
    assert "issuer=MyApp" in uri


@pytest.mark.asyncio
async def test_setup_for_an_unknown_user_raises(stored: Any) -> None:
    stored(None)

    with pytest.raises(ValueError):
        await _service().setup_totp(uuid.uuid4())


@pytest.mark.asyncio
async def test_confirm_with_the_right_code_turns_2fa_on(stored: Any) -> None:
    secret = generate_secret()
    user = _user(secret=secret, enabled=False)
    stored(user)

    verified, recovery = await _service().confirm_totp(user.id, _code(secret))

    assert verified is True
    assert len(recovery) == 8
    assert user.totp_enabled is True
    assert user.totp_recovery_codes == ",".join(recovery)


@pytest.mark.asyncio
async def test_confirm_keeps_the_algorithm_the_secret_was_enrolled_with(stored: Any) -> None:
    """Rewriting it here would break every later code for a SHA-1 enrollment."""
    secret = generate_secret()
    user = _user(secret=secret, enabled=False, algorithm="sha1")
    stored(user)

    verified, _ = await _service().confirm_totp(user.id, _code(secret, "sha1"))

    assert verified is True
    assert user.totp_algorithm == "sha1"


@pytest.mark.asyncio
async def test_confirm_with_a_wrong_code_changes_nothing(stored: Any) -> None:
    user = _user(secret=generate_secret(), enabled=False)
    stored(user)

    assert await _service().confirm_totp(user.id, "000000") == (False, [])
    assert user.totp_enabled is False
    assert user.totp_recovery_codes is None


@pytest.mark.asyncio
async def test_disable_with_the_right_code_clears_everything(stored: Any) -> None:
    secret = generate_secret()
    user = _user(secret=secret, recovery="AAAA1111")
    stored(user)

    assert await _service().disable_totp(user.id, _code(secret)) is True

    assert user.totp_enabled is False
    assert user.totp_secret is None
    assert user.totp_recovery_codes is None
    assert user.totp_algorithm == "sha1"
    assert user.totp_last_used_step is None


@pytest.mark.asyncio
async def test_disable_with_a_wrong_code_changes_nothing(stored: Any) -> None:
    secret = generate_secret()
    user = _user(secret=secret)
    stored(user)

    assert await _service().disable_totp(user.id, "000000") is False
    assert user.totp_enabled is True
    assert user.totp_secret == secret


@pytest.mark.asyncio
async def test_login_accepts_the_right_code(stored: Any) -> None:
    secret = generate_secret()
    stored(_user(secret=secret))

    assert await _service().validate_totp_for_login("a@example.com", _code(secret)) == (True, False)


@pytest.mark.asyncio
async def test_login_removes_the_recovery_code_it_accepts(stored: Any) -> None:
    user = _user(secret=generate_secret(), recovery="AAAA1111,BBBB2222")
    stored(user)

    assert await _service().validate_totp_for_login(user.email, "AAAA1111") == (True, True)
    assert user.totp_recovery_codes == "BBBB2222"


@pytest.mark.asyncio
async def test_login_clears_the_column_when_the_last_recovery_code_goes(stored: Any) -> None:
    user = _user(secret=generate_secret(), recovery="AAAA1111")
    stored(user)

    await _service().validate_totp_for_login(user.email, "AAAA1111")

    assert user.totp_recovery_codes is None


@pytest.mark.asyncio
@pytest.mark.parametrize("user", [None, _user(secret="X", enabled=False), _user(secret=None)])
async def test_login_rejects_without_enrolled_2fa(stored: Any, user: SimpleNamespace | None) -> None:
    stored(user)

    assert await _service().validate_totp_for_login("a@example.com", "123456") == (False, False)


@pytest.mark.asyncio
async def test_login_refuses_a_code_it_has_already_accepted(stored: Any) -> None:
    secret = generate_secret()
    user = _user(secret=secret)
    stored(user)
    code = _code(secret)
    service = _service()

    assert await service.validate_totp_for_login(user.email, code) == (True, False)
    assert await service.validate_totp_for_login(user.email, code) == (False, False)


@pytest.mark.asyncio
async def test_a_code_spent_at_login_cant_pass_the_step_up_check(stored: Any) -> None:
    secret = generate_secret()
    user = _user(secret=secret)
    stored(user)
    code = _code(secret)
    service = _service()

    await service.validate_totp_for_login(user.email, code)

    assert await service.verify_totp_code(AsyncMock(), user.id, code) is False


@pytest.mark.asyncio
async def test_a_code_spent_confirming_cant_disable_2fa(stored: Any) -> None:
    secret = generate_secret()
    user = _user(secret=secret, enabled=False)
    stored(user)
    code = _code(secret)
    service = _service()

    await service.confirm_totp(user.id, code)

    assert await service.disable_totp(user.id, code) is False
    assert user.totp_enabled is True


@pytest.mark.asyncio
async def test_step_up_spends_a_code_and_commits(stored: Any) -> None:
    secret = generate_secret()
    user = _user(secret=secret)
    stored(user)
    code = _code(secret)
    db = AsyncMock()
    service = _service()

    assert await service.verify_totp_code(db, user.id, code) is True
    assert user.totp_last_used_step is not None
    db.commit.assert_awaited_once()
    assert await service.verify_totp_code(db, user.id, code) is False


@pytest.mark.asyncio
async def test_step_up_spends_a_recovery_code(stored: Any) -> None:
    user = _user(secret=generate_secret(), recovery="AAAA1111,BBBB2222")
    stored(user)
    db = AsyncMock()
    service = _service()

    assert await service.verify_totp_code(db, user.id, "AAAA1111") is True
    assert user.totp_recovery_codes == "BBBB2222"
    assert await service.verify_totp_code(db, user.id, "AAAA1111") is False


@pytest.mark.asyncio
async def test_step_up_rejects_a_wrong_code_and_still_releases_the_lock(stored: Any) -> None:
    user = _user(secret=generate_secret())
    stored(user)
    db = AsyncMock()

    assert await _service().verify_totp_code(db, user.id, "000000") is False
    assert await _service().verify_totp_code(db, user.id, "") is False
    db.commit.assert_awaited_once()


@pytest.mark.asyncio
@pytest.mark.parametrize("user", [None, _user(secret="X", enabled=False), _user(secret=None)])
async def test_step_up_rejects_without_enrolled_2fa(stored: Any, user: SimpleNamespace | None) -> None:
    stored(user)

    assert await _service().verify_totp_code(AsyncMock(), uuid.uuid4(), "123456") is False


@pytest.mark.asyncio
async def test_encrypted_values_are_written_and_read_through_the_codec(stored: Any) -> None:
    """MyBookkeeper's stored secrets must stay readable after the move."""
    user = _user(secret=None, enabled=False)
    stored(user)
    service = _service(encrypted=True)

    secret, _ = await service.setup_totp(user.id)
    assert user.totp_secret != secret
    assert _decrypt(user.totp_secret, user.id) == secret

    verified, recovery = await service.confirm_totp(user.id, _code(secret))
    assert verified is True
    assert _decrypt(user.totp_recovery_codes, user.id) == ",".join(recovery)

    assert await service.validate_totp_for_login(user.email, recovery[0]) == (True, True)
    assert _decrypt(user.totp_recovery_codes, user.id) == ",".join(recovery[1:])
    user.totp_last_used_step = None
    assert await service.validate_totp_for_login(user.email, _code(secret)) == (True, False)
