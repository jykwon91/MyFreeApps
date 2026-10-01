"""The raid bot's committed icon art (backend/data/discord_emojis).

A bad PNG, a renderer asking for an icon nobody drew, or a missing credit
fails here instead of in a deploy (``discord-sync-emojis``) or in Discord.
"""
from __future__ import annotations

import re
import uuid
from datetime import datetime, timezone

from platform_shared.services.discord import EmojiRef, EmojiSet, expected_names, load_assets

from app.models.wow.wow_raid_event import WowRaidEvent
from app.models.wow.wow_raid_guild import WowRaidGuild
from app.models.wow.wow_raid_signup import WowRaidSignup
from app.services.discord.emojis import EMOJI_DIR
from app.services.discord.raid_views import class_picker_data, roster_data, spec_picker_data
from app.services.wow.raid_catalog import CLASSES, SPECS
from app.services.wow.raid_embed import build_signup_message

# Discord's per-application cap; the sync keeps the previous version of each icon too.
_APP_EMOJI_CAP = 2000
_KEPT_VERSIONS = 2

_ASSETS = load_assets(EMOJI_DIR)


def _all_art() -> EmojiSet:
    """Every committed icon, as the registry would resolve it once synced."""
    names = sorted(expected_names(_ASSETS).items())
    return EmojiSet({logical: EmojiRef(str(1400000000000000000 + i), name) for i, (logical, name) in enumerate(names)})


def test_the_art_loads_and_fits_the_application_emoji_cap() -> None:
    assert _ASSETS
    assert len(_ASSETS) * _KEPT_VERSIONS <= _APP_EMOJI_CAP


def test_every_icon_the_raid_bot_renders_has_art() -> None:
    icons = _all_art()
    event = WowRaidEvent(
        id=uuid.uuid4(),
        guild_id=uuid.uuid4(),
        raid_key="onyxia",
        starts_at=datetime(2026, 10, 11, tzinfo=timezone.utc),
        size_cap=40,
        status="scheduled",
        channel_id="c1",
        created_by_user_id="u0",
        created_by_display_name="Thrall",
    )
    guild = WowRaidGuild(id=uuid.uuid4(), discord_guild_id="g1", raid_channel_id="c1", timezone="UTC")
    signups = [
        WowRaidSignup(
            event_id=event.id,
            discord_user_id=str(i),
            display_name=cls.label,
            status="confirmed",
            wow_class=cls.key,
            role=cls.specs[0].raid_role,
            spec=cls.specs[0].key,
            signed_up_at=datetime(2026, 10, 1, 12, i, tzinfo=timezone.utc),
            updated_at=datetime(2026, 10, 1, tzinfo=timezone.utc),
        )
        for i, cls in enumerate(CLASSES)
    ]

    post = build_signup_message(event, signups, guild, emojis=icons)
    status_row = post["components"][0]["components"]
    assert all("emoji" in button for button in status_row)
    post_text = "\n".join(field["value"] for field in post["embeds"][0]["fields"])
    assert not re.search(r"\[[A-Z]{3}\]", post_text), "a class tag stood in for a missing icon"

    [picker_row] = class_picker_data(event, "confirmed", emojis=icons)["components"]
    assert all("emoji" in option for option in picker_row["components"][0]["options"])
    assert [spec.icon for spec in SPECS if not icons.has(spec.icon)] == []
    for cls in CLASSES:
        spec_row, _ = spec_picker_data(event, "confirmed", cls.key, current=None, emojis=icons)["components"]
        assert all("emoji" in option for option in spec_row["components"][0]["options"])

    [roster] = roster_data(event, signups, guild, emojis=icons)["embeds"]
    assert not re.search(r"\[[A-Z]{3}\]", roster["description"])


def test_icon_names_follow_the_documented_families() -> None:
    class_keys = {cls.key for cls in CLASSES}
    for logical in _ASSETS:
        family, _, rest = logical.partition("_")
        if family in class_keys:
            assert rest == "" or rest.replace("_", "").isalpha(), logical
        else:
            assert family in {"role", "status", "info", "ui", "tile"}, f"unexpected icon family: {logical}"
    assert {f"role_{role}" for role in ("tank", "healer", "melee", "ranged", "dps")} <= _ASSETS.keys()
    assert {
        f"status_{status}" for status in ("signed", "late", "tentative", "bench", "absence", "queued")
    } <= _ASSETS.keys()


def test_notice_credits_exactly_the_glyph_icons() -> None:
    notice = (EMOJI_DIR / "NOTICE.md").read_text(encoding="utf-8")
    credited = set(re.findall(r"^\| `([a-z0-9_]+)` \|", notice, flags=re.MULTILINE))
    glyph_icons = {logical for logical in _ASSETS if not logical.startswith("tile_")}
    assert credited == glyph_icons
    assert "CC BY 3.0" in notice
    assert "SIL Open Font License" in notice
