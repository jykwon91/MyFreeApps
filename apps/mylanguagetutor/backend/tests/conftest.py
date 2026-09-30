"""Test fixtures for MyLanguageTutor backend.

Multi-user app — tenant isolation strategy mirrors MyJobHunter:
- Each test registers fresh users via the API (``user_factory``).
- Users are hard-deleted on teardown, cascade-removing every tutor session/turn row they
  own (FK ``ON DELETE CASCADE`` on ``user_id``) so no artifacts persist.
- Use ``as_user(user)`` to get an httpx client bearing that user's JWT.

Mirrors apps/myjobhunter/backend/tests/conftest.py (minus MJH-specific
discovery / scheduler / embedding fixtures).
"""
import asyncio
import sys

# Windows: asyncpg is incompatible with the default ProactorEventLoop when a
# connection is reused across event loops (e.g. when a service opens a new
# session via unit_of_work inside a test). SelectorEventLoop avoids this.
if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

from collections.abc import AsyncGenerator, Callable
from typing import Any

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from app.core.config import settings
from app.main import app

# Importing this installs the fast-password-helper monkeypatch at import time
# (replaces argon2 ~250ms/hash with SHA-256 for test speed). See
# platform_shared.testing.factories for the rationale + safety notes.
from platform_shared.testing.factories import make_api_user_factory


@pytest.fixture(autouse=True)
def _disable_external_auth_gates(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "hibp_enabled", False)
    monkeypatch.setattr(settings, "turnstile_secret_key", "")


@pytest.fixture(autouse=True)
def _reset_rate_limiters():
    """Clear per-IP limiter buckets before + after every test.

    The limiters hold bucket state in module-level dicts; without this the
    buckets accumulate across the session and exhaust the budget, causing
    unrelated tests' login/register calls to receive 429.
    """
    from app.core.rate_limit import (
        login_limiter,
        register_limiter,
        totp_limiter,
        turn_limiter,
    )

    limiters = (login_limiter, register_limiter, totp_limiter, turn_limiter)
    for limiter in limiters:
        limiter._buckets.clear()
    yield
    for limiter in limiters:
        limiter._buckets.clear()


@pytest_asyncio.fixture(scope="session")
async def db_engine():
    engine = create_async_engine(settings.database_url, poolclass=NullPool)
    yield engine
    await engine.dispose()


@pytest_asyncio.fixture(scope="function")
async def db(db_engine) -> AsyncGenerator[AsyncSession, None]:
    """Async session wrapped in a transaction rolled back after the test."""
    session_factory = async_sessionmaker(db_engine, expire_on_commit=False)
    async with session_factory() as session:
        await session.begin()
        yield session
        await session.rollback()


@pytest_asyncio.fixture(scope="function")
async def client(db: AsyncSession) -> AsyncGenerator[AsyncClient, None]:
    """Unauthenticated client; overrides get_db so requests share the test txn."""
    from app.db.session import get_db as _get_db

    async def _override_get_db():
        yield db

    app.dependency_overrides[_get_db] = _override_get_db
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.clear()


# User factory — registers users via /auth/register and hard-deletes them on
# teardown. Shared implementation lives in platform_shared.testing.factories.
from app.db.session import get_db as _mylanguagetutor_get_db  # noqa: E402

user_factory = make_api_user_factory(
    app=app,
    database_url_getter=lambda: settings.database_url,
    get_db_dep=_mylanguagetutor_get_db,
)


@pytest_asyncio.fixture(scope="function")
async def as_user(db: AsyncSession) -> Callable:
    """Return a factory that yields an authenticated AsyncClient for a user.

    Usage:
        user = await user_factory()
        async with await as_user(user) as authed:
            resp = await authed.get("/sessions")
    """
    from app.db.session import get_db as _get_db

    async def _override_get_db():
        yield db

    async def _make_client(user: dict[str, Any]) -> AsyncClient:
        token_resp = await AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test",
        ).post(
            "/auth/jwt/login",
            data={"username": user["email"], "password": user["password"]},
        )
        assert token_resp.status_code == 200, f"Login failed: {token_resp.text}"
        token = token_resp.json()["access_token"]

        app.dependency_overrides[_get_db] = _override_get_db
        return AsyncClient(
            transport=ASGITransport(app=app),
            base_url="http://test",
            headers={"Authorization": f"Bearer {token}"},
        )

    return _make_client


