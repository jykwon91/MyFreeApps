"""GET /discord/activity-config — the Discord Activity's boot config.

The SPA running inside Discord fetches the application (client) id from here
before constructing the Embedded App SDK. Mounted only when the Discord
integration is configured: disabled = absent (404), so the Activity shows its
error state instead of booting the SDK with an empty id. Public in both modes
(the production serve-only build is exactly where the Activity runs).
"""
from __future__ import annotations

import pytest
from httpx import ASGITransport, AsyncClient

from app.core.config import settings


async def _get_config(monkeypatch: pytest.MonkeyPatch, **overrides: object):
    for name, value in overrides.items():
        monkeypatch.setattr(settings, name, value)

    from app.main import create_app

    app = create_app()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        return await ac.get("/discord/activity-config")


@pytest.mark.asyncio
@pytest.mark.parametrize("serve_only", [False, True])
async def test_returns_the_application_id_when_discord_is_configured(
    monkeypatch: pytest.MonkeyPatch, serve_only: bool,
) -> None:
    resp = await _get_config(
        monkeypatch,
        discord_enabled=True,
        discord_application_id="1555249458542022666",
        serve_only=serve_only,
    )

    assert resp.status_code == 200
    assert resp.json() == {"client_id": "1555249458542022666"}


@pytest.mark.asyncio
async def test_absent_when_discord_is_disabled(monkeypatch: pytest.MonkeyPatch) -> None:
    resp = await _get_config(
        monkeypatch, discord_enabled=False, discord_application_id="1555249458542022666",
    )

    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_absent_when_the_application_id_is_missing(monkeypatch: pytest.MonkeyPatch) -> None:
    resp = await _get_config(monkeypatch, discord_enabled=True, discord_application_id="")

    assert resp.status_code == 404
