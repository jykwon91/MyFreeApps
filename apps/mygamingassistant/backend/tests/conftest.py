"""Test fixtures for MyGamingAssistant backend.

Single-user app — no registration endpoint. Tests create the seed user
directly via the DB, then log in via /auth/jwt/login.

Mirrors apps/myjobhunter/backend/tests/conftest.py for all shared patterns.
"""
import asyncio
import sys

if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

import json
from collections.abc import AsyncGenerator
from typing import Any

import httpx
import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from platform_shared.services.discord import DiscordRestClient
from sqlalchemy import event
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from app.core.config import settings
from app.main import app
from app.services.discord import emojis as discord_emojis
from app.services.discord import rest

from discord_raid_harness import APP_ID, PUBLIC_KEY_HEX, FakeDiscord, Post, signed_headers


@pytest.fixture(autouse=True)
def _disable_external_auth_gates(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "hibp_enabled", False)
    monkeypatch.setattr(settings, "turnstile_secret_key", "")


@pytest.fixture(autouse=True)
def _no_discord_emoji_registry(monkeypatch: pytest.MonkeyPatch) -> None:
    """Raid posts render text tags ("[WAR]") unless a test patches in icons.

    The process-wide registry would otherwise list the app's emojis over the
    (fake) REST client on its first use — an extra recorded Discord call whose
    timing depends on test order.
    """
    monkeypatch.setattr(discord_emojis, "current", lambda: discord_emojis.EMPTY_EMOJIS)


@pytest.fixture(autouse=True)
def _reset_login_limiter():
    """Reset the per-IP login limiter buckets before every test."""
    from app.core.rate_limit import login_limiter
    login_limiter._buckets.clear()
    yield
    login_limiter._buckets.clear()


@pytest_asyncio.fixture(scope="session")
async def db_engine():
    engine = create_async_engine(settings.database_url, poolclass=NullPool)
    yield engine
    await engine.dispose()


@pytest_asyncio.fixture(scope="function")
async def db(db_engine) -> AsyncGenerator[AsyncSession, None]:
    """Per-test session wrapped in an outer transaction + nested SAVEPOINT.

    Several MGA services (ingestion_orchestrator, source_service) call
    ``await db.commit()`` to make per-chapter inserts durable across a
    sync batch. A naive begin()/rollback() conftest would have those
    commits punch through the test transaction, leaking state into the
    next test (manifest: ``UniqueViolationError: ix_game_slug``).

    The SAVEPOINT-joining pattern (per SQLAlchemy docs "Joining a Session
    into an external transaction") keeps the outer transaction open on the
    underlying connection and translates inner ``session.commit()`` calls
    into SAVEPOINT releases. An ``after_transaction_end`` listener
    reopens a fresh SAVEPOINT so subsequent commits inside the same test
    work too. The outer connection rollback at teardown discards
    everything regardless of how many commits ran inside.
    """
    async with db_engine.connect() as connection:
        outer_trans = await connection.begin()

        # Bind a session to this specific connection so service-level
        # commits land on the same transaction we control.
        session_factory = async_sessionmaker(
            bind=connection, expire_on_commit=False
        )
        async with session_factory() as session:
            await session.begin_nested()

            @event.listens_for(session.sync_session, "after_transaction_end")
            def _restart_savepoint(sess, trans):
                # When the SAVEPOINT ends (via session.commit() / rollback),
                # open a fresh one so the test can keep using `db` without
                # the outer transaction closing.
                if trans.nested and not trans._parent.nested:
                    sess.begin_nested()

            try:
                yield session
            finally:
                await outer_trans.rollback()


# Services that own their transaction boundary call ``unit_of_work()``
# directly (canonical MBK pattern — the route is a thin wrapper and does NOT
# receive a db session). The real factory opens a brand-new session on a
# different pooled connection, which cannot see rows created by the test's
# SAVEPOINT-bound ``db`` fixture (manifest: route 404s on a fixture-created
# row). ``from app.db.session import unit_of_work`` binds the callable into each
# consuming module's namespace at import time, so patching only
# ``app.db.session`` would miss them — patch the canonical module AND every
# consumer that imported the name by reference.
_UOW_CONSUMERS = (
    "app.api.account",
    "app.services.discord.autocomplete.raid_admin",
    "app.services.discord.commands.raid",
    "app.services.discord.commands.raid_admin",
    "app.services.discord.components.raid_admin",
    "app.services.discord.components.raid_card",
    "app.services.discord.components.raid_edit",
    "app.services.discord.components.raid_leader",
    "app.services.discord.components.raid_manage",
    "app.services.discord.components.raid_manage_changes",
    "app.services.discord.components.raid_manage_open",
    "app.services.discord.components.raid_manage_reason",
    "app.services.discord.components.raid_manage_status",
    "app.services.discord.components.raid_manage_swap",
    "app.services.discord.components.raid_member",
    "app.services.discord.components.raid_seat",
    "app.services.discord.components.raid_signup",
    "app.services.discord.raid_manage_notify",
    "app.services.discord.raid_ping",
    "app.services.discord.raid_publisher",
    "app.services.game.fixture_loader",
    "app.services.game.lineup_package_service",
    "app.services.game.source_service",
    "app.services.user.seed_user_service",
    "app.services.user.totp_service",
    "app.services.wow.item_extractor",
    "app.services.wow.map_capture_service",
)


