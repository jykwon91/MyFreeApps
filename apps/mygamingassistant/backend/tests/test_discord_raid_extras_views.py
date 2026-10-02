"""Unit tests for Event & thread's card and copy — app.services.discord.raid_extras_views and raid_extras_copy.

Pure: no DB, no Discord.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

import pytest
from platform_shared.services.discord import EMPTY_EMOJIS

from app.models.wow.wow_raid_event import WowRaidEvent
from app.models.wow.wow_raid_guild import WowRaidGuild
from app.services.discord import raid_draft_copy, raid_extras_copy
from app.services.discord.raid_draft_views import options_data
from app.services.discord.raid_edit_views import edit_card
from app.services.discord.raid_extras_views import extras_card, length_modal
from app.services.wow.raid_extras_rules import Step, Synced
from app.services.wow.raid_extras_service import LengthSaved

# Sat Oct 10 2026, 20:00 America/New_York
_STARTS = datetime(2026, 10, 11, 0, 0, tzinfo=timezone.utc)
_STAMP = int(_STARTS.timestamp())
_NOW = _STARTS - timedelta(days=1)
_EVENT_ID = uuid.UUID("a1b2c3d4-0000-4000-8000-000000000000")
_RAID_LINE = f"**Onyxia's Lair** · <t:{_STAMP}:F>"
_LENGTH_LINE = f"**Length:** 3 hours · the event ends <t:{_STAMP + 3 * 3600}:t>"
_GUILD = WowRaidGuild(discord_guild_id="g1", raid_channel_id="c1", timezone="America/New_York")
_TRY_AGAIN_DUE = "Fix that, then tap **Try again**. The raid itself is fine."


def _event(**overrides: object) -> WowRaidEvent:
    """A posted raid with both extras on and nothing made yet."""
    fields: dict[str, object] = {
        "id": _EVENT_ID,
        "guild_id": uuid.uuid4(),
        "raid_key": "onyxia",
        "starts_at": _STARTS,
        "size_cap": 40,
        "status": "scheduled",
        "channel_id": "c1",
        "message_id": "m1",
        "created_by_user_id": "u0",
        "created_by_display_name": "Thrall",
        "title": None,
        "discord_event_enabled": True,
        "thread_enabled": True,
    }
    fields.update(overrides)
    return WowRaidEvent(**fields)


def _made(**overrides: object) -> WowRaidEvent:
    made = {"discord_event_id": "ev1", "thread_id": "m1", "thread_name": "Onyxia's Lair · Sat Oct 10"}
    return _event(**{**made, **overrides})


def _id(verb: str) -> str:
    return f"raid:v1:xt:{_EVENT_ID}:{verb}"


def _rows(data: dict[str, Any]) -> list[list[tuple[str, int, str]]]:
    """Each row's buttons as (label, style, custom_id)."""
    return [[(c["label"], c["style"], c["custom_id"]) for c in row["components"]] for row in data["components"]]


def _lines(data: dict[str, Any]) -> list[str]:
    return data["content"].split("\n")


_BACK = ("Back", 2, f"raid:v1:ed:{_EVENT_ID}:back")
_TRY_AGAIN = ("Try again", 1, _id("retry"))
_LENGTH = ("Length", 2, _id("length"))
_BOTH_ON = [("Discord event: on", 3, _id("event_off")), ("Thread: on", 3, _id("thread_off")), _LENGTH]


# ---------------------------------------------------------------------------
# The card, in each state
# ---------------------------------------------------------------------------


def test_a_drafts_card_says_both_are_made_when_the_raid_is_posted() -> None:
    data = extras_card(_event(status="draft", message_id=None), _GUILD, now=_NOW)

    assert data["flags"] == 64 and data["embeds"] == []
    assert _lines(data) == [
        raid_extras_copy.CARD_PROMPT,
        _RAID_LINE,
        "**Discord event:** on · made when you post the raid",
        "**Thread:** on · started under the post when you post the raid",
        _LENGTH_LINE,
    ]
    assert _rows(data) == [_BOTH_ON, [_BACK]]


