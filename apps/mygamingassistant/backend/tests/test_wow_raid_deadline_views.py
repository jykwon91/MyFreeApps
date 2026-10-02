"""Unit tests for what the sign-up deadline shows — the post, both cards, the form and the bot's words.

Pure: no DB, no Discord.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, get_args

import pytest
from platform_shared.services.discord import EMPTY_EMOJIS

from app.models.wow.wow_raid_event import WowRaidEvent
from app.models.wow.wow_raid_guild import WowRaidGuild
from app.services.discord import raid_copy, raid_deadline_copy, raid_draft_copy
from app.services.discord.raid_draft_views import options_data
from app.services.discord.raid_edit_views import DEADLINE_MAX, deadline_modal, edit_card
from app.services.wow.raid_embed import (
    COLOR_CLOSED,
    COLOR_OPEN,
    NOBODY_YET,
    SIGN_UP_HINT,
    build_signup_embed,
    build_signup_message,
)
from app.services.wow.raid_event_service import DeadlineKind, DeadlineSaved
from app.services.wow.raid_notification_outcomes import RunStats

# Sat Oct 10 2026, 20:00 America/New_York; a two-hour deadline closes at _CLOSES.
_STARTS = datetime(2026, 10, 11, 0, 0, tzinfo=timezone.utc)
_STAMP = int(_STARTS.timestamp())
_CLOSES = _STARTS - timedelta(hours=2)
_CLOSES_UNIX = int(_CLOSES.timestamp())
_EARLIER = _CLOSES - timedelta(days=1)
_EVENT_ID = uuid.UUID("a1b2c3d4-0000-4000-8000-000000000000")
_CLOSED_BY_IT = {
    "signup_deadline_minutes": 120,
    "closed_at": _CLOSES,
    "close_reason": "deadline",
    "deadline_applied_at": _CLOSES,
}


def _event(**overrides: object) -> WowRaidEvent:
    fields: dict[str, object] = {
        "id": _EVENT_ID,
        "guild_id": uuid.uuid4(),
        "raid_key": "onyxia",
        "starts_at": _STARTS,
        "size_cap": 40,
        "status": "scheduled",
        "channel_id": "c1",
        "created_by_user_id": "u0",
        "created_by_display_name": "Thrall",
    }
    fields.update(overrides)
    return WowRaidEvent(**fields)


def _guild() -> WowRaidGuild:
    return WowRaidGuild(
        id=uuid.uuid4(), discord_guild_id="g1", raid_channel_id="c1", ping_role_id=None, timezone="America/New_York"
    )


def _post(**row: object) -> tuple[dict[str, Any], dict[str, bool]]:
    """The raid post's embed, and whether each of its buttons works (by label)."""
    message = build_signup_message(_event(**row), [], _guild(), emojis=EMPTY_EMOJIS)
    [embed] = message["embeds"]
    works = {c["label"]: not c["disabled"] for row in message["components"] for c in row["components"]}
    return embed, works


def _fields(embed: dict[str, Any]) -> list[str]:
    return [field["name"] for field in embed.get("fields", [])]


def _row_one(data: dict[str, Any]) -> list[tuple[str, str]]:
    return [(c["label"], c["custom_id"]) for c in data["components"][0]["components"]]


def _card_lines(data: dict[str, Any]) -> list[str]:
    [embed] = data["embeds"]
    return embed["description"].split("\n")


# ---------------------------------------------------------------------------
# The post
# ---------------------------------------------------------------------------


def test_before_the_deadline_the_post_counts_down_to_it() -> None:
    embed, works = _post(signup_deadline_minutes=120)
    assert embed["description"].split("\n")[3] == f"Sign-ups close <t:{_CLOSES_UNIX}:R>"
    assert embed["color"] == COLOR_OPEN
    assert embed["footer"]["text"] == f"ID a1b2c3 · {SIGN_UP_HINT}"
    assert NOBODY_YET in _fields(embed)
    assert works and all(works.values())


