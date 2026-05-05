"""Smoke test: GET /health returns 200 with status ok + database connectivity + version.

Mirrors apps/mybookkeeper/backend/tests/test_health.py — health response must
include a `version` field (git commit short SHA) so the deploy workflow can
verify the running container matches the expected revision.
"""
import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_health_returns_ok(client: AsyncClient) -> None:
    resp = await client.get("/health")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "ok"
    assert body["database"] == "connected"
    # `version` is set from git rev-parse at module import; in test runs the
    # repo is the worktree, so the value will be a short SHA or "unknown" — we
    # assert presence rather than a specific value.
    assert "version" in body