# ---------------------------------------------------------------------------
# Tutor turn fixtures: a scripted fake Anthropic client + quota-row cleanup.
# ---------------------------------------------------------------------------

from dataclasses import dataclass, field as _field  # noqa: E402
from types import SimpleNamespace  # noqa: E402

from sqlalchemy import text as _sql_text  # noqa: E402


def _usage(input_tokens: int, output_tokens: int) -> SimpleNamespace:
    return SimpleNamespace(
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        cache_read_input_tokens=0,
        cache_creation_input_tokens=0,
    )


def _message(text_value: str, usage: SimpleNamespace) -> SimpleNamespace:
    return SimpleNamespace(
        content=[SimpleNamespace(type="text", text=text_value)], usage=usage,
    )


@dataclass
class FakeClaude:
    """Stands in for ``anthropic.AsyncAnthropic`` in turn tests.

    ``reply_chunks`` stream as text deltas. ``reply_error`` raises either on
    stream open (``reply_error_after is None`` -- before any token, like a
    real 429/529) or after that many chunks (mid-stream failure).
    """

    reply_chunks: list[str] = _field(default_factory=lambda: ["¡Hola! ", "¿Qué quieres tomar?"])
    reply_error: Exception | None = None
    reply_error_after: int | None = None
    corrections_json: str = '{"corrections": [], "retry_prompt": null, "goals_met_this_turn": []}'
    translation_text: str = "Hi! What would you like to drink?"
    reply_usage: SimpleNamespace = _field(default_factory=lambda: _usage(100, 20))
    corrections_usage: SimpleNamespace = _field(default_factory=lambda: _usage(200, 50))
    translation_usage: SimpleNamespace = _field(default_factory=lambda: _usage(50, 10))
    stream_calls: list[dict[str, Any]] = _field(default_factory=list)
    create_calls: list[dict[str, Any]] = _field(default_factory=list)

    @property
    def messages(self) -> "FakeClaude":
        return self

    @property
    def calls(self) -> int:
        return len(self.stream_calls) + len(self.create_calls)

    def stream(self, **kwargs: Any) -> "_FakeStream":
        self.stream_calls.append(kwargs)
        return _FakeStream(self)

    async def create(self, **kwargs: Any) -> SimpleNamespace:
        self.create_calls.append(kwargs)
        if "output_config" in kwargs:
            return _message(self.corrections_json, self.corrections_usage)
        return _message(self.translation_text, self.translation_usage)


class _FakeStream:
    def __init__(self, fake: FakeClaude) -> None:
        self._fake = fake

    async def __aenter__(self) -> "_FakeStream":
        if self._fake.reply_error is not None and self._fake.reply_error_after is None:
            raise self._fake.reply_error
        return self

    async def __aexit__(self, *exc: object) -> bool:
        return False

    @property
    def text_stream(self):
        async def _gen():
            for i, chunk in enumerate(self._fake.reply_chunks):
                if self._fake.reply_error is not None and self._fake.reply_error_after == i:
                    raise self._fake.reply_error
                yield chunk
        return _gen()

    async def get_final_message(self) -> SimpleNamespace:
        return SimpleNamespace(content=[], usage=self._fake.reply_usage)


async def _purge_tutor_quota_rows() -> None:
    engine = create_async_engine(settings.database_url, poolclass=NullPool)
    try:
        async with engine.begin() as conn:
            await conn.execute(
                _sql_text("DELETE FROM daily_usage_counters WHERE bucket LIKE 'ltutor:%'")
            )
    finally:
        await engine.dispose()


@pytest_asyncio.fixture(scope="function")
async def fake_claude(monkeypatch: pytest.MonkeyPatch) -> AsyncGenerator[FakeClaude, None]:
    """Tutor enabled with a scripted fake Claude; quota rows + turn slots reset."""
    from app.services.tutor.turn_slots import turn_slots

    fake = FakeClaude()
    monkeypatch.setattr(settings, "anthropic_api_key", "test-key-not-real")
    monkeypatch.setattr("app.services.tutor.turn_service.get_client", lambda: fake)
    turn_slots.clear()
    await _purge_tutor_quota_rows()
    yield fake
    turn_slots.clear()
    await _purge_tutor_quota_rows()
