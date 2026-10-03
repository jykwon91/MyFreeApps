"""The raid's web page, pure: raid_web_view, raid_web_text, raid_icon_files, raid_web_service.discord_url.

The page must show what the raid's Discord post shows (built from the same
helpers), and never what the post keeps to Discord: user ids, sign-up notes,
the leader's image link, role and channel ids.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

import pytest

from app.core.config import settings
from app.models.wow.wow_raid_event import WowRaidEvent
from app.models.wow.wow_raid_guild import WowRaidGuild
from app.models.wow.wow_raid_signup import WowRaidSignup
from app.schemas.wow.raid_web import MentionSegment, TextSegment, TimeSegment
from app.services.discord.rest import message_link
from app.services.wow.raid_banners import BANNERS
from app.services.wow.raid_catalog import CLASSES, POST_COLUMNS, SPECS, raid_name
from app.services.wow.raid_embed import COLOR_CLOSED, COLOR_OPEN, STATUS_LISTS
from app.services.wow.raid_icon_files import ICONS, ICONS_VERSION, icon_for_file, icons_version
from app.services.wow.raid_limits import Limits, count_label, role_row
from app.services.wow.raid_post_layout import ROLE_ROW
from app.services.wow.raid_roster import order_numbers
from app.services.wow.raid_web_service import discord_url
from app.services.wow.raid_web_text import description_segments
from app.services.wow.raid_web_view import build_page, page_state

_STARTS = datetime(2026, 10, 11, 0, 0, tzinfo=timezone.utc)
_NOW = datetime(2026, 10, 5, 12, 0, tzinfo=timezone.utc)
_T0 = datetime(2026, 10, 1, 12, 0, tzinfo=timezone.utc)
_LEADER_ID = "423456789012345678"
_CREATOR_ID = "523456789012345678"
_ROLE_ID = "623456789012345678"
_CHANNEL_ID = "723456789012345678"
# The icons the page's header and markers use besides the ones the page names.
_PAGE_ICONS = (
    "status_late",
    "status_queued",
    *(f"info_{name}" for name in ("date", "time", "leader", "signups", "lock", "countdown")),
)


@pytest.fixture(autouse=True)
def _api_root(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "backend_root_path", "/api")


def _event(**overrides: object) -> WowRaidEvent:
    fields: dict[str, object] = {
        "id": uuid.uuid4(),
        "web_id": uuid.uuid4(),
        "guild_id": uuid.uuid4(),
        "raid_key": "onyxia",
        "starts_at": _STARTS,
        "size_cap": 40,
        "status": "scheduled",
        "channel_id": _CHANNEL_ID,
        "message_id": "910000000000000001",
        "created_by_user_id": _CREATOR_ID,
        "created_by_display_name": "Thrall",
    }
    fields.update(overrides)
    return WowRaidEvent(**fields)


def _signup(
    name: str,
    *,
    status: str = "confirmed",
    wow_class: str | None = "warrior",
    role: str | None = "dps",
    spec: str | None = "fury",
    minute: int = 0,
    note: str | None = None,
    character: str | None = None,
) -> WowRaidSignup:
    return WowRaidSignup(
        id=uuid.uuid4(),
        event_id=uuid.uuid4(),
        discord_user_id=str(300000000000000000 + minute),
        display_name=name,
        character_name=character,
        note=note,
        status=status,
        wow_class=wow_class,
        role=role,
        spec=spec,
        signed_up_at=_T0 + timedelta(minutes=minute),
        updated_at=_T0,
    )


def _roster() -> list[WowRaidSignup]:
    return [
        _signup("Garrosh", wow_class="warrior", role="tank", spec="protection", minute=0),
        _signup("Varian", minute=1, note="secret note", character="Lo'Gosh"),
        _signup("Anduin", wow_class="priest", role="healer", spec="holy", status="late", minute=2),
        _signup("Jaina", wow_class="mage", spec="frost", status="queued", minute=3),
        _signup("Valeera", wow_class="rogue", spec="combat", status="tentative", minute=4),
        _signup("Rexxar", wow_class="hunter", spec="marksmanship", status="bench", minute=5),
        _signup("Malfurion", wow_class="druid", role="healer", spec="restoration", status="absence", minute=6),
        _signup("Newbie", wow_class=None, role=None, spec=None, minute=7),
        _signup("Thrall", wow_class="shaman", role="dps", spec=None, minute=8),  # pre-spec: its default
    ]


# ---------------------------------------------------------------------------
# What the post shows
# ---------------------------------------------------------------------------


def test_the_columns_are_the_posts_in_line_order() -> None:
    signups = _roster()
    page = build_page(_event(), signups, discord_url=None, now=_NOW)
    numbers = order_numbers(signups)
    in_line = {"tank", "warrior", "priest", "shaman", "mage"}
    assert [column.key for column in page.columns] == [c for c in POST_COLUMNS if c in in_line] + ["none"]
    by_key = {column.key: column for column in page.columns}
    assert (by_key["tank"].label, by_key["tank"].icon) == ("Tanks", "role_tank")
    assert (by_key["warrior"].label, by_key["warrior"].icon) == ("Warrior", "warrior")
    assert (by_key["none"].label, by_key["none"].icon) == ("No class yet", None)
    for column in page.columns:
        assert column.count == len(column.entries)
        for entry in column.entries:
            signup = next(s for s in signups if s.id == entry.id)
            assert entry.number == numbers[signup.discord_user_id]

    varian = by_key["warrior"].entries[0]
    assert (varian.name, varian.spec, varian.icon) == ("Lo'Gosh", "Fury Warrior", "warrior_fury")
    assert (varian.role_group, varian.late, varian.queued) == ("melee", False, False)
    anduin = by_key["priest"].entries[0]
    assert (anduin.late, anduin.queued, anduin.icon) == (True, False, "priest_holy")
    jaina = by_key["mage"].entries[0]
    assert (jaina.queued, jaina.role_group) == (True, "ranged")
    thrall = by_key["shaman"].entries[0]
    assert (thrall.spec, thrall.icon) == ("Enhancement Shaman", "shaman_enhancement")
    newbie = by_key["none"].entries[0]
    assert (newbie.wow_class, newbie.spec, newbie.icon, newbie.role_group) == (None, None, None, None)


def test_the_lists_are_tentative_bench_and_absence_without_numbers() -> None:
    page = build_page(_event(), _roster(), discord_url=None, now=_NOW)
    assert [(lst.status, lst.label, lst.icon) for lst in page.lists] == list(STATUS_LISTS)
    assert [[entry.name for entry in lst.entries] for lst in page.lists] == [["Valeera"], ["Rexxar"], ["Malfurion"]]
    assert all(entry.number is None for lst in page.lists for entry in lst.entries)


def test_an_empty_raid_has_no_columns_or_lists() -> None:
    page = build_page(_event(), [], discord_url=None, now=_NOW)
    assert (page.columns, page.lists, page.seats_taken) == ([], [], 0)
    assert [(role.role, role.count, role.limit) for role in page.roles] == [
        ("tank", 0, None),
        ("melee", 0, None),
        ("ranged", 0, None),
        ("healer", 0, None),
    ]


@pytest.mark.parametrize(
    ("role_limits", "class_limits"),
    [(None, None), ({"tank": 2, "healer": 1}, {"warrior": 3, "mage": 1})],
)
def test_the_role_row_and_limits_match_the_post(role_limits: dict | None, class_limits: dict | None) -> None:
    event = _event(role_limits=role_limits, class_limits=class_limits)
    signups = _roster()
    page = build_page(event, signups, discord_url=None, now=_NOW)
    row = role_row(signups, Limits.of(event))
    assert [(role.role, role.label, role.icon) for role in page.roles] == list(ROLE_ROW)
    assert {role.role: count_label(role.count, role.limit) for role in page.roles} == row
    limits = Limits.of(event)
    assert all(column.limit == limits.for_column(column.key) for column in page.columns)


def test_the_counts_are_the_posts() -> None:
    page = build_page(_event(size_cap=40), _roster(), discord_url=None, now=_NOW)
    # Confirmed: Garrosh, Varian, Newbie, Thrall; late: Anduin; queued: Jaina.
    assert (page.size_cap, page.seats_taken, page.late, page.queued) == (40, 5, 1, 1)


def test_the_header_is_the_posts() -> None:
    event = _event(title=None, leader_user_id=_LEADER_ID, leader_display_name="Sylvanas", color=0x112233)
    page = build_page(event, [], discord_url="https://discord.com/channels/1/2/3", now=_NOW)
    assert (page.title, page.raid_name, page.leader_name) == (raid_name("onyxia"), raid_name("onyxia"), "Sylvanas")
    assert (page.web_id, page.starts_at, page.color) == (event.web_id, _STARTS, "#112233")
    assert page.discord_url == "https://discord.com/channels/1/2/3"
    assert page.icons_version == ICONS_VERSION
    assert build_page(_event(title="Ony 10s"), [], discord_url=None, now=_NOW).title == "Ony 10s"
    assert build_page(_event(), [], discord_url=None, now=_NOW).color == f"#{COLOR_OPEN:06x}"


# ---------------------------------------------------------------------------
# State
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("overrides", "state"),
    [
        ({}, "open"),
        ({"closed_at": _NOW}, "closed"),
        ({"signup_deadline_minutes": 60 * 24 * 7}, "closed"),  # due, the sweep not there yet
        ({"signup_deadline_minutes": 60, "deadline_applied_at": _NOW, "closed_at": _NOW}, "closed"),
        ({"start_applied_at": _NOW}, "started"),
        ({"starts_at": _NOW - timedelta(minutes=1)}, "started"),  # started, the sweep not there yet
        ({"status": "completed", "start_applied_at": _NOW}, "completed"),
        ({"status": "cancelled", "cancel_reason": "Server down"}, "cancelled"),
        ({"status": "cancelled", "closed_at": _NOW, "start_applied_at": _NOW}, "cancelled"),
    ],
)
def test_the_state_reads_the_clock_like_the_buttons(overrides: dict, state: str) -> None:
    event = _event(**overrides)
    page = build_page(event, [], discord_url=None, now=_NOW)
    assert page_state(event, _NOW) == state == page.state
    if state != "open":
        assert (page.color, page.closes_at) == (f"#{COLOR_CLOSED:06x}", None)


def test_an_open_raid_says_when_sign_ups_close() -> None:
    page = build_page(_event(signup_deadline_minutes=60), [], discord_url=None, now=_NOW)
    assert (page.state, page.closes_at) == ("open", _STARTS - timedelta(minutes=60))
    assert build_page(_event(), [], discord_url=None, now=_NOW).closes_at is None


def test_only_a_cancelled_raid_shows_its_reason_and_drops_its_banner() -> None:
    cancelled = build_page(_event(status="cancelled", cancel_reason="Server down"), [], discord_url=None, now=_NOW)
    assert (cancelled.cancel_reason, cancelled.banner_url) == ("Server down", None)
    open_page = build_page(_event(cancel_reason="stale"), [], discord_url=None, now=_NOW)
    assert open_page.cancel_reason is None


# ---------------------------------------------------------------------------
# Never on the page
# ---------------------------------------------------------------------------


def test_the_banner_is_the_raids_own_art_on_this_site_never_the_leaders_link() -> None:
    event = _event(image_url="https://tracker.example/pixel.png")
    page = build_page(event, [], discord_url=None, now=_NOW)
    banner = BANNERS["onyxia"]
    assert page.banner_url == f"/api/discord/raid-banners/onyxia.png?v={banner.version}"
    assert "tracker.example" not in page.model_dump_json()


def test_the_page_carries_no_ids_notes_or_leader_links() -> None:
    event = _event(
        leader_user_id=_LEADER_ID,
        leader_display_name="Sylvanas",
        image_url="https://tracker.example/pixel.png",
        mention_role_ids=[_ROLE_ID],
        raider_role_ids=[_ROLE_ID],
        signup_role_ids=[_ROLE_ID],
        banned_role_ids=[_ROLE_ID],
        voice_channel_id=_CHANNEL_ID,
        notes=f"Bring FR <@{_LEADER_ID}> <@!{_CREATOR_ID}> <@&{_ROLE_ID}> <#{_CHANNEL_ID}> <:pepe:{_ROLE_ID}>",
    )
    signups = _roster()
    dumped = build_page(event, signups, discord_url=None, now=_NOW).model_dump_json()
    secrets = [_LEADER_ID, _CREATOR_ID, _ROLE_ID, _CHANNEL_ID, "secret note", "tracker.example", str(event.id)]
    secrets += [event.id.hex, str(event.guild_id), *(signup.discord_user_id for signup in signups)]
    assert [secret for secret in secrets if secret in dumped] == []
    assert '"@member"' in dumped and '"@role"' in dumped and '"#channel"' in dumped


# ---------------------------------------------------------------------------
# The description
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("text", "segments"),
    [
        (None, []),
        ("", []),
        ("Bring FR", [TextSegment(text="Bring FR")]),
        (
            "Pull <t:1760140800:R>!",
            [TextSegment(text="Pull "), TimeSegment(unix=1760140800, style="R"), TextSegment(text="!")],
        ),
        ("<t:1760140800>", [TimeSegment(unix=1760140800, style="f")]),
        ("<t:1:t><t:2:T>", [TimeSegment(unix=1, style="t"), TimeSegment(unix=2, style="T")]),
        ("<@123>", [MentionSegment(text="@member")]),
        ("<@!123>", [MentionSegment(text="@member")]),
        ("<@&123>", [MentionSegment(text="@role")]),
        ("<#123>", [MentionSegment(text="#channel")]),
        ("hi <:pepe:123> and <a:dance:456>!", [TextSegment(text="hi :pepe: and :dance:!")]),
        ("<t:abc> <t:1:X> <@x> <#>", [TextSegment(text="<t:abc> <t:1:X> <@x> <#>")]),
        (
            "**Bring** <@1> and <@&2>",
            [
                TextSegment(text="**Bring** "),
                MentionSegment(text="@member"),
                TextSegment(text=" and "),
                MentionSegment(text="@role"),
            ],
        ),
    ],
)
def test_the_description_becomes_segments(text: str | None, segments: list) -> None:
    assert description_segments(text) == segments


# ---------------------------------------------------------------------------
# Icons and the post's link
# ---------------------------------------------------------------------------


def test_every_icon_the_page_shows_has_a_file() -> None:
    names = {cls.key for cls in CLASSES} | {spec.icon for spec in SPECS}
    names |= {icon for _, _, icon in ROLE_ROW} | {icon for _, _, icon in STATUS_LISTS} | set(_PAGE_ICONS)
    assert sorted(name for name in names if icon_for_file(f"{name}.png") is None) == []


def test_the_icons_version_changes_with_the_art() -> None:
    assert ICONS_VERSION == icons_version(ICONS)
    assert len(ICONS_VERSION) == 8
    assert icons_version({"a": b"1"}) != icons_version({"a": b"2"})
    assert icons_version({"a": b"1"}) != icons_version({"b": b"1"})


def test_the_discord_link_is_the_post_while_there_is_one() -> None:
    guild = WowRaidGuild(id=uuid.uuid4(), discord_guild_id="800000000000000001", raid_channel_id=_CHANNEL_ID)
    event = _event()
    assert discord_url(event, guild) == message_link("800000000000000001", _CHANNEL_ID, "910000000000000001")
    assert discord_url(event, None) is None
    assert discord_url(_event(message_id=None), guild) is None
    assert discord_url(_event(post_deleted_at=_NOW), guild) is None
