import os
import subprocess
from unittest.mock import patch

import pytest


def test_resolve_git_commit_from_env():
    """When GIT_COMMIT env var is set, it takes precedence."""
    with patch.dict(os.environ, {"GIT_COMMIT": "abc1234"}):
        from app.main import _resolve_git_commit
        assert _resolve_git_commit() == "abc1234"


def test_resolve_git_commit_falls_back_to_git():
    """When no env var, falls back to git rev-parse."""
    with patch.dict(os.environ, {"GIT_COMMIT": ""}):
        from app.main import _resolve_git_commit
        result = _resolve_git_commit()
        assert len(result) > 0
        assert result != "unknown"


def test_resolve_git_commit_returns_unknown_when_no_git():
    """When both env var and git are unavailable, returns 'unknown'."""
    with patch.dict(os.environ, {"GIT_COMMIT": ""}):
        with patch("subprocess.check_output", side_effect=FileNotFoundError):
            from app.main import _resolve_git_commit
            assert _resolve_git_commit() == "unknown"


def test_resolve_git_commit_strips_whitespace():
    """Env var value is stripped of whitespace."""
    with patch.dict(os.environ, {"GIT_COMMIT": "  abc1234  "}):
        from app.main import _resolve_git_commit
        assert _resolve_git_commit() == "abc1234"


def test_git_commit_module_level_is_set():
    """The module-level GIT_COMMIT is populated at import time."""
    from app.main import GIT_COMMIT
    assert isinstance(GIT_COMMIT, str)
    assert len(GIT_COMMIT) > 0


def test_startup_timestamp_is_iso_format():
    """The module-level STARTUP_TIMESTAMP is a valid ISO timestamp."""
    from app.main import STARTUP_TIMESTAMP
    from datetime import datetime
    # Should not raise
    parsed = datetime.fromisoformat(STARTUP_TIMESTAMP)
    assert parsed is not None


@pytest.mark.asyncio
async def test_version_endpoint_returns_commit_and_timestamp():
    """GET /api/version returns commit and timestamp."""
    from app.main import app, GIT_COMMIT, STARTUP_TIMESTAMP
    from httpx import ASGITransport, AsyncClient

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get("/api/version")

    assert resp.status_code == 200
    body = resp.json()
    assert body["commit"] == GIT_COMMIT
    assert body["timestamp"] == STARTUP_TIMESTAMP


@pytest.mark.asyncio
async def test_health_endpoint_includes_version():
    """GET /health includes the version field."""
    from app.main import app, GIT_COMMIT
    from httpx import ASGITransport, AsyncClient

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get("/health")

    body = resp.json()
    assert "version" in body
    assert body["version"] == GIT_COMMIT
