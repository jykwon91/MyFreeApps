"""The forgot-password response is the same for a known and an unknown address.

The reset email is sent after the response as a tracked background task, so
neither a failing nor a slow SMTP server can show that an account exists.
"""
from __future__ import annotations

import asyncio
import logging
import uuid
from collections.abc import AsyncIterator
from dataclasses import dataclass
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi import FastAPI
from fastapi_users import FastAPIUsers
from httpx import ASGITransport, AsyncClient
from platform_shared.auth.user_manager import PlatformBaseUserManager
from platform_shared.core.tracked_task import drain_tracked
from platform_shared.services.email_send_error import EmailSendError
from platform_shared.services.email_service import EmailNotConfiguredError

KNOWN = "person@example.com"
SECRET = "test-secret-not-real-0123456789abcdef"  # gitleaks:allow


@dataclass
class _User:
    email: str
    id: uuid.UUID
    hashed_password: str = "x"
    is_active: bool = True
    is_verified: bool = True
    is_superuser: bool = False


class _UserDb:
    def __init__(self, users: list[_User]) -> None:
        self._users = {u.email: u for u in users}

    async def get_by_email(self, email: str) -> _User | None:
        return self._users.get(email)


class _Manager(PlatformBaseUserManager):
    reset_password_token_secret = SECRET
    verification_token_secret = SECRET

    def __init__(self, user_db: _UserDb, send: AsyncMock) -> None:
        super().__init__(user_db)  # type: ignore[arg-type]
        self.send = send
        self.sent_hook = AsyncMock()
        self.failed_hook = AsyncMock()

    async def send_password_reset_email(self, email: str, token: str) -> None:
        await self.send(email, token)

    async def on_password_reset_email_sent(self, user_id, request=None) -> None:
        await self.sent_hook(user_id)

    async def on_password_reset_email_failed(self, user_id, failure_kind, request=None) -> None:
        await self.failed_hook(user_id, failure_kind)


def _manager(send: AsyncMock) -> _Manager:
    return _Manager(_UserDb([_User(KNOWN, uuid.uuid4())]), send)


@pytest.fixture
async def client_for() -> AsyncIterator:
    clients: list[AsyncClient] = []

    def build(manager: _Manager) -> AsyncClient:
        app = FastAPI()
        users = FastAPIUsers[_User, uuid.UUID](lambda: manager, [])
        app.include_router(users.get_reset_password_router(), prefix="/auth")
        client = AsyncClient(transport=ASGITransport(app=app), base_url="http://test")
        clients.append(client)
        return client

    yield build
    for client in clients:
        await client.aclose()
    await drain_tracked()


async def test_route_answers_the_same_for_a_known_address_whose_email_fails_and_an_unknown_one(
    client_for, caplog: pytest.LogCaptureFixture,
) -> None:
    manager = _manager(AsyncMock(side_effect=EmailSendError("smtp down", kind="transient")))
    client = client_for(manager)

    with caplog.at_level(logging.ERROR):
        known = await client.post("/auth/forgot-password", json={"email": KNOWN})
        unknown = await client.post("/auth/forgot-password", json={"email": "nobody@example.com"})
        await drain_tracked()

    assert (known.status_code, known.content) == (unknown.status_code, unknown.content) == (202, b"null")
    errors = [r.getMessage() for r in caplog.records if r.levelno == logging.ERROR]
    assert len(errors) == 1 and "kind=transient" in errors[0] and KNOWN not in errors[0]
    manager.failed_hook.assert_awaited_once()
    assert manager.failed_hook.await_args.args[1] == "transient"
    manager.sent_hook.assert_not_awaited()


async def test_the_response_does_not_wait_for_a_slow_send(client_for) -> None:
    release = asyncio.Event()

    async def slow_send(email: str, token: str) -> None:
        await release.wait()

    manager = _manager(AsyncMock(side_effect=slow_send))
    client = client_for(manager)

    response = await asyncio.wait_for(
        client.post("/auth/forgot-password", json={"email": KNOWN}), timeout=2,
    )

    assert response.status_code == 202
    manager.sent_hook.assert_not_awaited()
    release.set()
    await drain_tracked()
    manager.sent_hook.assert_awaited_once()


async def test_the_reset_email_is_sent_to_the_users_address_with_the_token(client_for) -> None:
    manager = _manager(AsyncMock())
    client = client_for(manager)

    await client.post("/auth/forgot-password", json={"email": KNOWN})
    await drain_tracked()

    manager.send.assert_awaited_once()
    email, token = manager.send.await_args.args
    assert email == KNOWN and token


async def test_a_missing_email_configuration_is_a_definite_failure_and_is_logged(
    caplog: pytest.LogCaptureFixture,
) -> None:
    manager = _manager(AsyncMock(side_effect=EmailNotConfiguredError("no smtp creds")))
    user = MagicMock(id=uuid.uuid4(), email=KNOWN)

    with caplog.at_level(logging.ERROR):
        await manager.on_after_forgot_password(user, "token")
        await drain_tracked()

    assert any("kind=not_configured" in r.getMessage() for r in caplog.records)
    manager.failed_hook.assert_awaited_once_with(user.id, "not_configured")


async def test_an_error_in_the_background_task_is_logged_not_lost(caplog: pytest.LogCaptureFixture) -> None:
    manager = _manager(AsyncMock(side_effect=ValueError("bad template")))
    user = MagicMock(id=uuid.uuid4(), email=KNOWN)

    with caplog.at_level(logging.ERROR):
        await manager.on_after_forgot_password(user, "token")
        await drain_tracked()

    record = next(r for r in caplog.records if "Background task password-reset-email" in r.getMessage())
    assert record.exc_info is not None and record.exc_info[0] is ValueError


async def test_the_default_sender_is_not_implemented() -> None:
    manager = PlatformBaseUserManager.__new__(PlatformBaseUserManager)

    with pytest.raises(NotImplementedError):
        await manager.send_password_reset_email(KNOWN, "token")
