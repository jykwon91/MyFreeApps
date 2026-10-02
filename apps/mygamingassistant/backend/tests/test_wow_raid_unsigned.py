"""Unit tests for app.services.wow.raid_unsigned — Raid: Unsigned's rules — and its custom_ids.

Pure: no DB, no Discord.  Who counts as signed up (every status, absence
included) is pinned against the database in ``test_discord_raid_unsigned_flow``.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

import pytest

from app.models.wow.wow_raid_event import WowRaidEvent
from app.models.wow.wow_raid_guild import WowRaidGuild
from app.services.wow import raid_custom_id
from app.services.wow.raid_custom_id import MAX_CUSTOM_ID_LEN, RAIDERS_PICK, UNSIGNED_VERBS, RaidCustomId
from app.services.wow.raid_post_layout import NO_CLASS_COLUMN
from app.services.wow.raid_unsigned import (
    MAX_PING,
    Member,
    Pool,
    by_class,
    expected,
    known_pool,
    picked_roles,
    ping_block,
    ping_ready,
    pool_for,
    unsigned,
)

_GUILD = "800000000000000001"  # the server's id, which is @everyone's role id too
_NOW = datetime(2026, 10, 2, 12, 0, tzinfo=timezone.utc)
_EVENT_ID = uuid.UUID("a1b2c3d4-0000-4000-8000-000000000000")


def _guild(**overrides: object) -> WowRaidGuild:
    fields: dict[str, object] = {"discord_guild_id": _GUILD, "ping_role_id": None, "raider_role_ids": None}
    fields.update(overrides)
    return WowRaidGuild(**fields)


def _event(**overrides: object) -> WowRaidEvent:
    fields: dict[str, object] = {
        "id": _EVENT_ID,
        "raid_key": "onyxia",
        "starts_at": _NOW + timedelta(days=2),
        "status": "scheduled",
        "mention_role_ids": None,
        "raider_role_ids": None,
    }
    fields.update(overrides)
    return WowRaidEvent(**fields)


def _member(user_id: str, *roles: str, name: str | None = None, bot: bool = False, pending: bool = False) -> Member:
    return Member(user_id, name or f"Player{user_id}", frozenset(roles), bot=bot, pending=pending)


# ---------------------------------------------------------------------------
# The pool: the raid's roles, else the server's raider roles, else the roles it pings
# ---------------------------------------------------------------------------


def test_the_pool_is_the_raids_roles_then_the_servers_then_the_ones_it_pings() -> None:
    server = _guild(raider_role_ids=["21", "22"], ping_role_id="31")
    assert pool_for(_event(raider_role_ids=["11"]), server) == Pool(("11",), "raid")
    assert pool_for(_event(), server) == Pool(("21", "22"), "server")
    assert pool_for(_event(mention_role_ids=["41"]), _guild(ping_role_id="31")) == Pool(("41",), "pings")
    assert pool_for(_event(), _guild(ping_role_id="31")) == Pool(("31",), "pings")  # setup's ping role
    # A raid that pings nobody, and a server without a ping role: nothing to check.
    assert pool_for(_event(mention_role_ids=[]), _guild(ping_role_id="31")) == Pool((), None)
    assert pool_for(_event(), _guild()) == Pool((), None)


def test_a_pool_drops_everyone_and_repeats_and_holds_ten_roles() -> None:
    saved = [_GUILD, 12, "12", *(str(n) for n in range(20, 40))]
    assert pool_for(_event(raider_role_ids=saved), _guild()) == Pool(("12", *(str(n) for n in range(20, 29))), "raid")
    # Only @everyone left on the raid or the server: the next source answers.
    assert pool_for(_event(raider_role_ids=[_GUILD]), _guild(raider_role_ids=["21"])) == Pool(("21",), "server")
    assert pool_for(_event(), _guild(raider_role_ids=[_GUILD], ping_role_id="31")) == Pool(("31",), "pings")
    assert pool_for(_event(mention_role_ids=[_GUILD]), _guild()) == Pool((), None)


def test_roles_the_server_no_longer_has_are_left_out() -> None:
    pool = Pool(("1", "2", "3"), "raid")
    assert known_pool(pool, {"3", "1", "9"}) == (Pool(("1", "3"), "raid"), True)
    assert known_pool(pool, {"1", "2", "3"}) == (pool, False)
    assert known_pool(pool, set()) == (Pool((), "raid"), True)


# ---------------------------------------------------------------------------
# Who should sign up, and who hasn't
# ---------------------------------------------------------------------------


def test_expected_members_are_people_past_the_screening_holding_a_pool_role() -> None:
    members = [
        _member("1", "7"),
        _member("2", "8", "9"),
        _member("3", "8"),  # holds none of the pool's roles
        _member("4", "7", bot=True),
        _member("5", "7", pending=True),  # still on the rules screening
        _member("6"),
    ]
    assert [member.user_id for member in expected(members, Pool(("7", "9"), "server"))] == ["1", "2"]
    assert expected(members, Pool((), None)) == []


def test_the_unsigned_are_the_expected_without_a_sign_up() -> None:
    wanted = [_member(str(n), "7") for n in range(1, 6)]
    assert [member.user_id for member in unsigned(wanted, {"2", "4", "99"})] == ["1", "3", "5"]
    assert unsigned(wanted, {member.user_id for member in wanted}) == []


def test_by_class_follows_the_catalog_then_no_class_yet_with_names_ignoring_case() -> None:
    names = {"1": "bob", "2": "Alice", "3": "carl", "4": "Dora", "5": "eve", "6": "Al", "7": "al"}
    members = [_member(user_id, name=name) for user_id, name in names.items()]
    classes = {"1": "mage", "2": "mage", "3": "warrior", "4": "tinker", "6": "priest", "7": "priest"}
    columns = [(column, [member.name for member in group]) for column, group in by_class(members, classes)]
    assert columns == [
        ("warrior", ["carl"]),
        ("mage", ["Alice", "bob"]),
        ("priest", ["Al", "al"]),  # the same name sorts by user id
        (NO_CLASS_COLUMN, ["Dora", "eve"]),  # a class the catalog doesn't know, and none on file
    ]
    assert by_class([], classes) == []


# ---------------------------------------------------------------------------
# [Ping them]
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("overrides", "count", "block"),
    [
        ({}, 1, None),
        ({}, MAX_PING, None),
        ({}, MAX_PING + 1, "too_many"),
        ({}, 0, "nobody"),
        ({"starts_at": _NOW}, 1, "started"),
        ({"starts_at": _NOW - timedelta(hours=3), "status": "completed"}, 1, "started"),
        ({"status": "cancelled"}, 1, "cancelled"),
        ({"closed_at": _NOW}, 1, "closed"),  # the leader closed sign-ups
        ({"signup_deadline_minutes": 48 * 60}, 1, "closed"),  # the deadline, by the clock
        ({"signup_deadline_minutes": 48 * 60, "deadline_applied_at": _NOW}, 1, None),  # reopened since
        ({"closed_at": _NOW}, 0, "closed"),  # the raid's own reason comes first
    ],
)
def test_why_ping_them_is_off(overrides: dict[str, object], count: int, block: str | None) -> None:
    assert ping_block(_event(**overrides), _NOW, count) == block


def test_the_unsigned_ping_waits_five_minutes_on_its_own_slot() -> None:
    assert ping_ready(_event(), _NOW)
    assert not ping_ready(_event(unsigned_pinged_at=_NOW - timedelta(minutes=4, seconds=59)), _NOW)
    assert ping_ready(_event(unsigned_pinged_at=_NOW - timedelta(minutes=5)), _NOW)
    assert ping_ready(_event(last_pinged_at=_NOW), _NOW)  # Raid: Signed's ping doesn't hold it up


def test_picked_roles_are_role_ids_without_everyone_up_to_ten() -> None:
    assert picked_roles(["2", "1", "2"], everyone_id=_GUILD) == (["2", "1"], False)
    assert picked_roles([_GUILD, "3"], everyone_id=_GUILD) == (["3"], True)
    assert picked_roles([_GUILD], everyone_id=_GUILD) == ([], True)
    assert picked_roles(["x1", "", "٣", "4"], everyone_id=_GUILD) == (["4"], False)
    many = [str(n) for n in range(100, 120)]
    assert picked_roles(many, everyone_id=None) == (many[:10], False)
    assert picked_roles([], everyone_id=_GUILD) == ([], False)


# ---------------------------------------------------------------------------
# custom_ids
# ---------------------------------------------------------------------------


def test_the_unsigned_card_its_form_and_the_raiders_menu_round_trip() -> None:
    for verb in UNSIGNED_VERBS:
        custom_id = raid_custom_id.encode("un", _EVENT_ID, verb)
        assert custom_id == f"raid:v1:un:{_EVENT_ID}:{verb}"
        assert raid_custom_id.parse(custom_id) == RaidCustomId("un", _EVENT_ID, (verb,))
    form = raid_custom_id.encode("m", _EVENT_ID, "uping")
    assert raid_custom_id.parse(form) == RaidCustomId("m", _EVENT_ID, ("uping",))
    assert raid_custom_id.encode(RAIDERS_PICK) == "raid:v1:rr"
    assert raid_custom_id.parse("raid:v1:rr") == RaidCustomId("rr", None)
    longest = max((raid_custom_id.encode("un", _EVENT_ID, verb) for verb in UNSIGNED_VERBS), key=len)
    assert len(longest) == 55 <= MAX_CUSTOM_ID_LEN  # [Refresh]


@pytest.mark.parametrize(
    "custom_id",
    [
        f"raid:v1:un:{_EVENT_ID}:ping_all",
        f"raid:v1:un:{_EVENT_ID}",
        f"raid:v1:un:{_EVENT_ID}:open:more",
        "raid:v1:un:not-a-raid:open",
        f"raid:v1:m:{_EVENT_ID}:unsigned",
        "raid:v1:rr:600000000000000001",
    ],
)
def test_malformed_unsigned_ids_are_refused(custom_id: str) -> None:
    assert raid_custom_id.parse(custom_id) is None
