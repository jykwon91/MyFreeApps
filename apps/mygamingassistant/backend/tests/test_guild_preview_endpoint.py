"""GET /wow/guilds/{slug}/preview.png: the card, the cache, and the generic-card fallback. No database."""
from __future__ import annotations

from collections.abc import AsyncGenerator
from datetime import timedelta

import pytest
import pytest_asyncio
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from app.api import wow_guilds
from app.core.guild_preview import CACHE_CONTROL, FALLBACK_IMAGE_PATH
from app.schemas.wow.guild.guild_response import GuildResponse
from app.services.wow.guild import guild_preview_service, guild_view_service
from guild_preview_fixtures import NOW, make_guild, make_member

PNG_MAGIC = b"\x89PNG\r\n\x1a\n"
URL = "/wow/guilds/topdeadcenter/preview.png"


@pytest_asyncio.fixture
async def http() -> AsyncGenerator[AsyncClient, None]:
    wow_guilds.guild_limiter._buckets.clear()
    guild_preview_service._cache.clear()
    app = FastAPI()
    app.include_router(wow_guilds.router)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        yield client


def stored(monkeypatch: pytest.MonkeyPatch, guild: GuildResponse | None) -> list[str]:
    calls: list[str] = []

    async def get_guild(slug: str) -> GuildResponse | None:
        calls.append(slug)
        return guild

    monkeypatch.setattr(guild_view_service, "get_guild", get_guild)
    return calls


async def test_a_stored_guild_gets_a_png_cached_for_an_hour(http: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    stored(monkeypatch, make_guild([make_member("Ana", honorable_kills=5)]))
    response = await http.get(URL)
    assert response.status_code == 200
    assert response.headers["content-type"] == "image/png"
    assert response.headers["cache-control"] == CACHE_CONTROL == "public, max-age=3600"
    assert response.content.startswith(PNG_MAGIC)


async def test_the_slug_is_case_insensitive(http: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    stored(monkeypatch, make_guild([make_member("Ana")]))
    assert (await http.get("/wow/guilds/TopDeadCenter/preview.png")).status_code == 200


async def test_the_card_is_not_redrawn_until_the_guild_is_refreshed(http: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    draws: list[str] = []
    real = guild_preview_service.render_png

    def counting(guild: GuildResponse) -> bytes:
        draws.append(guild.slug)
        return real(guild)

    monkeypatch.setattr(guild_preview_service, "render_png", counting)
    stored(monkeypatch, make_guild([make_member("Ana", honorable_kills=5)]))
    await http.get(URL)
    await http.get(URL)
    assert draws == ["topdeadcenter"]

    refreshed = make_guild([make_member("Ana", honorable_kills=6, refreshed_at=NOW + timedelta(hours=1))])
    stored(monkeypatch, refreshed)
    await http.get(URL)
    assert len(draws) == 2

    stored(monkeypatch, make_guild(refreshed.members, roster_updated_at=NOW + timedelta(hours=2)))
    await http.get(URL)
    assert len(draws) == 3


async def test_a_guild_never_stored_redirects_to_the_generic_card(http: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    stored(monkeypatch, None)
    response = await http.get(URL)
    assert response.status_code == 302
    assert response.headers["location"] == FALLBACK_IMAGE_PATH


async def test_a_render_failure_is_logged_and_redirects_to_the_generic_card(
    http: AsyncClient, monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture,
) -> None:
    stored(monkeypatch, make_guild([make_member("Ana")]))

    def boom(guild: GuildResponse) -> bytes:
        raise RuntimeError("font missing")

    monkeypatch.setattr(guild_preview_service, "render_png", boom)
    response = await http.get(URL)
    assert response.status_code == 302
    assert response.headers["location"] == FALLBACK_IMAGE_PATH
    assert "render failed" in caplog.text
    assert guild_preview_service._cache == {}


async def test_any_other_slug_is_a_404_even_when_stored(http: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    calls = stored(monkeypatch, make_guild([make_member("Ana")]))
    response = await http.get("/wow/guilds/other-guild/preview.png")
    assert response.status_code == 404
    assert calls == []
