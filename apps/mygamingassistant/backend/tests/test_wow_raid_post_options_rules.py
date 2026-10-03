"""Unit tests for Raid: Edit → Advanced's post options — pin the post, its voice channel, delete it (pure).

``app.services.wow.raid_advanced``'s rules — the pin read raid → server →
off, what the post's pin needs as the raid moves on (only the bot's own pin
undone), the voice channel the post links (a raid's "none" over the
server's), the menus' values — and ``raid_post_options_copy``'s words for
them: the delays, the notices, why a pin didn't go through, the detail line.
A full raid still fits with ten allowed roles and a voice channel.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

import pytest
from platform_shared.services.discord import EMPTY_EMOJIS, EmojiRef, EmojiSet

from app.models.wow.wow_raid_event import WowRaidEvent
from app.models.wow.wow_raid_guild import WowRaidGuild
from app.models.wow.wow_raid_signup import WowRaidSignup
from app.services.discord import raid_advanced_copy, raid_post_options_copy
from app.services.wow import raid_advanced
from app.services.wow.raid_advanced import DELETE_CHOICES, KEEP, NO_VOICE, Effective, PinResult
from app.services.wow.raid_catalog import CLASSES, SPECS
from app.services.wow.raid_details import DESCRIPTION_MAX
from app.services.wow.raid_embed import EMBED_TOTAL_BUDGET, build_signup_message, embed_length
from app.services.wow.raid_roles import MAX_ROLES

_STARTS = datetime(2026, 10, 11, 0, 0, tzinfo=timezone.utc)
_POST = "710000000000000001"
_REPOSTED = "710000000000000002"
_VOICE = "710000000000000009"
# The longest channel id: 20 digits.
_LONG_VOICE = str(10**19 + 9)
_CHANNEL = "700000000000000001"
_TEN_ROLES = [str(1_300_000_000_000_000_000 + i) for i in range(MAX_ROLES)]
_RETRY = "I'll try again the next time the post updates"
# The Delete the post menu's delays, in words.
_DELAYS = [(3, "3 hours"), (6, "6 hours"), (12, "12 hours"), (24, "1 day"), (48, "2 days"), (168, "1 week")]


def _guild(**overrides: object) -> WowRaidGuild:
    fields: dict[str, object] = {
        "id": uuid.uuid4(),
        "discord_guild_id": "800000000000000001",
        "raid_channel_id": "c1",
        "ping_role_id": None,
        "timezone": "America/New_York",
        "settings": None,
        "signup_role_ids": None,
        "banned_role_ids": None,
        "pin_posts": False,
        "voice_channel_id": None,
    }
    fields.update(overrides)
    return WowRaidGuild(**fields)


def _event(**overrides: object) -> WowRaidEvent:
    """A posted raid still to start, its post options following the server."""
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
        "message_id": _POST,
        "start_applied_at": None,
        "pin_post": None,
        "pinned_message_id": None,
        "voice_channel_id": None,
        "delete_post_after_hours": None,
    }
    fields.update(overrides)
    return WowRaidEvent(**fields)


# ---------------------------------------------------------------------------
# Pin the post
# ---------------------------------------------------------------------------


def test_the_pin_reads_the_raid_then_the_server_then_off() -> None:
    assert raid_advanced.pin_setting(_event(), _guild()) == Effective(False, "server")
    assert raid_advanced.pin_setting(_event(), _guild(pin_posts=True)) == Effective(True, "server")
    assert raid_advanced.pin_setting(_event(), _guild(pin_posts=None)) == Effective(False, "built_in")
    assert raid_advanced.pin_setting(_event(pin_post=False), _guild(pin_posts=True)) == Effective(False, "raid")
    assert raid_advanced.pin_setting(_event(pin_post=True), _guild()) == Effective(True, "raid")


@pytest.mark.parametrize(
    ("overrides", "step"),
    [
        ({}, None),
        ({"pin_post": True}, "pin"),
        ({"pin_post": True, "status": "draft", "message_id": None}, None),
        ({"pin_post": True, "message_id": None}, None),
        ({"pin_post": True, "pinned_message_id": _POST}, None),
        ({"pinned_message_id": _POST}, "unpin"),
        ({"pin_post": True, "pinned_message_id": _POST, "start_applied_at": _STARTS}, "unpin"),
        ({"pin_post": True, "pinned_message_id": _POST, "status": "cancelled"}, "unpin"),
        ({"pin_post": True, "pinned_message_id": _POST, "status": "completed"}, "unpin"),
        ({"pin_post": True, "start_applied_at": _STARTS}, None),
        ({"pin_post": True, "status": "cancelled"}, None),
        ({"pin_post": True, "pinned_message_id": _REPOSTED}, "forget"),
        ({"pin_post": True, "pinned_message_id": _POST, "message_id": None}, "forget"),
    ],
    ids=[
        "off",
        "on",
        "draft",
        "post-on-its-way",
        "pinned-already",
        "turned-off",
        "started",
        "cancelled",
        "completed",
        "started-never-pinned-by-the-bot",
        "cancelled-never-pinned-by-the-bot",
        "reposted",
        "post-deleted",
    ],
)
def test_what_the_posts_pin_needs(overrides: dict[str, object], step: str | None) -> None:
    # Only the bot's own pin (stamped) is undone; a stamp naming another post is forgotten.
    assert raid_advanced.pin_step(_event(**overrides), _guild()) == step


def test_the_servers_pin_reaches_the_raids_that_follow_it() -> None:
    server_on = _guild(pin_posts=True)
    assert raid_advanced.pin_wanted(_event(), server_on)
    assert raid_advanced.pin_step(_event(), server_on) == "pin"
    assert raid_advanced.pin_step(_event(pin_post=False), server_on) is None
    assert not raid_advanced.pin_wanted(_event(status="draft"), server_on)
    # Turned off on the server: the bot's pin comes off the raids that follow it, not the ones pinning their own.
    assert raid_advanced.pin_step(_event(pinned_message_id=_POST), _guild()) == "unpin"
    assert raid_advanced.pin_step(_event(pin_post=True, pinned_message_id=_POST), _guild()) is None


# ---------------------------------------------------------------------------
# Voice channel
# ---------------------------------------------------------------------------


def test_the_voice_channel_reads_the_raid_then_the_server() -> None:
    server = _guild(voice_channel_id=_VOICE)
    assert raid_advanced.voice_channel(_event(), _guild()) == Effective(None, "built_in")
    assert raid_advanced.voice_channel(_event(), server) == Effective(_VOICE, "server")
    assert raid_advanced.voice_channel(_event(voice_channel_id=_LONG_VOICE), server) == Effective(_LONG_VOICE, "raid")
    # The raid's own "none", although the server has one.
    assert raid_advanced.voice_channel(_event(voice_channel_id=NO_VOICE), server) == Effective(None, "raid")
    assert raid_advanced.voice_channel(_event(voice_channel_id=NO_VOICE), _guild()) == Effective(None, "raid")


def test_the_post_links_the_voice_channel_after_who_its_open_to() -> None:
    guild = _guild(signup_role_ids=["601"], voice_channel_id=_VOICE)
    assert raid_advanced.post_lines(_event(), guild) == ["Open to: <@&601>", f"Voice: <#{_VOICE}>"]
    assert raid_advanced.post_lines(_event(signup_role_ids=[]), guild) == [f"Voice: <#{_VOICE}>"]
    assert raid_advanced.post_lines(_event(voice_channel_id=NO_VOICE), guild) == ["Open to: <@&601>"]
    assert raid_advanced.post_lines(_event(), _guild()) == []


@pytest.mark.parametrize(
    ("values", "picked"),
    [
        ([_VOICE], _VOICE),
        ([_LONG_VOICE], _LONG_VOICE),
        (["1" * 15], "1" * 15),
        ([], None),
        ([NO_VOICE], None),
        (["general"], None),
        (["1" * 14], None),
        (["1" * 21], None),
        (["١" * 18], None),
    ],
    ids=["id", "20-digits", "15-digits", "nothing", "no-voice", "a-name", "too-short", "too-long", "not-ascii"],
)
def test_a_voice_menu_value_is_a_channel_id(values: list[str], picked: str | None) -> None:
    assert raid_advanced.voice_choice(values) == picked


# ---------------------------------------------------------------------------
# Delete the post
# ---------------------------------------------------------------------------


def test_a_delete_menu_value_is_a_delay_or_keep() -> None:
    assert raid_advanced.delete_choice(KEEP) == KEEP
    assert [raid_advanced.delete_choice(str(hours)) for hours in DELETE_CHOICES] == list(DELETE_CHOICES)
    for value in ("", "0", "5", "169", "24h", " 24", "inherit", "٢٤"):
        assert raid_advanced.delete_choice(value) is None, value


@pytest.mark.parametrize(("hours", "words"), _DELAYS)
def test_each_delay_in_words(hours: int, words: str) -> None:
    copy = raid_post_options_copy
    assert copy.delay_words(hours) == words
    assert copy.delete_value_line(hours) == f"Delete the post: **{words}** after the raid"
    assert copy.delete_summary(hours) == f"{words} after the raid"
    assert copy.delete_option(hours) == f"{words} after"
    assert copy.delete_saved(hours) == f"Saved: the post is deleted {words} after the raid ends."


def test_keeping_the_post_in_words() -> None:
    assert tuple(hours for hours, _ in _DELAYS) == DELETE_CHOICES
    assert raid_post_options_copy.delete_value_line(None) == "Delete the post: **never**"
    assert raid_post_options_copy.delete_summary(None) == "Never"
    assert raid_post_options_copy.delete_saved(None) == "Saved: the post stays up after the raid."


# ---------------------------------------------------------------------------
# What the cards and messages say
# ---------------------------------------------------------------------------


def test_the_pin_and_voice_lines_and_summaries() -> None:
    copy = raid_post_options_copy
    assert [copy.pin_value_line(True), copy.pin_value_line(False)] == [
        "Pin the post: **on** until the raid starts",
        "Pin the post: **off**",
    ]
    assert [copy.pin_summary(True), copy.pin_summary(False)] == ["Pinned until the raid starts", "Not pinned"]
    assert [copy.pin_inherit_label(True), copy.pin_inherit_label(False)] == [
        "Server default (on)",
        "Server default (off)",
    ]
    assert [copy.voice_value_line(_VOICE), copy.voice_value_line(None)] == [
        f"Voice channel: <#{_VOICE}>",
        "Voice channel: none",
    ]
    assert [copy.voice_summary(_VOICE), copy.voice_summary(None)] == ["Linked on the post", "None"]


def test_the_notices_after_a_change() -> None:
    copy = raid_post_options_copy
    assert [
        copy.pin_saved(True, server=False),
        copy.pin_saved(False, server=False),
        copy.pin_saved(True, server=True),
        copy.pin_saved(False, server=True),
        copy.voice_saved(_VOICE, server=False),
        copy.voice_saved(None, server=False),
        copy.voice_saved(_VOICE, server=True),
        copy.voice_saved(None, server=True),
        copy.busy(True),
        copy.busy(False),
    ] == [
        "Saved: this raid's post is pinned until the raid starts.",
        "Saved: this raid's post isn't pinned.",
        "Saved: raid posts are pinned until the raid starts, unless a raid sets its own.",
        "Saved: raid posts aren't pinned, unless a raid sets its own.",
        f"Saved: the post shows <#{_VOICE}>.",
        "Saved: no voice channel on this raid's post.",
        f"Saved: raid posts show <#{_VOICE}>, unless a raid sets its own.",
        "Saved: raid posts show no voice channel, unless a raid sets its own.",
        "Pinning the post…",
        "Unpinning the post…",
    ]


def test_the_pin_card_says_why_a_pin_didnt_go_through() -> None:
    problem = raid_post_options_copy.pin_problem
    assert problem(None) is None
    assert problem(PinResult("pin", "done", _CHANNEL)) is None
    assert problem(PinResult("pin", "permission", _CHANNEL)) == (
        f"Saved, but the post isn't pinned: the bot needs **Pin Messages** in <#{_CHANNEL}>; {_RETRY}."
    )
    assert problem(PinResult("unpin", "permission", _CHANNEL)) == (
        f"Saved, but the post is still pinned: the bot needs **Pin Messages** in <#{_CHANNEL}>; {_RETRY}."
    )
    assert problem(PinResult("pin", "full", _CHANNEL)) == (
        f"Saved, but the post isn't pinned: <#{_CHANNEL}> has as many pins as Discord allows; {_RETRY}."
    )
    assert problem(PinResult("unpin", "failed", _CHANNEL)) == (
        f"Saved, but Discord didn't unpin the post just now; {_RETRY}."
    )


def test_the_posted_message_and_setup_say_why_posts_arent_pinned() -> None:
    extra = "Made the Discord event and the thread."
    with_problem = raid_post_options_copy.with_pin_problem
    assert with_problem(extra, None) == extra
    assert with_problem(None, PinResult("pin", "done", _CHANNEL)) is None
    no_pins = f"Not pinned: the bot needs **Pin Messages** in <#{_CHANNEL}>; {_RETRY}."
    assert with_problem(None, PinResult("pin", "permission", _CHANNEL)) == no_pins
    assert with_problem(extra, PinResult("pin", "permission", _CHANNEL)) == f"{extra}\n{no_pins}"
    assert with_problem(None, PinResult("pin", "full", _CHANNEL)) == (
        f"Not pinned: <#{_CHANNEL}> has as many pins as Discord allows; {_RETRY}."
    )
    assert with_problem(None, PinResult("pin", "failed", _CHANNEL)) == (
        f"Discord didn't pin the post just now; {_RETRY}."
    )
    assert raid_post_options_copy.setup_no_pins(_CHANNEL) == (
        f"Raid posts won't be pinned until the bot has **Pin Messages** in <#{_CHANNEL}>."
    )


def test_the_raids_own_post_options_on_the_detail_line() -> None:
    assert raid_post_options_copy.detail_parts(None, None, None) == []
    own = _event(pin_post=True, voice_channel_id=_VOICE, delete_post_after_hours=48)
    line = f"**Advanced:** pinned · voice <#{_VOICE}> · post deleted 2 days after"
    assert raid_advanced_copy.detail_lines(own) == [line]
    none = _event(pin_post=False, voice_channel_id=NO_VOICE)
    assert raid_advanced_copy.detail_lines(none) == ["**Advanced:** not pinned · no voice channel"]
    mixed = _event(min_signups=10, delete_post_after_hours=3)
    assert raid_advanced_copy.detail_lines(mixed) == ["**Advanced:** minimum 10 · post deleted 3 hours after"]
    assert raid_advanced_copy.detail_lines(_event()) == []


@pytest.mark.parametrize("pin", [None, False, True])
@pytest.mark.parametrize("voice", [None, NO_VOICE, _LONG_VOICE])
@pytest.mark.parametrize("delete_after", [None, *DELETE_CHOICES])
def test_every_summary_fits_a_menu_option(pin: bool | None, voice: str | None, delete_after: int | None) -> None:
    event = _event(pin_post=pin, voice_channel_id=voice, delete_post_after_hours=delete_after)
    for guild in (_guild(), _guild(pin_posts=True, voice_channel_id=_LONG_VOICE)):
        for summaries in (raid_advanced_copy.summaries(event, guild), raid_advanced_copy.server_summaries(guild)):
            for key, summary in summaries:
                assert 0 < len(summary) <= 100, summary
                assert len(raid_advanced_copy.LABELS[key]) <= 100


# ---------------------------------------------------------------------------
# The post still fits
# ---------------------------------------------------------------------------


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
def test_a_full_raid_with_ten_roles_and_a_voice_channel_still_fits(icons: bool) -> None:
    event = _event(
        signup_role_ids=_TEN_ROLES,
        notes="x" * DESCRIPTION_MAX,
        title="T" * 200,
        created_by_display_name="L" * 32,
        min_signups=40,
        ready_check_minutes=180,
        pin_post=True,
        voice_channel_id=_LONG_VOICE,
        delete_post_after_hours=168,
    )
    emojis = EMPTY_EMOJIS
    if icons:
        emojis = _icons()
    embed = build_signup_message(event, [_signup(i) for i in range(40)], _guild(), emojis=emojis)["embeds"][0]
    assert embed_length(embed) <= EMBED_TOTAL_BUDGET
    assert len(embed["description"]) <= 4096
    assert f"Voice: <#{_LONG_VOICE}>" in embed["description"]
