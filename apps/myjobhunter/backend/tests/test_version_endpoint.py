"""Tests for the deploy-verification surfaces — _resolve_git_commit, /version,
and the version field on /health.

Mirrors apps/mybookkeeper/backend/tests/test_version_endpoint.py — keep the
two in sync. The contract is: the deploy workflow uses `/version` (or the
`version` field on `/health`) to confirm which commit is live without
parsing container logs. Breaking the response shape regresses that loop.

Note that MJH mounts FastAPI with ``root_path="/api"``, so:
- The `/version` route declared in app.main is reachable inside the test
  client at the bare path `/version` (the test client does NOT prepend the
  root_path — that's added by the upstream Caddy proxy in production).
- The same applies to the `/health` route mounted via app/api/health.py.
"""
import os
import subprocess  # noqa: F401 — used by patch path
from datetime import datetime
from unittest.mock import patch

import pytest
from httpx import ASGITransport, AsyncClient


def test_resolve_git_commit_from_env() -> None:
    """When GIT_COMMIT env var is set, it takes precedence."""
    with patch.dict(os.environ, {"GIT_COMMIT": "abc1234"}):
        from app.main import _resolve_git_commit
        assert _resolve_git_commit() == "abc1234"


def test_resolve_git_commit_falls_back_to_git() -> None:
    """When no env var, falls back to git rev-parse."""
    with patch.dict(os.environ, {"GIT_COMMIT": ""}):
        from app.main import _resolve_git_commit
        result = _resolve_git_commit()
        assert len(result) > 0
        assert result != "unknown"


def test_resolve_git_commit_returns_unknown_when_no_git() -> None:
    """When both env var and git are unavailable, returns 'unknown'."""
    with patch.dict(os.environ, {"GIT_COMMIT": ""}):
        with patch("subprocess.check_output", side_effect=FileNotFoundError):
            from app.main import _resolve_git_commit
            assert _resolve_git_commit() == "unknown"


def test_resolve_git_commit_strips_whitespace() -> None:
    """Env var value is stripped of whitespace."""
    with patch.dict(os.environ, {"GIT_COMMIT": "  abc1234  "}):
        from app.main import _resolve_git_commit
        assert _resolve_git_commit() == "abc1234"


def test_git_commit_module_level_is_set() -> None:
    """The module-level GIT_COMMIT is populated at import time."""
    from app.main import GIT_COMMIT
    assert isinstance(GIT_COMMIT, str)
    assert len(GIT_COMMIT) > 0


def test_startup_timestamp_is_iso_format() -> None:
    """The module-level STARTUP_TIMESTAMP is a valid ISO timestamp."""
    from app.main import STARTUP_TIMESTAMP
    parsed = datetime.fromisoformat(STARTUP_TIMESTAMP)
    assert parsed is not None


@pytest.mark.asyncio
async def test_version_endpoint_returns_commit_and_timestamp() -> None:
    """GET /version returns commit and timestamp.

    In production this endpoint is reachable at /api/version because Docker
    Caddy strips the /api prefix before forwarding; FastAPI's root_path="/api"
    handles the OpenAPI display. The ASGI test client bypasses the proxy,
    so we hit the path FastAPI registered: /version.
    """
    from app.main import app, GIT_COMMIT, STARTUP_TIMESTAMP

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get("/version")

    assert resp.status_code == 200
    body = resp.json()
    assert body["commit"] == GIT_COMMIT
    assert body["timestamp"] == STARTUP_TIMESTAMP


@pytest.mark.asyncio
async def test_health_endpoint_includes_version() -> None:
    """GET /health includes the version field for deploy verification."""
    from app.main import app, GIT_COMMIT

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get("/health")

    body = resp.json()
    assert "version" in body
    assert body["version"] == GIT_COMMIT