def test_with_both_off_the_toggles_are_grey_and_switch_them_on() -> None:
    data = extras_card(_event(discord_event_enabled=False, thread_enabled=False), _GUILD, now=_NOW)

    assert _lines(data)[2:4] == ["**Discord event:** off", "**Thread:** off"]
    assert _rows(data) == [
        [("Discord event: off", 2, _id("event_on")), ("Thread: off", 2, _id("thread_on")), _LENGTH],
        [_BACK],
    ]


def test_made_links_the_event_and_the_thread() -> None:
    data = extras_card(_made(length_minutes=90), _GUILD, now=_NOW, notice="The Discord event is up.")

    assert _lines(data) == [
        "The Discord event is up.",
        _RAID_LINE,
        "**Discord event:** on · [in the Events tab](https://discord.com/events/g1/ev1)",
        "**Thread:** on · <#m1>",
        f"**Length:** 1 hour 30 minutes · the event ends <t:{_STAMP + 90 * 60}:t>",
    ]
    assert _rows(data) == [_BOTH_ON, [_BACK]]


def test_a_member_thread_is_linked_and_left_alone() -> None:
    data = extras_card(_made(thread_name=None), _GUILD, now=_NOW)

    assert _lines(data)[3] == "**Thread:** on · <#m1> · someone else's, so I leave it as it is"


def test_busy_turns_every_button_off_and_a_fresh_claim_is_on_its_way() -> None:
    event = _event(discord_event_claimed_at=_NOW - timedelta(seconds=5), thread_id="m1", thread_name="x")
    data = extras_card(event, _GUILD, now=_NOW, notice=raid_extras_copy.BUSY["event_on"], busy=True)

    assert _lines(data)[0] == "Making the Discord event…"
    assert _lines(data)[2] == "**Discord event:** on · on its way"
    buttons = [button for row in data["components"] for button in row["components"]]
    assert [b["label"] for b in buttons] == ["Discord event: on", "Thread: on", "Length", "Back"]
    assert all(b.get("disabled") is True for b in buttons)


def test_missing_offers_try_again_before_back() -> None:
    data = extras_card(_event(), _GUILD, now=_NOW)

    assert _lines(data)[2:4] == ["**Discord event:** on · not made yet", "**Thread:** on · not made yet"]
    assert _TRY_AGAIN_DUE not in _lines(data)
    assert _rows(data)[1] == [_TRY_AGAIN, _BACK]


def test_refused_says_why_and_how_to_fix_it() -> None:
    event = _made(discord_event_id=None, discord_event_error=50013, thread_error=50001)
    data = extras_card(event, _GUILD, now=_NOW)

    assert _lines(data)[2:] == [
        "**Discord event:** on · not made: the bot needs **Create Events** in this server",
        "**Thread:** on · not made: the bot needs **Create Public Threads** in <#c1>",
        _LENGTH_LINE,
        _TRY_AGAIN_DUE,
    ]
    assert _rows(data)[1] == [_TRY_AGAIN, _BACK]


@pytest.mark.parametrize(
    ("part", "code", "said"),
    [
        ("event", 50013, "the bot needs **Create Events** in this server"),
        ("event", 50001, "the bot needs **Create Events** in this server"),
        ("thread", 50013, "the bot needs **Create Public Threads** in <#c1>"),
        ("event", 30038, "the server has 100 upcoming Discord events, Discord's limit"),
        ("thread", 160006, "the server has as many active threads as Discord allows"),
        ("thread", 160005, "a moderator locked the thread"),
        ("event", 50035, "Discord said no (code 50035)"),
    ],
)
def test_each_refusal_reads_in_the_leaders_words(part: str, code: int, said: str) -> None:
    assert raid_extras_copy.reason(part, code, "c1") == said