def test_closed_by_the_deadline_the_post_greys_like_a_leaders_close() -> None:
    embed, works = _post(**_CLOSED_BY_IT)
    assert embed["description"].split("\n")[3] == "**Sign-ups are closed.**"
    assert embed["color"] == COLOR_CLOSED
    assert embed["footer"]["text"] == "ID a1b2c3 · Sign-ups are closed."
    assert works.pop("My sign-up") is True  # still shows where you stand
    assert not any(works.values())


def test_a_reopen_after_the_deadline_keeps_no_countdown() -> None:
    embed, works = _post(signup_deadline_minutes=120, deadline_applied_at=_CLOSES)
    assert not any(line.startswith("Sign-ups close") for line in embed["description"].split("\n"))
    assert embed["color"] == COLOR_OPEN and all(works.values())


@pytest.mark.parametrize("row", [{}, _CLOSED_BY_IT], ids=["open until the start", "closed by the deadline"])
def test_a_started_raid_greys_its_post_and_every_button_stops(row: dict[str, object]) -> None:
    embed, works = _post(**row, start_applied_at=_STARTS)
    assert embed["description"].split("\n")[3] == "**This raid has started.**"
    assert embed["color"] == COLOR_CLOSED
    assert embed["footer"]["text"] == "ID a1b2c3 · This raid has started."
    assert NOBODY_YET not in _fields(embed)  # nothing left to tap
    assert works and not any(works.values())  # [My sign-up] too


def test_the_create_preview_says_when_sign_ups_will_close() -> None:
    draft = _event(status="draft", signup_deadline_minutes=1800)
    embed = build_signup_embed(draft, [], _guild(), emojis=EMPTY_EMOJIS)
    closes = int((_STARTS - timedelta(minutes=1800)).timestamp())
    assert embed["description"].split("\n")[3] == f"Sign-ups close <t:{closes}:R>"


# ---------------------------------------------------------------------------
# Raid: Edit's card, the draft's card and the form
# ---------------------------------------------------------------------------


def test_both_cards_put_deadline_after_date_and_time() -> None:
    deadline = ("Deadline", f"raid:v1:ed:{_EVENT_ID}:deadline")
    # The edit card's [Repeat] comes after it (a draft isn't posted yet, so it can't repeat).
    repeat = ("Repeat", f"raid:v1:rp:{_EVENT_ID}:open")
    assert _row_one(edit_card(_event()))[-2:] == [deadline, repeat]
    assert _row_one(options_data(_event(status="draft"), _guild(), emojis=EMPTY_EMOJIS))[-1] == deadline


def test_the_edit_card_shows_the_deadline_while_there_is_one() -> None:
    lines = _card_lines(edit_card(_event(signup_deadline_minutes=90)))
    assert lines[2:4] == [
        f"**Date & Time:** <t:{_STAMP}:F> (<t:{_STAMP}:R>)",
        "**Deadline:** 1 hour 30 minutes before the start",
    ]
    assert not any(line.startswith("**Deadline:**") for line in _card_lines(edit_card(_event())))


def test_the_deadline_form_starts_from_the_raids_and_may_be_left_empty() -> None:
    modal = deadline_modal(_event(signup_deadline_minutes=1800))
    assert modal["type"] == 9
    assert modal["data"]["custom_id"] == f"raid:v1:m:{_EVENT_ID}:deadline"
    assert modal["data"]["title"] == raid_deadline_copy.MODAL_TITLE
    [label] = modal["data"]["components"]
    assert (label["label"], label["description"]) == (raid_deadline_copy.LABEL, raid_deadline_copy.HINT)
    box = label["component"]
    assert (box["value"], box["required"], box["max_length"]) == ("1d 6h", False, DEADLINE_MAX)
    assert box["placeholder"] == raid_deadline_copy.PLACEHOLDER
    assert "value" not in deadline_modal(_event())["data"]["components"][0]["component"]
    # Discord's caps: 45 for a form's title and a label, 100 for a label's description and a placeholder.
    assert max(len(raid_deadline_copy.MODAL_TITLE), len(raid_deadline_copy.LABEL)) <= 45
    assert max(len(raid_deadline_copy.HINT), len(raid_deadline_copy.PLACEHOLDER)) <= 100


