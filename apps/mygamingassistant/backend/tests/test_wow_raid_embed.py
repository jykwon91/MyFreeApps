"""Unit tests for app.services.wow.raid_embed — pure; Discord limits pinned."""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

import pytest

from app.models.wow.wow_raid_event import WowRaidEvent
from app.models.wow.wow_raid_guild import WowRaidGuild
from app.models.wow.wow_raid_signup import WowRaidSignup
from app.services.wow import raid_custom_id
from app.services.wow.raid_catalog import CLASSES
from app.services.wow.raid_embed import (
    COLOR_CANCELLED,
    COLOR_FULL,
    COLOR_OPEN,
    COLLAPSED_STATUS_TEXT,
    EMBED_TOTAL_BUDGET,
    FIELD_VALUE_LIMIT,
    NO_SIGNUPS_TEXT,
    build_initial_post,
    build_signup_message,
    embed_length,
    escape_name,
)

# Sat Oct 10 2026, 20:00 America/New_York
_STARTS = datetime(2026, 10, 11, 0, 0, tzinfo=timezone.utc)
_T0 = datetime(2026, 10, 1, 12, 0, tzinfo=timezone.utc)


def _guild(**overrides: object) -> WowRaidGuild:
    fields: dict[str, object] = {
        "id": uuid.uuid4(),
        "discord_guild_id": "g1",
        "raid_channel_id": "c1",
        "ping_role_id": None,
        "timezone": "America/New_York",
    }
    fields.update(overrides)
    return WowRaidGuild(**fields)


def _event(**overrides: object) -> WowRaidEvent:
    fields: dict[str, object] = {
        "id": uuid.UUID("a1b2c3d4-0000-4000-8000-000000000000"),
        "guild_id": uuid.uuid4(),
        "raid_key": "onyxia",
        "starts_at": _STARTS,
        "size_cap": 40,
        "status": "scheduled",
        "channel_id": "c1",
        "created_by_user_id": "u0",
        "created_by_display_name": "Thrall",
        "notes": None,
        "cancel_reason": None,
        "title": None,
    }
    fields.update(overrides)
    return WowRaidEvent(**fields)


def _signup(
    name: str,
    *,
    status: str = "confirmed",
    wow_class: str | None = "warrior",
    role: str | None = "tank",
    minute: int = 0,
) -> WowRaidSignup:
    return WowRaidSignup(
        event_id=uuid.uuid4(),
        discord_user_id=str(uuid.uuid4().int)[:18],
        display_name=name,
        status=status,
        wow_class=wow_class,
        role=role,
        signed_up_at=_T0 + timedelta(minutes=minute),
        updated_at=_T0,
    )


def _embed(message: dict) -> dict:
    return message["embeds"][0]


def _fields_by_name(embed: dict) -> dict[str, str]:
    return {field["name"]: field["value"] for field in embed.get("fields", [])}


def _assert_within_limits(embed: dict) -> None:
    assert embed_length(embed) <= EMBED_TOTAL_BUDGET
    assert len(embed.get("fields", [])) <= 25
    for field in embed.get("fields", []):
        assert 0 < len(field["value"]) <= FIELD_VALUE_LIMIT
        assert len(field["name"]) <= 256
    assert len(embed["title"]) <= 256
    assert len(embed["description"]) <= 4096


# ---------------------------------------------------------------------------
# Layout
# ---------------------------------------------------------------------------


def test_empty_raid_invites_first_signup() -> None:
    message = build_signup_message(_event(), [], _guild())
    embed = _embed(message)
    assert embed["title"] == "Onyxia — Sat Oct 10"
    assert embed["color"] == COLOR_OPEN
    assert NO_SIGNUPS_TEXT in embed["description"]
    assert "**Confirmed 0/40**" in embed["description"]
    assert "fields" not in embed
    assert embed["footer"]["text"] == "Signed up: 0 · Created by Thrall · Raid ID a1b2"
    assert message["allowed_mentions"] == {"parse": []}
    assert "content" not in message