def test_started_gets_no_event_and_no_try_again() -> None:
    event = _event(thread_id="m1", thread_name="x")
    data = extras_card(event, _GUILD, now=_STARTS - timedelta(minutes=1))

    assert _lines(data)[2] == "**Discord event:** on · none: the raid has started"
    assert _rows(data)[1] == [_BACK]


def test_try_again_shows_only_on_a_posted_raid_with_something_to_fix() -> None:
    def offered(event: WowRaidEvent) -> bool:
        return _TRY_AGAIN in _rows(extras_card(event, _GUILD, now=_NOW))[1]

    assert offered(_event())
    assert offered(_made(thread_error=160005))
    assert not offered(_made())
    assert not offered(_event(status="draft", message_id=None))
    assert not offered(_event(discord_event_enabled=False, thread_enabled=False))


def test_every_id_fits_discords_100() -> None:
    ids = [b["custom_id"] for row in extras_card(_event(), _GUILD, now=_NOW)["components"] for b in row["components"]]
    ids.append(length_modal(_event())["data"]["custom_id"])

    assert max(len(custom_id) for custom_id in ids) == len(_id("thread_off")) == 58


def test_row_two_of_more_options_and_raid_edit_ends_with_event_and_thread() -> None:
    open_card = ("Event & thread", 2, _id("open"))
    draft = _event(status="draft", message_id=None)

    assert _rows(options_data(draft, _GUILD, emojis=EMPTY_EMOJIS))[1][-1] == open_card
    assert _rows(edit_card(_made()))[1][-1] == open_card


# ---------------------------------------------------------------------------
# The Length form and its notices
# ---------------------------------------------------------------------------


def test_the_length_form_holds_the_raids_length() -> None:
    modal = length_modal(_event(length_minutes=150))

    assert modal["type"] == 9
    assert modal["data"]["custom_id"] == f"raid:v1:m:{_EVENT_ID}:length"
    assert modal["data"]["title"] == "Raid length"
    [label] = modal["data"]["components"]
    assert label["label"] == "How long does the raid run?"
    assert label["description"] == raid_extras_copy.LENGTH_HINT
    field = label["component"]
    assert (field["value"], field["max_length"], field["required"]) == ("2h 30m", 16, False)
    assert field["placeholder"] == "e.g. 3h"
    assert "value" not in length_modal(_event())["data"]["components"][0]["component"]


@pytest.mark.parametrize(
    ("saved", "said"),
    [
        (LengthSaved("set", 90), "The raid runs 1 hour 30 minutes."),
        (LengthSaved("set", None), "The raid runs 3 hours."),
        (LengthSaved("same", 90), raid_draft_copy.NOTHING_CHANGED),
        (LengthSaved("format"), "I couldn't read that length. Try 3 (hours), 90m or 2h 30m."),
        (LengthSaved("too_short"), "A raid runs at least 15 minutes."),
        (LengthSaved("too_long"), "A raid can run at most 6 hours."),
    ],
)
def test_length_notices(saved: LengthSaved, said: str) -> None:
    assert raid_extras_copy.length_notice(saved) == said


# ---------------------------------------------------------------------------
# After the Discord calls
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("verb", "synced", "said"),
    [
        ("event_on", Synced(Step("made"), Step("none")), "The Discord event is up."),
        ("event_on", Synced(Step("refused", 50013), Step("none")), None),
        ("retry", Synced(Step("made"), Step("made")), "The Discord event is up.\nThe thread is up."),
        ("retry", Synced(Step("failed"), Step("failed")), "Discord didn't answer. Tap **Try again**."),
        ("thread_on", Synced(Step("none"), Step("adopted")), raid_extras_copy.THREAD_THEIRS),
        ("thread_on", Synced(Step("none"), Step("gone")), "Someone deleted the raid's thread, so it's off now."),
        ("length", Synced(Step("updated"), Step("none")), None),
        ("length", Synced(Step("gone"), Step("none")), raid_extras_copy.EVENT_GONE),
    ],
)
def test_sync_notices(verb: str, synced: Synced, said: str | None) -> None:
    assert raid_extras_copy.sync_notice(verb, synced) == said


