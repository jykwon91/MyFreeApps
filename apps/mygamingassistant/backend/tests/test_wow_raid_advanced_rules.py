"""Unit tests for app.services.wow.raid_advanced — Raid: Edit → Advanced's rules (pure).

Every setting reads raid → server → built-in; who may join, the minimum's
shortfall, the Minimum form's parse, the Ready check menu's values, what the
notification scheduler reads, the post's "Open to" line — and that the post
still fits with ten allowed roles on a full raid.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

import pytest
from platform_shared.services.discord import EMPTY_EMOJIS, EmojiRef, EmojiSet

from app.models.wow.wow_raid_event import WowRaidEvent
from app.models.wow.wow_raid_guild import WowRaidGuild
from app.models.wow.wow_raid_signup import WowRaidSignup
from app.repositories.wow.wow_raid_notification_repo import _build_schedule_rows
from app.services.discord import raid_advanced_copy
from app.services.wow import raid_advanced
from app.services.wow.raid_advanced import (
    INHERIT,
    READY_CHECK_DEFAULT,
    READY_CHOICES,
    AccessRefusal,
    Effective,
    MinimumProblem,
    Shortfall,
)
from app.services.wow.raid_catalog import CLASSES, SPECS
from app.services.wow.raid_details import DESCRIPTION_MAX
from app.services.wow.raid_embed import EMBED_TOTAL_BUDGET, build_signup_message, embed_length
from app.services.wow.raid_roles import MAX_ROLES, picked_roles, stored_roles

_GUILD_ID = "800000000000000001"
_STARTS = datetime(2026, 10, 11, 0, 0, tzinfo=timezone.utc)
# Ten roles with snowflake-long ids: the most a list holds.
_TEN_ROLES = [str(1_300_000_000_000_000_000 + i) for i in range(MAX_ROLES)]


def _guild(**overrides: object) -> WowRaidGuild:
    fields: dict[str, object] = {
        "id": uuid.uuid4(),
        "discord_guild_id": _GUILD_ID,
        "raid_channel_id": "c1",
        "ping_role_id": None,
        "timezone": "America/New_York",
        "settings": None,
        "signup_role_ids": None,
        "banned_role_ids": None,
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
        "min_signups": None,
        "signup_role_ids": None,
        "banned_role_ids": None,
        "ready_check_minutes": None,
    }
    fields.update(overrides)
    return WowRaidEvent(**fields)


# ---------------------------------------------------------------------------
# Raid → server → built-in
# ---------------------------------------------------------------------------


def test_resolve_takes_the_raid_then_the_server_then_the_built_in() -> None:
    assert raid_advanced.resolve(15, 30, 60) == Effective(15, "raid")
    assert raid_advanced.resolve(None, 30, 60) == Effective(30, "server")
    assert raid_advanced.resolve(None, None, 60) == Effective(60, "built_in")
    # Any value is the raid's own — "off" and "everyone" included.
    assert raid_advanced.resolve(0, 30, 60) == Effective(0, "raid")
    assert raid_advanced.resolve((), ("601",), ()) == Effective((), "raid")


def test_a_null_list_follows_the_server_and_an_empty_one_is_the_raids_own() -> None:
    guild = _guild(signup_role_ids=["601"], banned_role_ids=["603"])
    assert raid_advanced.signup_roles(_event(), guild) == Effective(("601",), "server")
    assert raid_advanced.banned_roles(_event(), guild) == Effective(("603",), "server")
    # [] — everyone may join / nobody is kept out, whatever the server says.
    own_empty = _event(signup_role_ids=[], banned_role_ids=[])
    assert raid_advanced.signup_roles(own_empty, guild) == Effective((), "raid")
    assert raid_advanced.banned_roles(own_empty, guild) == Effective((), "raid")
    own = _event(signup_role_ids=["602"], banned_role_ids=["604"])
    assert raid_advanced.signup_roles(own, guild) == Effective(("602",), "raid")
    assert raid_advanced.banned_roles(own, guild) == Effective(("604",), "raid")
    # Neither sets one: the built-in — everyone, nobody.
    assert raid_advanced.signup_roles(_event(), _guild()) == Effective((), "built_in")
    assert raid_advanced.banned_roles(_event(), _guild()) == Effective((), "built_in")


def test_own_and_server_lists_are_empty_while_unset() -> None:
    guild = _guild(signup_role_ids=["601"])
    assert raid_advanced.own_roles(_event(), guild, "signup") == ()
    assert raid_advanced.own_roles(_event(banned_role_ids=["603"]), guild, "banned") == ("603",)
    assert raid_advanced.server_roles(guild, "signup") == ("601",)
    assert raid_advanced.server_roles(guild, "banned") == ()


def test_role_lists_are_cleaned_when_picked_and_when_read() -> None:
    # A role menu: junk, repeats and @everyone dropped (said), at most ten kept.
    assert picked_roles(["601", "junk", "601", _GUILD_ID, "", "６０２", "602"], everyone_id=_GUILD_ID) == (
        ["601", "602"],
        True,
    )
    assert picked_roles([*_TEN_ROLES, "699"], everyone_id=_GUILD_ID) == (_TEN_ROLES, False)
    # A stored list: strings, no @everyone, no repeats, the first ten.
    assert stored_roles(["601", 602, _GUILD_ID, "601"], _GUILD_ID) == ("601", "602")
    stored = _event(signup_role_ids=[_GUILD_ID, *_TEN_ROLES, "699"])
    assert raid_advanced.signup_roles(stored, _guild()).value == tuple(_TEN_ROLES)


# ---------------------------------------------------------------------------
# Who can sign up
# ---------------------------------------------------------------------------


def test_anyone_may_join_without_lists() -> None:
    assert raid_advanced.access_refusal(_event(), _guild(), []) is None
    assert raid_advanced.access_refusal(_event(), _guild(), ["699"]) is None
    # The raid's own empty lists open it, whatever the server keeps out.
    guild = _guild(signup_role_ids=["601"], banned_role_ids=["699"])
    assert raid_advanced.access_refusal(_event(signup_role_ids=[], banned_role_ids=[]), guild, ["699"]) is None


def test_an_allowed_list_lets_in_only_its_roles() -> None:
    event = _event(signup_role_ids=["601", "602"])
    assert raid_advanced.access_refusal(event, _guild(), ["699", "602"]) is None
    assert raid_advanced.access_refusal(event, _guild(), ["699"]) == AccessRefusal("not_allowed", ("601", "602"))
    assert raid_advanced.access_refusal(event, _guild(), []) == AccessRefusal("not_allowed", ("601", "602"))
    # The server's list, on a raid that follows it.
    assert raid_advanced.access_refusal(_event(), _guild(signup_role_ids=["601"]), ["699"]) == AccessRefusal(
        "not_allowed", ("601",)
    )


def test_a_banned_role_keeps_a_member_out_even_with_an_allowed_one() -> None:
    event = _event(signup_role_ids=["601"], banned_role_ids=["603", "604"])
    assert raid_advanced.access_refusal(event, _guild(), ["601", "604"]) == AccessRefusal("banned", ("604",))
    assert raid_advanced.access_refusal(_event(banned_role_ids=["603"]), _guild(), ["603"]) == AccessRefusal(
        "banned", ("603",)
    )
    assert raid_advanced.access_refusal(_event(banned_role_ids=["603"]), _guild(), ["601"]) is None


# ---------------------------------------------------------------------------
# Minimum sign-ups
# ---------------------------------------------------------------------------


def test_the_minimum_needs_at_most_the_raids_seats() -> None:
    assert raid_advanced.needed(_event()) is None
    assert raid_advanced.shortfall(_event(), 0) is None
    ten = _event(min_signups=10)
    assert raid_advanced.needed(ten) == 10
    assert raid_advanced.shortfall(ten, 9) == Shortfall(9, 10)
    assert raid_advanced.shortfall(ten, 10) is None
    # The raid made smaller than its minimum: every seat is enough.
    shrunk = _event(min_signups=10, size_cap=8)
    assert raid_advanced.needed(shrunk) == 8
    assert raid_advanced.shortfall(shrunk, 7) == Shortfall(7, 8)
    assert raid_advanced.shortfall(shrunk, 8) is None
    assert raid_advanced.short_reason(Shortfall(3, 10)) == "Not enough sign-ups: 3 of 10 needed."


@pytest.mark.parametrize(
    ("text", "size_cap", "parsed"),
    [
        ("", 40, None),
        ("   ", 40, None),
        ("1", 40, 1),
        ("40", 40, 40),
        (" 7 ", 40, 7),
        ("8", 8, 8),
        ("0", 40, MinimumProblem("zero", 40)),
        ("00", 40, MinimumProblem("zero", 40)),
        ("41", 40, MinimumProblem("too_big", 40)),
        ("9", 8, MinimumProblem("too_big", 8)),
        ("x", 40, MinimumProblem("number", 40)),
        ("-3", 40, MinimumProblem("number", 40)),
        ("1.5", 40, MinimumProblem("number", 40)),
        ("٣", 40, MinimumProblem("number", 40)),
    ],
)
def test_the_minimum_form_reads_a_whole_number_up_to_the_raids_size(
    text: str, size_cap: int, parsed: int | MinimumProblem | None
) -> None:
    assert raid_advanced.parse_minimum(text, size_cap) == parsed


# ---------------------------------------------------------------------------
# Ready check
# ---------------------------------------------------------------------------


def test_a_ready_check_menu_value_is_a_time_or_the_server_default() -> None:
    assert [raid_advanced.ready_choice(str(minutes), raid=True) for minutes in READY_CHOICES] == list(READY_CHOICES)
    assert raid_advanced.ready_choice(INHERIT, raid=True) == INHERIT
    # The server's own menu has no server default to follow.
    assert raid_advanced.ready_choice(INHERIT, raid=False) is None
    for stale in ("5", "1440", "abc", "", " 15"):
        assert raid_advanced.ready_choice(stale, raid=True) is None


def test_the_scheduler_reads_the_raids_ready_check_over_the_servers() -> None:
    settings = {"nudge_offsets_minutes": [1440], "ready_check_minutes": 30}
    guild = _guild(settings=settings)
    assert raid_advanced.notification_settings(_event(), guild) == settings
    assert raid_advanced.notification_settings(_event(ready_check_minutes=15), guild) == {
        "nudge_offsets_minutes": [1440],
        "ready_check_minutes": 15,
    }
    assert raid_advanced.notification_settings(_event(), _guild()) == {"ready_check_minutes": READY_CHECK_DEFAULT}
    assert raid_advanced.server_ready_check(guild) == 30
    assert raid_advanced.ready_check(_event(), guild) == Effective(30, "server")
    assert raid_advanced.ready_check(_event(), _guild()) == Effective(READY_CHECK_DEFAULT, "built_in")


def test_a_raid_with_its_ready_check_off_schedules_none() -> None:
    server_30 = _guild(settings={"ready_check_minutes": 30})
    off = raid_advanced.notification_settings(_event(ready_check_minutes=0), server_30)
    assert off["ready_check_minutes"] == 0
    kinds = [row["kind"] for row in _build_schedule_rows(uuid.uuid4(), _STARTS, off)]
    assert "ready_check" not in kinds and "consumables_reminder" in kinds
    moved = raid_advanced.notification_settings(_event(ready_check_minutes=90), _guild())
    [ready] = [row for row in _build_schedule_rows(uuid.uuid4(), _STARTS, moved) if row["kind"] == "ready_check"]
    assert ready["due_at"] == _STARTS - timedelta(minutes=90)


# ---------------------------------------------------------------------------
# The post
# ---------------------------------------------------------------------------


def test_the_post_says_who_its_open_to() -> None:
    assert raid_advanced.post_lines(_event(), _guild()) == []
    assert raid_advanced.post_lines(_event(), _guild(signup_role_ids=["601", "602"])) == [
        "Open to: <@&601> <@&602>"
    ]
    # Banned roles aren't shown; the raid's own "everyone" hides the server's list.
    assert raid_advanced.post_lines(_event(banned_role_ids=["603"]), _guild()) == []
    assert raid_advanced.post_lines(_event(signup_role_ids=[]), _guild(signup_role_ids=["601"])) == []


def _signup(index: int) -> WowRaidSignup:
    cls = CLASSES[index % len(CLASSES)]
    spec = cls.specs[index % len(cls.specs)]
    return WowRaidSignup(
        event_id=uuid.uuid4(),
        discord_user_id=str(10_000 + index),
        display_name="*" * 32,
        status=("confirmed", "late", "tentative", "bench")[index % 4],
        wow_class=cls.key,
        role=spec.raid_role,
        spec=spec.key,
        signed_up_at=_STARTS - timedelta(days=1) + timedelta(minutes=index),
        updated_at=_STARTS,
    )


def _icons() -> EmojiSet:
    names = (*(cls.key for cls in CLASSES), *(spec.icon for spec in SPECS), "role_tank", "role_healer")
    names += ("role_melee", "role_ranged", "info_date", "info_time", "info_signups", "info_leader")
    names += ("info_countdown", "info_lock", "info_globe", "ui_gear")
    return EmojiSet({name: EmojiRef(str(1400000000000000000 + i), f"{name}__a1b2c3") for i, name in enumerate(names)})


@pytest.mark.parametrize("icons", [False, True])
def test_a_full_raid_open_to_ten_roles_still_fits(icons: bool) -> None:
    event = _event(
        signup_role_ids=_TEN_ROLES,
        notes="x" * DESCRIPTION_MAX,
        title="T" * 200,
        created_by_display_name="L" * 32,
        min_signups=40,
        ready_check_minutes=180,
    )
    emojis = EMPTY_EMOJIS
    if icons:
        emojis = _icons()
    embed = build_signup_message(event, [_signup(i) for i in range(40)], _guild(), emojis=emojis)["embeds"][0]
    assert embed_length(embed) <= EMBED_TOTAL_BUDGET
    assert len(embed["description"]) <= 4096
    assert "Open to: " + " ".join(f"<@&{role}>" for role in _TEN_ROLES) in embed["description"]


# ---------------------------------------------------------------------------
# The cards' menus: every value in words fits an option's description
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("minimum", [None, 1, 40])
@pytest.mark.parametrize("roles", [None, [], _TEN_ROLES])
@pytest.mark.parametrize("ready", [None, 0, 45, 180])
def test_every_summary_fits_a_menu_option(minimum: int | None, roles: list[str] | None, ready: int | None) -> None:
    guild = _guild(signup_role_ids=_TEN_ROLES, banned_role_ids=_TEN_ROLES, settings={"ready_check_minutes": 90})
    event = _event(
        size_cap=10, min_signups=minimum, signup_role_ids=roles, banned_role_ids=roles, ready_check_minutes=ready
    )
    for summaries in (raid_advanced_copy.summaries(event, guild), raid_advanced_copy.server_summaries(guild)):
        for key, summary in summaries:
            assert 0 < len(summary) <= 100, summary
            assert len(raid_advanced_copy.LABELS[key]) <= 100