def _bind_unit_of_work_to(db: AsyncSession, monkeypatch: pytest.MonkeyPatch) -> None:
    """Point every ``unit_of_work`` at the test's SAVEPOINT-bound session."""
    import importlib
    from contextlib import asynccontextmanager

    import app.db.session as _session_mod

    @asynccontextmanager
    async def _override_unit_of_work():
        yield db

    monkeypatch.setattr(_session_mod, "unit_of_work", _override_unit_of_work)
    for _mod_name in _UOW_CONSUMERS:
        _mod = importlib.import_module(_mod_name)
        if hasattr(_mod, "unit_of_work"):
            monkeypatch.setattr(_mod, "unit_of_work", _override_unit_of_work)


@pytest.fixture
def bound_unit_of_work(db: AsyncSession, monkeypatch: pytest.MonkeyPatch) -> AsyncSession:
    """Bind every ``unit_of_work`` consumer to the test session (no HTTP client).

    For tests that build their own app (e.g. the Discord interactions app)
    but still need service transactions to land on the SAVEPOINT-bound ``db``.
    """
    _bind_unit_of_work_to(db, monkeypatch)
    return db


@pytest_asyncio.fixture(scope="function")
async def client(
    db: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> AsyncGenerator[AsyncClient, None]:
    from app.db.session import get_db as _get_db

    async def _override_get_db():
        yield db

    _bind_unit_of_work_to(db, monkeypatch)
    app.dependency_overrides[_get_db] = _override_get_db

    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as ac:
        yield ac

    app.dependency_overrides.clear()


@pytest_asyncio.fixture
async def serve_only_client(
    db: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> AsyncGenerator[AsyncClient, None]:
    """An AsyncClient against a freshly-built serve_only app (production shape).

    Builds a SECOND app via ``create_app()`` with a serve_only settings clone
    and binds it to the test DB session exactly like ``client``. Does NOT touch
    the module-level app, so the rest of the suite (full-auth) is unaffected.
    """
    from app.db.session import get_db as _get_db
    from app.main import create_app

    serve_app = create_app(settings.model_copy(update={"serve_only": True}))

    async def _override_get_db():
        yield db

    _bind_unit_of_work_to(db, monkeypatch)
    serve_app.dependency_overrides[_get_db] = _override_get_db

    async with AsyncClient(
        transport=ASGITransport(app=serve_app),
        base_url="http://test",
    ) as ac:
        yield ac

    serve_app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# The raid bot over POST /discord/interactions — see discord_raid_harness.py
# ---------------------------------------------------------------------------


@pytest.fixture
def fake_discord(monkeypatch: pytest.MonkeyPatch) -> FakeDiscord:
    """Every outbound Discord REST call lands here instead of the network."""
    fake = FakeDiscord()

    async def _no_sleep(_seconds: float) -> None:
        return None

    def _factory() -> DiscordRestClient:
        return DiscordRestClient("test-bot-token", transport=httpx.MockTransport(fake.handler), sleep=_no_sleep)

    monkeypatch.setattr(rest, "make_rest_client", _factory)
    return fake


@pytest_asyncio.fixture
async def http(
    monkeypatch: pytest.MonkeyPatch, bound_unit_of_work: AsyncSession, fake_discord: FakeDiscord
) -> AsyncGenerator[AsyncClient, None]:
    """The interactions endpoint, trusting the harness's signing key."""
    monkeypatch.setattr(settings, "discord_enabled", True)
    monkeypatch.setattr(settings, "discord_public_key", PUBLIC_KEY_HEX)
    monkeypatch.setattr(settings, "discord_application_id", APP_ID)
    monkeypatch.setattr(settings, "discord_bot_token", "test-bot-token")

    from app.main import create_app

    async with AsyncClient(transport=ASGITransport(app=create_app()), base_url="http://test") as ac:
        yield ac


@pytest.fixture
def post(http: AsyncClient) -> Post:
    """Sign and send one interaction; returns the bot's reply."""

    async def _post(payload: dict[str, Any]) -> dict[str, Any]:
        body = json.dumps(payload).encode()
        resp = await http.post("/discord/interactions", content=body, headers=signed_headers(body))
        assert resp.status_code == 200, resp.text
        return resp.json()

    return _post
