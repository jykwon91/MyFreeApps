"""GET /wow/raids/{web_id} — the raid's web page over HTTP, against the DB.

The app is built as production mounts it with the bot (``discord_enabled``),
its sessions on the test's transaction.
"""
from __future__ import annotations

import uuid
from collections.abc import AsyncGenerator
from datetime import datetime, timezone

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.api import raid_web
from app.core.config import settings
from app.db.session import get_db
from app.models.wow.wow_raid_event import WowRaidEvent
from app.models.wow.wow_raid_guild import WowRaidGuild
from app.models.wow.wow_raid_signup import WowRaidSignup
from app.services.discord.rest import message_link
from app.services.wow.raid_catalog import raid_name

pytestmark = pytest.mark.asyncio

_STARTS = datetime(2099, 1, 2, 20, 0, tzinfo=timezone.utc)
_CHANNEL = "700000000000000001"
_MESSAGE = "910000000000000001"
_PLAYER = "300000000000000001"
_MENTIONED = "123456789012345678"


def _snowflake() -> str:
    return str(10**17 + uuid.uuid4().int % 10**17)


@pytest_asyncio.fixture
async def page_client(db: AsyncSession, monkeypatch: pytest.MonkeyPatch) -> AsyncGenerator[AsyncClient, None]:
    monkeypatch.setattr(settings, "discord_enabled", True)
    from app.main import create_app

    app = create_app()

    async def _override_get_db() -> AsyncGenerator[AsyncSession, None]:
        yield db

    app.dependency_overrides[get_db] = _override_get_db
    raid_web.raid_page_limiter._buckets.clear()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        yield client
    raid_web.raid_page_limiter._buckets.clear()


async def _raid(
    db: AsyncSession, *, status: str = "scheduled", player: str = "Garrosh"
) -> tuple[WowRaidEvent, WowRaidGuild]:
    guild = WowRaidGuild(discord_guild_id=_snowflake(), raid_channel_id=_CHANNEL, timezone="UTC")
    db.add(guild)
    await db.flush()
    event = WowRaidEvent(
        guild_id=guild.id,
        raid_key="onyxia",
        starts_at=_STARTS,
        size_cap=40,
        status=status,
        channel_id=_CHANNEL,
        message_id=_MESSAGE,
        created_by_user_id="500000000000000001",
        created_by_display_name="Thrall",
        notes=f"Bring FR, ask <@{_MENTIONED}>",
    )
    db.add(event)
    await db.flush()
    db.add(
        WowRaidSignup(
            event_id=event.id,
            discord_user_id=_PLAYER,
            display_name=player,
            wow_class="warrior",
            role="tank",
            spec="protection",
            note="secret note",
        )
    )
    await db.flush()
    return event, guild


@pytest.mark.parametrize("form", ["hex", "hyphenated"])
async def test_the_page_reads_by_its_web_id(page_client: AsyncClient, db: AsyncSession, form: str) -> None:
    event, guild = await _raid(db)
    web_id = event.web_id.hex
    if form == "hyphenated":
        web_id = str(event.web_id)
    response = await page_client.get(f"/wow/raids/{web_id}")
    assert response.status_code == 200, response.text
    assert response.headers["cache-control"] == "no-store"
    assert response.headers["x-robots-tag"] == "noindex"
    page = response.json()
    assert (page["web_id"], page["title"], page["state"]) == (str(event.web_id), raid_name("onyxia"), "open")
    assert page["discord_url"] == message_link(guild.discord_guild_id, _CHANNEL, _MESSAGE)
    assert [(column["key"], column["entries"][0]["name"]) for column in page["columns"]] == [("tank", "Garrosh")]
    assert page["description"][1] == {"kind": "mention", "text": "@member"}
    # Discord's own link to the post names its server and channel; nothing else may.
    rest = response.text.replace(page["discord_url"], "")
    for secret in (_PLAYER, _MENTIONED, "secret note", str(event.id), guild.discord_guild_id, _CHANNEL):
        assert secret not in rest


async def test_every_raid_gets_its_own_web_id(db: AsyncSession) -> None:
    first, _ = await _raid(db)
    second, _ = await _raid(db)
    assert None not in (first.web_id, second.web_id)
    assert len({first.web_id, second.web_id, first.id, second.id}) == 4


async def test_an_unknown_id_a_draft_or_the_event_id_is_not_found(page_client: AsyncClient, db: AsyncSession) -> None:
    posted, _ = await _raid(db)
    draft, _ = await _raid(db, status="draft")
    for web_id in (uuid.uuid4().hex, draft.web_id.hex, posted.id.hex):
        response = await page_client.get(f"/wow/raids/{web_id}")
        assert (response.status_code, response.json()["detail"]) == (404, "raid_not_found")
        assert response.headers["cache-control"] == "no-store"
        assert response.headers["x-robots-tag"] == "noindex"


@pytest.mark.parametrize("web_id", ["not-a-uuid", "1234", "%2E%2E"])
async def test_a_malformed_id_is_refused(page_client: AsyncClient, web_id: str) -> None:
    assert (await page_client.get(f"/wow/raids/{web_id}")).status_code == 422


async def test_two_guilds_never_mix(page_client: AsyncClient, db: AsyncSession) -> None:
    ours, _ = await _raid(db, player="Garrosh")
    theirs, _ = await _raid(db, player="Varian")
    for event, name in ((ours, "Garrosh"), (theirs, "Varian")):
        page = (await page_client.get(f"/wow/raids/{event.web_id.hex}")).json()
        names = [entry["name"] for column in page["columns"] for entry in column["entries"]]
        assert names == [name]


async def test_the_page_is_rate_limited_per_ip(
    page_client: AsyncClient, db: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    event, _ = await _raid(db)
    monkeypatch.setattr(raid_web.raid_page_limiter._config, "max_attempts", 2)
    statuses = [(await page_client.get(f"/wow/raids/{event.web_id.hex}")).status_code for _ in range(3)]
    assert statuses == [200, 200, 429]


@pytest.mark.parametrize("enabled", [True, False])
async def test_the_page_is_mounted_only_with_the_bot(monkeypatch: pytest.MonkeyPatch, enabled: bool) -> None:
    """Disabled = absent: FastAPI's own 404, not the page's ``raid_not_found``."""
    monkeypatch.setattr(settings, "discord_enabled", enabled)
    from app.main import create_app

    app = create_app()
    assert ({"/wow/raids/{web_id}", "/discord/raid-icons/{file_name}"} <= set(app.openapi()["paths"])) is enabled
    if enabled:
        return
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get(f"/wow/raids/{uuid.uuid4().hex}")
        icon = await client.get("/discord/raid-icons/warrior.png")
    assert (response.status_code, response.json()["detail"], icon.status_code) == (404, "Not Found", 404)
