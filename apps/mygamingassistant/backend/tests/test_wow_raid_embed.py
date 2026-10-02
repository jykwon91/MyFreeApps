"""Unit tests for app.services.wow.raid_embed — pure; Discord limits pinned."""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

import pytest
from platform_shared.services.discord import EMPTY_EMOJIS, EmojiRef, EmojiSet

from app.models.wow.wow_raid_event import WowRaidEvent
from app.models.wow.wow_raid_guild import WowRaidGuild
from app.models.wow.wow_raid_signup import WowRaidSignup
from app.services.wow import raid_custom_id
from app.services.wow.raid_catalog import CLASSES, SPECS
from app.services.wow.raid_details import DESCRIPTION_MAX
from app.services.wow.raid_embed import (
    COLOR_CLOSED,
    COLOR_OPEN,
    EMBED_TOTAL_BUDGET,
    FIELD_VALUE_LIMIT,
    NOBODY_YET,
    build_initial_post,
    build_signup_message,
    column_heading,
    embed_length,
    roster_entry,
)
from app.services.wow.raid_roster import compute_roster_summary, order_numbers
from app.services.wow.raid_text import class_icon, escape_name, seats_label, server_time_label, status_heading

# Sat Oct 10 2026, 20:00 America/New_York
_STARTS = datetime(2026, 10, 11, 0, 0, tzinfo=timezone.utc)
_STAMP = int(_STARTS.timestamp())
_T0 = datetime(2026, 10, 1, 12, 0, tzinfo=timezone.utc)
_EM = " "
_HINT = "ID a1b2c3 · Tap your class to sign up. My sign-up changes your spec."


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
    spec: str | None = None,
    minute: int = 0,
) -> WowRaidSignup:
    return WowRaidSignup(
        event_id=uuid.uuid4(),
        discord_user_id=str(10_000 + minute),
        display_name=name,
        status=status,
        wow_class=wow_class,
        role=role,
        spec=spec,
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
        assert 0 < len(field["name"]) <= 256
    assert len(embed["author"]["name"]) <= 256
    assert len(embed["description"]) <= 4096


def _icons(*logical: str) -> EmojiSet:
    """Uploaded icons as the registry would resolve them (versioned names, snowflake ids)."""
    return EmojiSet({name: EmojiRef(str(1400000000000000000 + i), f"{name}__a1b2c3") for i, name in enumerate(logical)})


_ICON_NAMES = (
    *(cls.key for cls in CLASSES),
    *(spec.icon for spec in SPECS),
    "role_tank",
    "role_healer",
    "role_melee",
    "role_ranged",
    *(f"status_{status}" for status in ("signed", "late", "tentative", "bench", "absence", "queued")),
    *(f"info_{info}" for info in ("date", "time", "signups", "leader", "countdown", "lock", "globe")),
    "ui_gear",
)
_TILE_NAMES = (
    *(f"tile_{char}" for char in "abcdefghijklmnopqrstuvwxyz0123456789"),
    *(f"tile_{name}" for name in ("apos", "dash", "amp", "excl", "qmark", "dot", "colon", "comma", "gap")),
)
_ALL_ICONS = _icons(*_ICON_NAMES)
_WITH_TILES = _icons(*_ICON_NAMES, *_TILE_NAMES)


# ---------------------------------------------------------------------------
# Layout
# ---------------------------------------------------------------------------


def test_empty_raid_shows_when_the_counts_and_every_column_to_tap() -> None:
    message = build_signup_message(_event(), [], _guild(), emojis=EMPTY_EMOJIS)
    embed = _embed(message)
    assert embed["author"] == {"name": "Onyxia's Lair · Leader: Thrall"}
    assert embed["description"].split("\n") == [
        "## Onyxia's Lair",
        f"<t:{_STAMP}:D>{_EM}<t:{_STAMP}:t>{_EM}**0/40** confirmed",
        f"Server time: Sat 8:00 PM EDT{_EM}<t:{_STAMP}:R>",
        f"Tanks **0**{_EM}Melee **0**{_EM}Ranged **0**{_EM}Healers **0**",
    ]
    assert embed["color"] == COLOR_OPEN
    assert embed["footer"] == {"text": _HINT}
    # Nobody has signed up, so the only field names every column a button opens.
    assert embed["fields"] == [
        {
            "name": NOBODY_YET,
            "value": "Tanks · Warrior · Druid · Paladin · Rogue · Hunter · Mage · Warlock · Priest · Shaman",
            "inline": False,
        }
    ]
    assert "title" not in embed
    assert message["allowed_mentions"] == {"parse": []}
    assert "content" not in message


def _mixed_signups() -> list[WowRaidSignup]:
    return [
        _signup("Alice", minute=1),  # a pre-spec warrior tank: Protection, under Tanks
        _signup("Bob", status="tentative", wow_class="mage", role="dps", minute=2),
        _signup("Cleo", status="late", wow_class="priest", role="healer", minute=3),
        _signup("Dan", status="absence", wow_class=None, role=None, minute=4),
        _signup("Eve", status="bench", wow_class="rogue", role="dps", minute=5),
        _signup("Finn", status="queued", wow_class="hunter", role="dps", minute=6),
    ]


def test_description_counts_seats_late_and_the_queue() -> None:
    event = _event(notes="Bring fire resist")
    embed = _embed(build_signup_message(event, _mixed_signups(), _guild(), emojis=EMPTY_EMOJIS))
    lines = embed["description"].split("\n")
    # Late players hold seats, so they count in the headline; the queue doesn't.
    assert lines[1] == f"<t:{_STAMP}:D>{_EM}<t:{_STAMP}:t>{_EM}**2/40** confirmed (1 late) · 1 in queue"
    assert lines[3] == "Bring fire resist"
    assert lines[4] == f"Tanks **1**{_EM}Melee **0**{_EM}Ranged **0**{_EM}Healers **1**"


def test_columns_then_status_lists_then_the_empty_columns() -> None:
    embed = _embed(build_signup_message(_event(), _mixed_signups(), _guild(), emojis=EMPTY_EMOJIS))
    assert [(field["name"], field["inline"]) for field in embed["fields"]] == [
        ("Tanks (1)", True),
        ("Hunter (1)", True),
        ("Priest (1)", True),
        ("Tentative (1)", False),
        ("Bench (1) · backups", False),
        ("Absence (1)", False),
        (NOBODY_YET, False),
    ]
    fields = _fields_by_name(embed)
    assert fields["Tanks (1)"] == "[WAR] `1` **Alice**"
    assert fields["Priest (1)"] == "[PRI] `2` **Cleo** (late)"
    assert fields["Hunter (1)"] == "[HUN] `3` ~~Finn~~ (queued)"  # the queue shares the numbered line
    assert fields["Tentative (1)"] == "[MAG] Bob"
    assert fields["Bench (1) · backups"] == "[ROG] Eve"
    assert fields["Absence (1)"] == "Dan"
    assert fields[NOBODY_YET] == "Warrior · Druid · Paladin · Rogue · Mage · Warlock · Shaman"


def test_tank_specs_share_the_tanks_column_and_other_specs_their_class() -> None:
    signups = [
        _signup("Prot", spec="protection", minute=1),
        _signup("Fury", role="dps", spec="fury", minute=2),
        _signup("Bear", wow_class="druid", spec="feral-tank", minute=3),
        _signup("Holy", wow_class="paladin", role="healer", spec="holy", minute=4),
        _signup("Pala", wow_class="paladin", role="tank", minute=5),  # pre-spec: Protection
    ]
    fields = _fields_by_name(_embed(build_signup_message(_event(), signups, _guild(), emojis=EMPTY_EMOJIS)))
    assert fields["Tanks (3)"] == "[WAR] `1` **Prot**\n[DRU] `3` **Bear**\n[PAL] `5` **Pala**"
    assert fields["Warrior (1)"] == "[WAR] `2` **Fury**"
    assert fields["Paladin (1)"] == "[PAL] `4` **Holy**"


def test_a_sign_up_without_a_class_gets_its_own_column() -> None:
    signups = [_signup("Old", wow_class=None, role=None)]
    fields = _fields_by_name(_embed(build_signup_message(_event(), signups, _guild(), emojis=EMPTY_EMOJIS)))
    assert fields["No class yet (1)"] == "`1` **Old**"


def test_same_signup_time_lists_players_in_order_number_order() -> None:
    bee = _signup("Bee")
    ann = _signup("Ann")
    bee.discord_user_id, ann.discord_user_id = "200", "100"
    fields = _fields_by_name(_embed(build_signup_message(_event(), [bee, ann], _guild(), emojis=EMPTY_EMOJIS)))
    assert fields["Tanks (2)"] == "[WAR] `1` **Ann**\n[WAR] `2` **Bee**"
    assert order_numbers([bee, ann]) == {"100": 1, "200": 2}


def test_names_are_escaped_and_trimmed_on_the_post() -> None:
    signups = [_signup("*Sneaky_Name*Longer", spec="protection")]
    fields = _fields_by_name(_embed(build_signup_message(_event(), signups, _guild(), emojis=EMPTY_EMOJIS)))
    assert fields["Tanks (1)"] == r"[WAR] `1` **\*Sneaky\_Nam…**"


def test_cancelled_state() -> None:
    event = _event(status="cancelled", cancel_reason="Server maintenance")
    message = build_signup_message(event, [_signup("Alice")], _guild(), emojis=EMPTY_EMOJIS)
    embed = _embed(message)
    assert embed["author"]["name"] == "CANCELLED · Onyxia's Lair · Leader: Thrall"
    assert embed["color"] == COLOR_CLOSED
    assert embed["description"].split("\n")[:3] == [
        "## Onyxia's Lair",
        "**Cancelled:** Server maintenance",
        f"~~<t:{_STAMP}:F>~~",
    ]
    assert embed["footer"]["text"] == "ID a1b2c3 · This raid was cancelled."
    assert NOBODY_YET not in _fields_by_name(embed)  # nothing left to sign up for
    buttons = [c for row in message["components"] for c in row["components"]]
    assert buttons and all(button["disabled"] for button in buttons)


def test_closed_sign_ups_grey_the_post_and_lock_all_but_my_sign_up() -> None:
    event = _event(closed_at=_T0)
    message = build_signup_message(event, [_signup("Alice")], _guild(), emojis=EMPTY_EMOJIS)
    embed = _embed(message)
    assert embed["color"] == COLOR_CLOSED
    assert embed["description"].split("\n")[3] == "**Sign-ups are closed.**"
    assert embed["footer"]["text"] == "ID a1b2c3 · Sign-ups are closed."
    assert NOBODY_YET not in _fields_by_name(embed)  # no button to tap, so no legend
    assert "Tanks (1)" in _fields_by_name(embed)  # the roster stays

    disabled = {c["label"]: c["disabled"] for row in message["components"] for c in row["components"]}
    assert disabled.pop("My sign-up") is False  # still shows where you stand
    assert all(disabled.values())

    lines = _embed(build_signup_message(event, [], _guild(), emojis=_ALL_ICONS))["description"].split("\n")
    assert lines[3] == f"{_ALL_ICONS.markup('info_lock')} **Sign-ups are closed.**"


def test_the_post_shows_who_leads_the_banner_link_and_the_color_from_raid_edit() -> None:
    event = _event(
        leader_user_id="u9",
        leader_display_name="Jaina  Proudmoore",
        image_url="https://i.imgur.com/raid.png",
        color=0x3498DB,
    )
    embed = _embed(build_signup_message(event, [], _guild(), emojis=EMPTY_EMOJIS))
    assert embed["author"] == {"name": "Onyxia's Lair · Leader: Jaina Proudmoore"}
    assert embed["image"] == {"url": "https://i.imgur.com/raid.png"}
    assert embed["color"] == 0x3498DB

    # --- handed to someone whose name wasn't captured: no leader rather than the creator
    nameless = _embed(build_signup_message(_event(leader_user_id="u9"), [], _guild(), emojis=EMPTY_EMOJIS))
    assert nameless["author"] == {"name": "Onyxia's Lair"}


def test_closed_or_cancelled_still_greys_a_colored_post() -> None:
    link = "https://i.imgur.com/raid.png"
    closed = _embed(
        build_signup_message(_event(closed_at=_T0, color=0xE74C3C, image_url=link), [], _guild(), emojis=EMPTY_EMOJIS)
    )
    assert closed["color"] == COLOR_CLOSED
    assert closed["image"] == {"url": link}
    cancelled = _embed(
        build_signup_message(
            _event(status="cancelled", color=0xE74C3C, image_url=link), [], _guild(), emojis=EMPTY_EMOJIS
        )
    )
    assert cancelled["color"] == COLOR_CLOSED
    assert "image" not in cancelled  # a cancelled post drops its art


def test_completed_raid_closes_sign_ups() -> None:
    message = build_signup_message(_event(status="completed"), [], _guild(), emojis=EMPTY_EMOJIS)
    embed = _embed(message)
    assert embed["footer"]["text"] == "ID a1b2c3 · Sign-ups are closed."
    assert "fields" not in embed
    assert all(c["disabled"] for row in message["components"] for c in row["components"])


def test_class_buttons_carry_column_counts_then_the_status_row() -> None:
    event = _event()
    message = build_signup_message(event, _mixed_signups(), _guild(), emojis=EMPTY_EMOJIS)
    rows = message["components"]
    labels = [[c["label"] for c in row["components"]] for row in rows]
    assert labels == [
        ["TANK 1", "WAR 0", "DRU 0", "PAL 0", "ROG 0"],
        ["HUN 1", "MAG 0", "WLK 0", "PRI 1", "SHA 0"],
        ["Late", "Tentative", "Bench", "Absence", "My sign-up"],
    ]
    parsed = [[raid_custom_id.parse(c["custom_id"]) for c in row["components"]] for row in rows]
    assert [p.args for p in parsed[0] + parsed[1]] == [
        ("tank",), ("warrior",), ("druid",), ("paladin",), ("rogue",),
        ("hunter",), ("mage",), ("warlock",), ("priest",), ("shaman",),
    ]
    assert {p.action for p in parsed[0] + parsed[1]} == {"cls"}
    assert [(p.action, p.args) for p in parsed[2]] == [
        ("status", ("late",)),
        ("status", ("tentative",)),
        ("status", ("bench",)),
        ("status", ("absence",)),
        ("mine", ()),
    ]
    for row in rows:
        for button in row["components"]:
            assert button["style"] == 2 and button["disabled"] is False
            assert len(button["custom_id"]) <= 100
            assert raid_custom_id.parse(button["custom_id"]).event_id == event.id
            assert "emoji" not in button  # no icons before the first sync


def test_initial_post_pings_only_the_configured_role() -> None:
    message = build_initial_post(_event(), [], _guild(ping_role_id="r9"), ping_role=True, emojis=EMPTY_EMOJIS)
    assert message["content"] == "<@&r9>"
    assert message["allowed_mentions"] == {"parse": [], "roles": ["r9"]}


def test_repost_and_no_role_never_ping() -> None:
    guild = _guild(ping_role_id="r9")
    assert "content" not in build_initial_post(_event(), [], guild, ping_role=False, emojis=EMPTY_EMOJIS)
    no_role = build_initial_post(_event(), [], _guild(), ping_role=True, emojis=EMPTY_EMOJIS)
    assert "content" not in no_role
    assert no_role["allowed_mentions"] == {"parse": []}


def test_title_override_and_guild_timezone() -> None:
    event = _event(title="Ony *speedrun*", created_by_display_name=None)
    embed = _embed(build_signup_message(event, [], _guild(timezone="Asia/Tokyo"), emojis=EMPTY_EMOJIS))
    assert embed["author"]["name"] == "Ony *speedrun*"  # author text isn't markdown
    lines = embed["description"].split("\n")
    assert lines[0] == r"## Ony \*speedrun\*"
    assert lines[2].startswith("Server time: Sun 9:00 AM JST")


def test_names_never_become_headings_lists_or_links() -> None:
    assert escape_name("# Big") == r"\# Big"
    assert escape_name("-# small") == r"\-# small"
    assert escape_name("+ item") == r"\+ item"
    assert escape_name("1. first") == r"1\. first"
    assert escape_name("> quote") == r"\> quote"
    assert escape_name("see https://x.example") == "see https:​//x.example"
    assert escape_name("Mid#dle-name 2.") == "Mid#dle-name 2."  # only a line's start is markdown


def test_helpers() -> None:
    assert escape_name("a*b_c~d`e|f>g[h]") == r"a\*b\_c\~d\`e\|f\>g\[h\]"
    assert escape_name("x" * 50) == "x" * 31 + "…"
    assert escape_name("  spaced   out ") == "spaced out"
    assert server_time_label(_STARTS, "America/New_York") == "Sat 8:00 PM EDT"
    assert server_time_label(_STARTS + timedelta(hours=15), "Europe/London") == "Sun 4:00 PM BST"
    summary = compute_roster_summary(_mixed_signups(), size_cap=40)
    assert seats_label(summary) == "2/40 confirmed (1 late) · 1 in queue"
    assert status_heading("bench", "Bench", 3) == "Bench (3) · backups"
    assert status_heading("tentative", "Tentative", 1) == "Tentative (1)"
    assert column_heading("none", 2, _ALL_ICONS) == "No class yet (2)"
    assert column_heading("tank", 2, EMPTY_EMOJIS) == "Tanks (2)"
    assert column_heading("tank", 2, _ALL_ICONS) == f"{_ALL_ICONS.markup('role_tank')} Tanks (2)"


def test_roster_entry_keeps_the_full_name() -> None:
    late = _signup("A" * 32, status="late", role="dps", spec="fury")
    assert roster_entry(late, 7, EMPTY_EMOJIS) == f"[WAR] `7` **{'A' * 32}** (late)"


# ---------------------------------------------------------------------------
# Icons and letter tiles (Discord application emojis)
# ---------------------------------------------------------------------------


def test_spec_icons_replace_text_tags_once_uploaded() -> None:
    icons = _icons("warrior_fury", "mage", "status_late")
    signups = [
        _signup("Fury", role="dps", spec="fury", minute=1),
        _signup("Frost", wow_class="mage", role="dps", spec="frost", minute=2),  # spec icon missing: class icon
        _signup("Holy", status="late", wow_class="priest", role="healer", spec="holy", minute=3),  # none: the tag
    ]
    fields = _fields_by_name(_embed(build_signup_message(_event(), signups, _guild(), emojis=icons)))
    assert icons.markup("warrior_fury") == "<:warrior_fury__a1b2c3:1400000000000000000>"
    assert fields["Warrior (1)"] == f"{icons.markup('warrior_fury')} `1` **Fury**"
    assert fields[f"{icons.markup('mage')} Mage (1)"] == f"{icons.markup('mage')} `2` **Frost**"
    assert fields["Priest (1)"] == f"[PRI] `3` **Holy** {icons.markup('status_late')}"


def test_class_icon_falls_back_to_tag_and_is_empty_without_a_class() -> None:
    assert class_icon("rogue", EMPTY_EMOJIS) == "[ROG]"
    assert class_icon("rogue", _icons("rogue")) == "<:rogue__a1b2c3:1400000000000000000>"
    assert class_icon(None, _ALL_ICONS) == ""
    assert class_icon("bard", _ALL_ICONS) == ""


def test_buttons_carry_icons_once_uploaded() -> None:
    message = build_signup_message(_event(), [_signup("Alice")], _guild(), emojis=_ALL_ICONS)
    rows = [row["components"] for row in message["components"]]
    names = [[button["emoji"]["name"].split("__")[0] for button in row] for row in rows]
    assert names == [
        ["role_tank", "warrior", "druid", "paladin", "rogue"],
        ["hunter", "mage", "warlock", "priest", "shaman"],
        ["status_late", "status_tentative", "status_bench", "status_absence", "ui_gear"],
    ]
    assert [button["label"] for button in rows[0]] == ["1", "0", "0", "0", "0"]  # the icon names the column
    assert all(button["emoji"]["id"].isdigit() for row in rows for button in row)


def test_icons_label_the_description_headings_and_legend() -> None:
    embed = _embed(build_signup_message(_event(), [_signup("Away", status="absence")], _guild(), emojis=_ALL_ICONS))
    lines = embed["description"].split("\n")
    assert lines[1].startswith(f"{_ALL_ICONS.markup('info_date')} <t:{_STAMP}:D>")
    assert lines[3].startswith(f"{_ALL_ICONS.markup('role_tank')} Tanks **0**")
    fields = _fields_by_name(embed)
    assert fields[f"{_ALL_ICONS.markup('status_absence')} Absence (1)"].endswith(" Away")
    assert fields[NOBODY_YET].startswith(f"{_ALL_ICONS.markup('role_tank')} Tanks · ")


def test_title_is_spelled_in_letter_tiles_once_they_are_all_uploaded() -> None:
    embed = _embed(build_signup_message(_event(), [], _guild(), emojis=_WITH_TILES))
    word_one = "".join(_WITH_TILES.markup(f"tile_{c}") for c in "onyxia") + _WITH_TILES.markup("tile_apos")
    word_one += _WITH_TILES.markup("tile_s")
    word_two = "".join(_WITH_TILES.markup(f"tile_{c}") for c in "lair")
    assert embed["description"].split("\n")[0] == f"{word_one} {_WITH_TILES.markup('tile_gap')} {word_two}"
    # One tile short, or a title too long for tiles: plain text, never half-tiled.
    no_gap = _icons(*_ICON_NAMES, *(name for name in _TILE_NAMES if name != "tile_gap"))
    assert _embed(build_signup_message(_event(), [], _guild(), emojis=no_gap))["description"].startswith("## ")
    long_title = _event(title="Onyxia speedrun night")
    assert _embed(build_signup_message(long_title, [], _guild(), emojis=_WITH_TILES))["description"].startswith(
        "## Onyxia speedrun night"
    )


# ---------------------------------------------------------------------------
# Limits and degradation
# ---------------------------------------------------------------------------


def _long_name(i: int) -> str:
    return f"{i:02d}" + "Q" * 30  # 32 chars — Discord's max display name


def test_forty_long_names_in_one_column_drop_numbers_to_fit_the_field() -> None:
    signups = [_signup(_long_name(i), wow_class="mage", role="dps", minute=i) for i in range(40)]
    embed = _embed(build_signup_message(_event(), signups, _guild(), emojis=EMPTY_EMOJIS))
    _assert_within_limits(embed)
    mage = _fields_by_name(embed)["Mage (40)"]
    assert "`" not in mage and "more" not in mage  # the numbers go first; every name stays
    assert mage.count("\n") == 39


def test_a_column_too_long_for_its_field_gives_up_detail_on_its_own() -> None:
    signups = [_signup(_long_name(i), spec="protection", minute=i) for i in range(40)]
    signups.append(_signup("Solo", wow_class="mage", role="dps", spec="frost", minute=100))
    embed = _embed(build_signup_message(_event(), signups, _guild(), emojis=_ALL_ICONS))
    _assert_within_limits(embed)
    fields = _fields_by_name(embed)
    tanks = fields[f"{_ALL_ICONS.markup('role_tank')} Tanks (40)"]
    # No icons left in the Tanks column, so each line keeps its class tag.
    assert "<:" not in tanks and all(line.startswith("[WAR] **") for line in tanks.split("\n"))
    assert fields[f"{_ALL_ICONS.markup('mage')} Mage (1)"] == f"{_ALL_ICONS.markup('mage_frost')} `41` **Solo**"


def test_a_very_long_list_is_capped_with_more() -> None:
    signups = [_signup("*" * 32, status="bench", wow_class="mage", role="dps", minute=i) for i in range(250)]
    embed = _embed(build_signup_message(_event(), signups, _guild(), emojis=EMPTY_EMOJIS))
    _assert_within_limits(embed)
    bench = _fields_by_name(embed)["Bench (250) · backups"]
    assert bench.startswith(r"[MAG] \*") and bench.endswith(" more")


def test_forty_markdown_heavy_names_mixed_statuses_stays_within_limits() -> None:
    # '*' doubles in length when escaped — worst case per name.
    statuses = ["confirmed", "tentative", "late", "bench", "queued", "absence"]
    signups = []
    for i in range(40):
        cls = CLASSES[i % len(CLASSES)]
        signups.append(
            _signup("*" * 32, status=statuses[i % 6], wow_class=cls.key, role=cls.roles[0], minute=i)
        )
    embed = _embed(build_signup_message(_event(notes="n" * 200), signups, _guild(), emojis=EMPTY_EMOJIS))
    _assert_within_limits(embed)


@pytest.mark.parametrize("count", [1, 10, 25, 40, 120, 400, 1000])
def test_any_roster_size_fits(count: int) -> None:
    statuses = ["confirmed", "confirmed", "tentative", "late", "bench", "queued", "absence"]
    signups = []
    for i in range(count):
        cls = CLASSES[i % len(CLASSES)]
        signups.append(
            _signup(f"[{i}]" + "|" * 28, status=statuses[i % len(statuses)], wow_class=cls.key, role=cls.roles[-1], minute=i)
        )
    event = _event(notes="x" * DESCRIPTION_MAX, title="T" * 200, created_by_display_name="L" * 32)
    embed = _embed(build_signup_message(event, signups, _guild(), emojis=EMPTY_EMOJIS))
    _assert_within_limits(embed)


@pytest.mark.parametrize("count", [40, 120, 400, 1000])
def test_rosters_with_icons_stay_within_limits(count: int) -> None:
    # Each icon is ~45 chars of <:name:id> markup — the degradation ladder must absorb it.
    statuses = ["confirmed", "confirmed", "tentative", "late", "bench", "queued", "absence"]
    signups = []
    for i in range(count):
        cls = CLASSES[i % len(CLASSES)]
        spec = cls.specs[i % len(cls.specs)]
        signups.append(
            _signup(
                "*" * 32,
                status=statuses[i % len(statuses)],
                wow_class=cls.key,
                role=spec.raid_role,
                spec=spec.key,
                minute=i,
            )
        )
    embed = _embed(build_signup_message(_event(notes="x" * DESCRIPTION_MAX), signups, _guild(), emojis=_WITH_TILES))
    _assert_within_limits(embed)
    for field in embed["fields"]:
        # An icon is never cut mid-markup.
        assert field["value"].count("<:") == field["value"].count(":1400000000000")