def test_description_has_timestamps_notes_and_counts() -> None:
    signups = [
        _signup("Alice"),
        _signup("Bob", status="tentative", wow_class="mage", role="dps"),
        _signup("Cleo", status="late", wow_class="priest", role="healer"),
        _signup("Dan", status="declined", wow_class=None, role=None),
    ]
    embed = _embed(build_signup_message(_event(notes="Bring fire resist"), signups, _guild()))
    stamp = int(_STARTS.timestamp())
    lines = embed["description"].split("\n")
    assert lines[0] == f"<t:{stamp}:F> (<t:{stamp}:R>)"
    assert lines[1] == "Bring fire resist"
    assert lines[2] == "**Confirmed 1/40** · Tentative 1 · Late 1 · Declined 1"
    assert embed["footer"]["text"].startswith("Signed up: 3 ")


def test_role_fields_group_by_class_in_signup_order() -> None:
    signups = [
        _signup("Alice", minute=1),
        _signup("Bob", minute=2),
        _signup("Pala", wow_class="paladin", role="tank", minute=3),
        _signup("Heals", wow_class="priest", role="healer", minute=4),
        _signup("Rogue", wow_class="rogue", role="dps", minute=5),
    ]
    fields = _fields_by_name(_embed(build_signup_message(_event(), signups, _guild())))
    assert fields["Tanks (3)"] == "[WAR] Warrior ×2: Alice, Bob\n[PAL] Paladin ×1: Pala"
    assert fields["Healers (1)"] == "[PRI] Priest ×1: Heals"
    assert fields["DPS (1)"] == "[ROG] Rogue ×1: Rogue"
    assert all(field["inline"] is False for field in _embed(build_signup_message(_event(), signups, _guild()))["fields"])


def test_status_fields_and_empty_roles() -> None:
    signups = [
        _signup("Maybe", status="tentative", wow_class="mage", role="dps", minute=1),
        _signup("Slow", status="late", wow_class="druid", role="healer", minute=2),
        _signup("Bench2", status="bench", wow_class="rogue", role="dps", minute=9),
        _signup("Bench1", status="bench", wow_class="hunter", role="dps", minute=3),
    ]
    fields = _fields_by_name(_embed(build_signup_message(_event(), signups, _guild())))
    assert fields["Tanks (0)"] == "—"
    assert fields["Tentative (1)"] == "[MAG] Maybe"
    assert fields["Late (1)"] == "[DRU] Slow"
    assert fields["Bench (2)"] == "[HUN] Bench1, [ROG] Bench2"  # FIFO


def test_full_raid_is_orange() -> None:
    signups = [_signup(f"P{i}", minute=i) for i in range(10)]
    embed = _embed(build_signup_message(_event(raid_key="barrow_deeps", size_cap=10), signups, _guild()))
    assert embed["color"] == COLOR_FULL
    assert embed["title"].startswith("Barrow Deeps — ")


def test_late_holds_a_seat_for_fullness() -> None:
    signups = [_signup("A"), _signup("B", status="late")]
    embed = _embed(build_signup_message(_event(size_cap=2), signups, _guild()))
    assert embed["color"] == COLOR_FULL


def test_cancelled_state() -> None:
    event = _event(status="cancelled", cancel_reason="Server maintenance")
    message = build_signup_message(event, [_signup("Alice")], _guild())
    embed = _embed(message)
    stamp = int(_STARTS.timestamp())
    assert embed["title"] == "CANCELLED — Onyxia — Sat Oct 10"
    assert embed["color"] == COLOR_CANCELLED
    assert embed["description"].startswith(f"~~<t:{stamp}:F>~~\n**Cancelled:** Server maintenance")
    buttons = [c for row in message["components"] for c in row["components"]]
    assert buttons and all(button["disabled"] for button in buttons)


def test_buttons_and_custom_ids() -> None:
    event = _event()
    message = build_signup_message(event, [], _guild())
    rows = message["components"]
    labels = [[c["label"] for c in row["components"]] for row in rows]
    assert labels == [["Sign up", "Tentative", "Late", "Decline"], ["My signup", "Roster"]]
    styles = [c["style"] for c in rows[0]["components"]]
    assert styles == [3, 2, 2, 4]
    for row in rows:
        for button in row["components"]:
            assert len(button["custom_id"]) <= 100
            parsed = raid_custom_id.parse(button["custom_id"])
            assert parsed is not None and parsed.event_id == event.id
            assert button["disabled"] is False


