"""Regression tests for app.db.session engine kwarg construction.

PR #91 surfaced a bug: pool kwargs (pool_size, max_overflow, pool_timeout,
pool_recycle) were passed unconditionally to create_async_engine. SQLAlchemy's
sqlite dialect rejects these, breaking the test suite which uses an in-memory
sqlite URL. The fix builds engine kwargs conditionally on the URL dialect.
"""
import importlib
import sys
from typing import Any
from unittest.mock import patch


def _reload_session_with_url(url: str) -> dict[str, Any]:
    """Reload app.db.session with a patched DATABASE_URL and return the engine kwargs
    captured from create_async_engine."""
    captured: dict[str, Any] = {}

    def _capture(database_url: str, **kwargs: Any) -> Any:
        captured["url"] = database_url
        captured["kwargs"] = kwargs

        # Return a stub object that async_sessionmaker can wrap without erroring.
        class _StubEngine:
            sync_engine = object()

        return _StubEngine()

    sys.modules.pop("app.db.session", None)
    with patch("app.core.config.settings.database_url", url), patch(
        "sqlalchemy.ext.asyncio.create_async_engine", side_effect=_capture
    ):
        importlib.import_module("app.db.session")

    # Drop the patched module so subsequent tests get a fresh, correctly-built engine.
    sys.modules.pop("app.db.session", None)
    return captured


def test_sqlite_url_omits_pool_kwargs() -> None:
    captured = _reload_session_with_url("sqlite+aiosqlite:///:memory:")
    kwargs = captured["kwargs"]
    assert "pool_size" not in kwargs
    assert "max_overflow" not in kwargs
    assert "pool_timeout" not in kwargs
    assert "pool_recycle" not in kwargs
    assert kwargs.get("echo") is False


def test_postgres_url_includes_pool_kwargs() -> None:
    captured = _reload_session_with_url(
        "postgresql+asyncpg://user:pw@localhost:5432/mybookkeeper"
    )
    kwargs = captured["kwargs"]
    assert kwargs["pool_size"] == 10
    assert kwargs["max_overflow"] == 20
    assert kwargs["pool_timeout"] == 30
    assert kwargs["pool_recycle"] == 1800
    assert kwargs["echo"] is False
