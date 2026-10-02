"""Unit tests for app.services.wow.raid_extras_rules — a raid's Discord event and thread, decided without Discord.

Pure: no DB, no Discord.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

import pytest

from app.models.wow.wow_raid_event import WowRaidEvent
from app.models.wow.wow_raid_guild import WowRaidGuild
from app.services.wow.raid_extras_rules import (
    CLAIM_STALE,
    CREATE_LEAD,
    DESCRIPTION_MAX,
    NAME_MAX,
    Leftovers,
    LengthError,
    Plan,
    classify,
    create_body,
    ends_at,
    event_payload,
    leftovers,
    parse_length,
    payload_digest,
    plan,
    thread_body,
    thread_name,
)

# Sat Oct 10 2026, 20:00 America/New_York
_STARTS = datetime(2026, 10, 11, 0, 0, tzinfo=timezone.utc)
_NOW = _STARTS - timedelta(days=1)
_TZ = "America/New_York"
_LINK = "https://discord.com/channels/g1/c1/m1"
_NAME = "Onyxia's Lair · Sat Oct 10"


def _event(**overrides: object) -> WowRaidEvent:
    """A posted raid with both extras on and nothing made yet."""
    fields: dict[str, object] = {
        "id": uuid.UUID("a1b2c3d4-0000-4000-8000-000000000000"),
        "guild_id": uuid.uuid4(),
        "raid_key": "onyxia",
        "starts_at": _STARTS,
        "size_cap": 40,
        "status": "scheduled",
        "channel_id": "c1",
        "message_id": "m1",
        "created_by_user_id": "u0",
        "created_by_display_name": "Thrall",
        "notes": None,
        "title": None,
        "discord_event_enabled": True,
        "thread_enabled": True,
    }
    fields.update(overrides)
    return WowRaidEvent(**fields)


def _payload(event: WowRaidEvent) -> dict[str, object]:
    return event_payload(event, leader="Thrall", post_link=_LINK)


def _plan(event: WowRaidEvent, *, now: datetime = _NOW, reopen_thread: bool = False) -> Plan:
    return plan(event, payload=_payload(event), thread_name=_NAME, now=now, reopen_thread=reopen_thread)


def _made(**overrides: object) -> WowRaidEvent:
    """A raid whose event and thread Discord took as they are now."""
    event = _event(discord_event_id="ev1", discord_event_starts_at=_STARTS, thread_id="m1", thread_name=_NAME)
    for name, value in overrides.items():
        setattr(event, name, value)
    event.discord_event_digest = payload_digest(_payload(event))
    return event


# ---------------------------------------------------------------------------
# What Discord holds
# ---------------------------------------------------------------------------


def test_the_event_payload_names_the_raid_and_points_at_its_post() -> None:
    payload = _payload(_event(notes="Bring FR"))

    assert payload == {
        "name": "Onyxia's Lair",
        "description": f"Onyxia's Lair · 40 players · led by Thrall\nBring FR\nSign up on the raid post: {_LINK}",
        "scheduled_start_time": "2026-10-11T00:00:00+00:00",
        "scheduled_end_time": "2026-10-11T03:00:00+00:00",
        "entity_metadata": {"location": _LINK},
    }
    assert create_body(payload) == {**payload, "entity_type": 3, "privacy_level": 2}


def test_the_event_ends_after_the_raids_length() -> None:
    assert ends_at(_event()) == _STARTS + timedelta(hours=3)
    assert ends_at(_event(length_minutes=90)) == _STARTS + timedelta(minutes=90)
    assert _payload(_event(length_minutes=90))["scheduled_end_time"] == "2026-10-11T01:30:00+00:00"


def test_a_long_title_and_long_notes_are_cut_to_discords_limits() -> None:
    payload = _payload(_event(title="T" * 200, notes="N" * 2000))

    assert len(payload["name"]) == NAME_MAX
    assert payload["name"].endswith("…")
    description = payload["description"]
    assert len(description) == DESCRIPTION_MAX
    assert description.startswith("Onyxia's Lair · 40 players · led by Thrall\nNNN")
    # The notes are cut first: the post's link always survives.
    assert description.endswith(f"…\nSign up on the raid post: {_LINK}")


def test_the_digest_is_stable_under_key_order_and_changes_with_every_field() -> None:
    payload = _payload(_event())
    digest = payload_digest(payload)

    assert payload_digest(dict(reversed(list(payload.items())))) == digest
    for key in payload:
        assert payload_digest({**payload, key: "changed"}) != digest, key


def test_the_thread_is_named_after_the_raid_and_its_day() -> None:
    assert thread_name(_event(), _TZ) == _NAME
    long = thread_name(_event(title="T" * 200), _TZ)
    assert len(long) == NAME_MAX
    assert long.endswith("… · Sat Oct 10")
    assert thread_body(_NAME) == {"name": _NAME, "auto_archive_duration": 10080}


# ---------------------------------------------------------------------------
# Length
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("text", "minutes"),
    [("3", 180), ("2.5", 150), ("90m", 90), ("2h 30m", 150), ("15m", 15), ("6h", 360), ("", None), ("  ", None)],
)
def test_a_length_reads_like_a_deadline(text: str, minutes: int | None) -> None:
    assert parse_length(text) == minutes


@pytest.mark.parametrize(
    ("text", "kind"),
    [("14m", "too_short"), ("0", "too_short"), ("6h 1m", "too_long"), ("200h", "too_long"), ("x", "format")],
)
def test_a_length_out_of_range_or_unreadable_is_refused(text: str, kind: str) -> None:
    with pytest.raises(LengthError) as raised:
        parse_length(text)
    assert raised.value.kind == kind


# ---------------------------------------------------------------------------
# What a sync does
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("overrides", "now", "step"),
    [
        ({"discord_event_enabled": False}, _NOW, "none"),
        ({"discord_event_error": 50013}, _NOW, "none"),
        ({}, _STARTS, "started"),
        ({}, _STARTS - CREATE_LEAD + timedelta(seconds=1), "started"),
        ({"discord_event_claimed_at": _NOW - timedelta(seconds=5)}, _NOW, "busy"),
        ({"discord_event_claimed_at": _NOW - CLAIM_STALE}, _NOW, "adopt_or_create"),
        ({}, _NOW, "create"),
    ],
    ids=["off", "refused", "started", "too-close-to-make", "claimed", "stale-claim", "create"],
)
def test_a_raid_without_an_event(overrides: dict[str, object], now: datetime, step: str) -> None:
    assert _plan(_event(**overrides), now=now).event == step


def test_a_raid_with_an_event() -> None:
    assert _plan(_made()).event == "none"
    assert _plan(_made(title="Ony speedrun"), now=_NOW).event == "none"  # the digest was taken after the change
    changed = _made()
    changed.title = "Ony speedrun"
    assert _plan(changed).event == "patch"
    # The raid moved back after Discord's start passed: a new event.
    assert _plan(_made(discord_event_starts_at=_NOW - timedelta(minutes=1))).event == "replace"
    # The raid itself has started: Discord runs the event from here.
    assert _plan(changed, now=_STARTS + timedelta(minutes=1)).event == "started"


@pytest.mark.parametrize(
    ("overrides", "reopen", "step"),
    [
        ({"thread_enabled": False}, False, "none"),
        ({"thread_error": 160006}, False, "none"),
        ({"thread_id": None, "thread_name": None}, False, "create"),
        ({"thread_name": None}, True, "none"),
        ({"thread_name": "Old name"}, False, "rename"),
        ({}, True, "rename"),
        ({}, False, "none"),
    ],
    ids=["off", "refused", "create", "someone-elses", "renamed", "reopened", "unchanged"],
)
def test_the_thread(overrides: dict[str, object], reopen: bool, step: str) -> None:
    assert _plan(_made(**overrides), reopen_thread=reopen).thread == step


@pytest.mark.parametrize(
    "overrides", [{"status": "draft", "message_id": None}, {"status": "cancelled"}, {"message_id": None}]
)
def test_only_a_posted_scheduled_raid_gets_anything(overrides: dict[str, object]) -> None:
    assert _plan(_event(**overrides)) == Plan("none", "none")


@pytest.mark.parametrize(
    ("status", "code", "kind"),
    [
        (404, 10070, "gone"),
        (404, 10003, "gone"),
        (404, 10008, "gone"),
        (400, 160004, "exists"),
        (400, 180000, "finished"),
        (None, None, "transient"),
        (429, None, "transient"),
        (502, None, "transient"),
        (403, 50001, "refused"),
        (403, 50013, "refused"),
        (400, 30038, "refused"),
        (403, 160005, "refused"),
        (400, 160006, "refused"),
        (400, 50035, "refused"),
    ],
)
def test_classify(status: int | None, code: int | None, kind: str) -> None:
    assert classify(status, code) == kind


# ---------------------------------------------------------------------------
# Cancel and delete
# ---------------------------------------------------------------------------


def test_leftovers_leave_a_thread_that_isnt_the_bots_alone() -> None:
    guild = WowRaidGuild(discord_guild_id="g1", raid_channel_id="c1", timezone=_TZ)
    made = _made()

    assert leftovers(guild, made) == Leftovers("g1", "ev1", "m1", made.id)
    assert leftovers(guild, _made(thread_name=None)) == Leftovers("g1", "ev1", None, made.id)
    assert leftovers(guild, _made(discord_event_id=None, thread_name=None)) is None
    assert leftovers(guild, _event()) is None