def test_initial_post_pings_only_the_configured_role() -> None:
    message = build_initial_post(_event(), [], _guild(ping_role_id="r9"), ping_role=True)
    assert message["content"] == "<@&r9>"
    assert message["allowed_mentions"] == {"parse": [], "roles": ["r9"]}


def test_repost_and_no_role_never_ping() -> None:
    assert "content" not in build_initial_post(_event(), [], _guild(ping_role_id="r9"), ping_role=False)
    no_role = build_initial_post(_event(), [], _guild(), ping_role=True)
    assert "content" not in no_role
    assert no_role["allowed_mentions"] == {"parse": []}


def test_title_override_and_guild_timezone() -> None:
    event = _event(title="Ony speedrun")
    embed = _embed(build_signup_message(event, [], _guild(timezone="Asia/Tokyo")))
    assert embed["title"] == "Ony speedrun — Sun Oct 11"


def test_escape_name() -> None:
    assert escape_name("a*b_c~d`e|f>g[h]") == r"a\*b\_c\~d\`e\|f\>g\[h\]"
    assert escape_name("x" * 50) == "x" * 31 + "…"
    assert escape_name("  spaced   out ") == "spaced out"


# ---------------------------------------------------------------------------
# Limits and degradation
# ---------------------------------------------------------------------------


def _long_name(i: int) -> str:
    return f"{i:02d}" + "Q" * 30  # 32 chars — Discord's max display name


def test_forty_long_names_one_class_stays_within_limits() -> None:
    signups = [_signup(_long_name(i), wow_class="mage", role="dps", minute=i) for i in range(40)]
    embed = _embed(build_signup_message(_event(), signups, _guild()))
    _assert_within_limits(embed)
    dps = _fields_by_name(embed)["DPS (40)"]
    assert dps.startswith("[MAG] Mage ×40: ")
    assert "more" in dps


def test_forty_markdown_heavy_names_mixed_statuses_stays_within_limits() -> None:
    # '*' doubles in length when escaped — worst case per name.
    statuses = ["confirmed", "tentative", "late", "bench"]
    signups = []
    for i in range(40):
        cls = CLASSES[i % len(CLASSES)]
        signups.append(
            _signup("*" * 32, status=statuses[i % 4], wow_class=cls.key, role=cls.roles[0], minute=i)
        )
    embed = _embed(build_signup_message(_event(notes="n" * 200), signups, _guild()))
    _assert_within_limits(embed)


def test_degradation_caps_names_per_line_with_more_suffix() -> None:
    # 80 worst-case names: capping names per line is enough, so status fields
    # keep showing (fewer) names rather than collapsing to the Roster hint.
    signups = [_signup("_" * 32, wow_class="rogue", role="dps", minute=i) for i in range(20)]
    signups += [
        _signup("*" * 32, status=status, wow_class="mage", role="dps", minute=100 + i)
        for i, status in enumerate(["tentative", "late", "bench"] * 20)
    ]
    embed = _embed(build_signup_message(_event(), signups, _guild()))
    _assert_within_limits(embed)
    fields = _fields_by_name(embed)
    assert fields["DPS (20)"].startswith("[ROG] Rogue ×20: \\_")
    assert fields["DPS (20)"].endswith("more")
    for name in ("Tentative (20)", "Late (20)", "Bench (20)"):
        assert fields[name].startswith("[MAG] \\*")
        assert fields[name].endswith("more")
        assert fields[name] != COLLAPSED_STATUS_TEXT


@pytest.mark.parametrize("count", [1, 10, 25, 40, 120])
def test_any_roster_size_fits(count: int) -> None:
    statuses = ["confirmed", "confirmed", "tentative", "late", "bench", "declined"]
    signups = []
    for i in range(count):
        cls = CLASSES[i % len(CLASSES)]
        signups.append(
            _signup(f"[{i}]" + "|" * 28, status=statuses[i % len(statuses)], wow_class=cls.key, role=cls.roles[-1], minute=i)
        )
    embed = _embed(build_signup_message(_event(notes="x" * 200, title="T" * 200), signups, _guild()))
    _assert_within_limits(embed)
