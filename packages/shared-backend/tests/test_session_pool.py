"""Tests for the DB connection-pool configuration in create_session_factory.

Pool sizing is a traffic-resilience control: every uvicorn worker and every
background-worker container opens its own engine against the same per-app
Postgres (default max_connections=100), so an oversized pool can exhaust
Postgres under load and hang every request for pool_timeout seconds. These
tests pin the contract (the exact kwargs passed to create_async_engine)
without depending on SQLAlchemy pool internals.
"""
from __future__ import annotations

from unittest.mock import MagicMock, patch

from platform_shared.db.session import create_session_factory

_ENGINE = "platform_shared.db.session.create_async_engine"
_PG_URL = "postgresql+asyncpg://u:p@db/app"


class TestPoolConfig:
    def test_postgres_pool_defaults_bounded(self) -> None:
        with patch(_ENGINE, return_value=MagicMock()) as mk:
            create_session_factory(_PG_URL)
        kwargs = mk.call_args.kwargs
        assert kwargs["pool_size"] == 5
        assert kwargs["max_overflow"] == 10
        assert kwargs["pool_timeout"] == 10
        assert kwargs["pool_pre_ping"] is True
        # Per-engine ceiling × the canonical app's 4 engines (2 api workers +
        # upload-processor + scheduler) must stay under Postgres max_connections.
        assert (kwargs["pool_size"] + kwargs["max_overflow"]) * 4 < 100

    def test_sqlite_skips_pool_kwargs(self) -> None:
        # SQLite's async StaticPool rejects pool sizing kwargs — the factory
        # must not pass them (unit tests run on SQLite).
        with patch(_ENGINE, return_value=MagicMock()) as mk:
            create_session_factory("sqlite+aiosqlite:///:memory:")
        kwargs = mk.call_args.kwargs
        assert "pool_size" not in kwargs
        assert "max_overflow" not in kwargs
        assert "pool_pre_ping" not in kwargs

    def test_explicit_overrides_respected(self) -> None:
        with patch(_ENGINE, return_value=MagicMock()) as mk:
            create_session_factory(_PG_URL, pool_size=8, max_overflow=4)
        kwargs = mk.call_args.kwargs
        assert kwargs["pool_size"] == 8
        assert kwargs["max_overflow"] == 4
        # Untouched defaults still apply.
        assert kwargs["pool_pre_ping"] is True