@pytest.mark.parametrize(
    ("verb", "step", "said"),
    [
        ("event_off", Step("removed"), "Discord event removed."),
        ("event_off", Step("none"), "Discord event off."),
        ("thread_off", Step("archived"), raid_extras_copy.THREAD_ARCHIVED),
        ("thread_off", Step("none"), "Thread off."),
        (
            "event_off",
            Step("failed"),
            "I couldn't remove the Discord event (Discord didn't answer). "
            "Someone with **Manage Events** can delete it in the Events tab.",
        ),
        ("thread_off", Step("refused", 160005), "I couldn't archive the thread (a moderator locked the thread)."),
    ],
)
def test_off_notices(verb: str, step: Step, said: str) -> None:
    assert raid_extras_copy.off_notice(verb, step, "c1") == said


def test_a_toggle_on_a_draft_says_when_its_made() -> None:
    assert raid_extras_copy.draft_notice("event_on") == "Discord event on: I'll make it when you post the raid."
    assert raid_extras_copy.draft_notice("thread_off") == "Thread off."
    assert raid_extras_copy.draft_notice("retry") is None


# ---------------------------------------------------------------------------
# Elsewhere: the "Posted" message and the cards' detail line
# ---------------------------------------------------------------------------

_WHERE = "Raid: Edit → **Event & thread** has **Try again**."


@pytest.mark.parametrize(
    ("synced", "said"),
    [
        (Synced(Step("made"), Step("made")), "Its Discord event and thread are up."),
        (Synced(Step("adopted"), Step("none")), "Its Discord event is up."),
        (Synced(Step("none"), Step("adopted")), "Its thread is up."),
        (Synced(Step("none"), Step("none")), None),
        (Synced(Step("started"), Step("none")), None),
        (
            Synced(Step("made"), Step("refused", 50013)),
            f"Its Discord event is up.\nNo thread: the bot needs **Create Public Threads** in <#c1>. {_WHERE}",
        ),
        (
            Synced(Step("refused", 30038), Step("failed")),
            f"No Discord event: the server has 100 upcoming Discord events, Discord's limit. {_WHERE}\n"
            f"Discord didn't answer when I made the thread. {_WHERE}",
        ),
    ],
)
def test_the_posted_line(synced: Synced, said: str | None) -> None:
    assert raid_extras_copy.posted_line(synced, "c1") == said


@pytest.mark.parametrize(
    ("overrides", "said"),
    [
        ({"discord_event_enabled": False, "thread_enabled": False}, None),
        ({"status": "draft", "message_id": None, "thread_enabled": False}, "on · **Thread:** off"),
        ({}, "not made · see **Event & thread** · **Thread:** not made · see **Event & thread**"),
        ({"discord_event_id": "ev1", "thread_id": "m1"}, "on · **Thread:** on"),
        ({"discord_event_claimed_at": _NOW, "thread_id": "m1"}, "on · **Thread:** on"),
        ({"start_applied_at": _STARTS, "thread_id": "m1"}, "on · **Thread:** on"),
        ({"discord_event_id": "ev1", "thread_error": 160006}, "on · **Thread:** not made · see **Event & thread**"),
        (
            {"status": "draft", "message_id": None, "discord_event_error": 50013},
            "not made · see **Event & thread** · **Thread:** on",
        ),
    ],
)
def test_the_detail_line(overrides: dict[str, object], said: str | None) -> None:
    expected = []
    if said is not None:
        expected = [f"**Discord event:** {said}"]
    assert raid_extras_copy.detail_lines(_event(**overrides)) == expected