# ---------------------------------------------------------------------------
# What the bot says
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("saved", "notice"),
    [
        (DeadlineSaved("set", 120, _CLOSES_UNIX), f"Sign-ups close 2 hours before the start (<t:{_CLOSES_UNIX}:R>)."),
        (
            DeadlineSaved("set", 120, _CLOSES_UNIX, still_closed=True),
            f"Sign-ups close 2 hours before the start (<t:{_CLOSES_UNIX}:R>). {raid_deadline_copy.STAYS_CLOSED}",
        ),
        (
            DeadlineSaved("reopened", 120, _CLOSES_UNIX),
            f"Sign-ups are **open** again until the deadline, 2 hours before the start (<t:{_CLOSES_UNIX}:R>).",
        ),
        (
            DeadlineSaved("draft_passed", 120, _CLOSES_UNIX),
            "Sign-ups close 2 hours before the start, which has already passed. "
            "Change the Date & Time or the deadline before you post.",
        ),
        (DeadlineSaved("cleared"), raid_deadline_copy.CLEARED),
        (DeadlineSaved("cleared", still_closed=True), raid_deadline_copy.CLEARED_CLOSED),
        (DeadlineSaved("reopened"), raid_deadline_copy.CLEARED_REOPENED),
        (DeadlineSaved("closed_now", 120, _CLOSES_UNIX, still_closed=True), raid_deadline_copy.CLOSED_NOW),
        (DeadlineSaved("same", 120), raid_draft_copy.NOTHING_CHANGED),
        (DeadlineSaved("format"), raid_deadline_copy.FORMAT),
        (DeadlineSaved("too_long"), raid_deadline_copy.TOO_LONG),
        (DeadlineSaved("started", 120), raid_copy.RAID_STARTED),
    ],
)
def test_the_card_says_what_the_deadline_form_did(saved: DeadlineSaved, notice: str) -> None:
    assert raid_deadline_copy.deadline_notice(saved) == notice


def test_only_a_deadline_that_was_written_re_renders_the_post() -> None:
    written = {kind for kind in get_args(DeadlineKind) if DeadlineSaved(kind).changed}
    assert written == {"set", "cleared", "reopened", "closed_now", "draft_passed"}


def test_a_move_says_what_it_did_to_sign_ups_by_the_deadline() -> None:
    moved = raid_copy.moved(_STAMP)
    assert raid_deadline_copy.moved_notice(moved, None) == moved
    assert raid_deadline_copy.moved_notice(moved, "closed") == f"{moved} {raid_deadline_copy.MOVED_CLOSED}"
    assert raid_deadline_copy.moved_notice(moved, "reopened") == f"{moved} {raid_deadline_copy.MOVED_REOPENED}"


def test_raid_open_says_how_long_sign_ups_stay_open() -> None:
    assert raid_deadline_copy.opened(_event(), _EARLIER) == raid_copy.OPENED_OK
    ahead = _event(signup_deadline_minutes=120)
    assert raid_deadline_copy.opened(ahead, _EARLIER) == (
        f"{raid_copy.OPENED_OK} They close again <t:{_CLOSES_UNIX}:R>, at the deadline."
    )
    assert raid_deadline_copy.opened(ahead, _CLOSES) == raid_deadline_copy.OPENED_PAST


def test_the_leaders_dm_names_the_raid_and_links_its_post() -> None:
    link = "https://discord.com/channels/g1/c1/m1"
    assert raid_deadline_copy.closed_dm(_event(), link) == (
        f"Sign-ups for **Onyxia's Lair** (<t:{_STAMP}:F>) closed at the deadline. "
        "To let people in again, right-click the raid post → Apps → **Raid: Open**.\n"
        f"[Jump to the raid]({link})"
    )
    assert raid_deadline_copy.closed_dm(_event(), None).endswith("**Raid: Open**.")


def test_a_run_that_only_swept_still_logs_its_counts() -> None:
    stats = RunStats(deadline_closed=1, started=2)
    assert stats.busy
    assert stats.summary().endswith("late_dms=0 deadline_closed=1 started=2")
    assert not RunStats().busy
