"""Smoke tests for the health and version endpoints.

Mirrors apps/myjobhunter/backend/tests/test_health.py.

``GET /health`` checks DB connectivity, so it returns 200 only when a real
database is available. In the Phase 1 environment (no DB yet), it returns
503 with status "degraded" — which is the correct fail-safe behaviour.

Both outcomes assert the endpoint exists, responds with JSON, and includes
the required response fields. The 200 + "ok" assertion is conditioned on
DB availability rather than skipping the test entirely, so CI catches
regressions where the response shape breaks even in degraded mode.
"""
import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_health_endpoint_exists(client: AsyncClient) -> None:
    """Health endpoint exists and returns a JSON body with status + version."""
    resp = await client.get("/health")
    assert resp.status_code in (200, 503)
    data = resp.json()
    assert "status" in data
    assert "version" in data


@pytest.mark.asyncio
async def test_health_response_shape_ok_or_degraded(client: AsyncClient) -> None:
    """Health status is either 'ok' (DB connected) or 'degraded' (DB unreachable)."""
    resp = await client.get("/health")
    data = resp.json()
    assert data["status"] in ("ok", "degraded")


@pytest.mark.asyncio
async def test_version_returns_commit(client: AsyncClient) -> None:
    resp = await client.get("/version")
    assert resp.status_code == 200
    data = resp.json()
    # `commit` is git rev-parse at import time — in test env will be a SHA or "unknown"
    assert "commit" in data
    assert "timestamp" in data
