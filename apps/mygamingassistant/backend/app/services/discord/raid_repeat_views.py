"""Copy raid's form, the Repeat card and its forms, and ``/raid-admin repeats`` — pure builders.

* :func:`copy_modal` — Raid: Edit → [Copy raid]: when the copy starts,
  suggested a week after the raid (``raid_repeat.copy_suggestion``).
* :func:`repeat_card` — Raid: Edit → [Repeat]: Off, a menu of how often;
  On, how often and how far ahead each raid posts, then [Skip <date>]
  [Change next date] [Stop repeating] [Back].
* :func:`repeat_days_modal` / :func:`repeat_next_modal` — How often? →
  Other…, and [Change next date].
* :func:`repeats_list` — ``/raid-admin repeats``: a menu of the server's repeats.
* :func:`posted_data` — [Post raid]'s "Posted" message, offering [Repeat this raid].
"""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from platform_shared.services.discord import (
    BUTTON_STYLE_DANGER,
    BUTTON_STYLE_SECONDARY,
    COMPONENT_TYPE_STRING_SELECT,
    TEXT_INPUT_STYLE_SHORT,
)

from app.models.wow.wow_raid_event import WowRaidEvent
from app.models.wow.wow_raid_series import WowRaidSeries
from app.services.discord import raid_copy, raid_repeat_copy
from app.services.discord.interaction import ephemeral_data
from app.services.discord.raid_edit_views import WHEN_MAX, when_prefill
from app.services.discord.raid_forms import event_form, text_box
from app.services.discord.raid_leader_views import raid_line
from app.services.discord.raid_views import action_row, button
from app.services.wow import raid_custom_id, raid_repeat
from app.services.wow.raid_text import display_title

# The How often? choice that opens the form for any number of days.
OTHER_DAYS = "other"
# The When should I post? choice for "when the one before starts" (no post-ahead).
AHEAD_NONE = "0"
_LABEL_MAX = 100


def copy_modal(event: WowRaidEvent, tz_name: str, *, now: datetime) -> dict[str, Any]:
    """The copy's date and time in the server's timezone, read like Date & Time's."""
    field = text_box(
        raid_copy.when_label(tz_name),
        raid_copy.WHEN_HINT,
        style=TEXT_INPUT_STYLE_SHORT,
        value=when_prefill(raid_repeat.copy_suggestion(event.starts_at, tz_name, now), tz_name),
        max_length=WHEN_MAX,
        required=True,
    )
    return event_form(event, "copy", raid_repeat_copy.COPY_MODAL, field)


# ---------------------------------------------------------------------------
# The Repeat card
# ---------------------------------------------------------------------------


def repeat_card(
    event: WowRaidEvent,
    series: WowRaidSeries | None,
    template: WowRaidEvent | None,
    *,
    now: datetime,
    notice: str | None = None,
) -> dict[str, Any]:
    """The raid's repeat as it stands, with what to change; *notice* (last) says what just happened."""
    lines = [raid_line(event)]
    if series is None:
        lines.append(raid_repeat_copy.OFF)
        rows = [action_row(_every_select(event, None)), action_row(_back_button(event))]
    else:
        lines.extend(raid_repeat_copy.on_lines(series, template, now))
        rows = [
            action_row(_every_select(event, series.every_days)),
            action_row(_ahead_select(event, series)),
            action_row(
                _button(event, raid_repeat.skip_label(series.next_starts_at, series.tz_name), "skip"),
                _button(event, raid_repeat_copy.NEXT_BUTTON, "next"),
                _button(event, raid_repeat_copy.STOP_BUTTON, "stop", BUTTON_STYLE_DANGER),
                _back_button(event),
            ),
        ]
    if notice:
        lines.append(notice)
    return ephemeral_data("\n".join(lines), components=rows, embeds=[])


def _every_select(event: WowRaidEvent, current: int | None) -> dict[str, Any]:
    """How often? — the presets, the repeat's own interval if it's none of them, and Other…."""
    days = list(raid_repeat.CADENCES)
    if current is not None and current not in days:
        days.append(current)
    options = [_option(raid_repeat.every_words(count).capitalize(), str(count), count == current) for count in days]
    options.append({"label": raid_repeat_copy.OTHER, "value": OTHER_DAYS})
    return _select(event, "every", raid_repeat_copy.EVERY_PLACEHOLDER, options)


def _ahead_select(event: WowRaidEvent, series: WowRaidSeries) -> dict[str, Any]:
    """When should I post each one? — only the choices within the interval."""
    options = [
        _option(raid_repeat.ahead_words(hours).capitalize(), ahead_value(hours), hours == series.post_ahead_hours)
        for hours in raid_repeat.ahead_choices(series.every_days)
    ]
    return _select(event, "ahead", raid_repeat_copy.AHEAD_PLACEHOLDER, options)


def ahead_value(hours: int | None) -> str:
    """A post-ahead choice's value: the hours, or ``0`` for when the one before starts."""
    if hours is None:
        return AHEAD_NONE
    return str(hours)


def _select(event: WowRaidEvent, verb: str, placeholder: str, options: list[dict[str, Any]]) -> dict[str, Any]:
    return {
        "type": COMPONENT_TYPE_STRING_SELECT,
        "custom_id": raid_custom_id.encode("rp", event.id, verb),
        "placeholder": placeholder,
        "min_values": 1,
        "max_values": 1,
        "options": options,
    }


def _option(label: str, value: str, chosen: bool) -> dict[str, Any]:
    option: dict[str, Any] = {"label": label, "value": value}
    if chosen:
        option["default"] = True
    return option


def _button(event: WowRaidEvent, label: str, verb: str, style: int = BUTTON_STYLE_SECONDARY) -> dict[str, Any]:
    return button(label, style, raid_custom_id.encode("rp", event.id, verb))


def _back_button(event: WowRaidEvent) -> dict[str, Any]:
    return _button(event, "Back", "back")


# ---------------------------------------------------------------------------
# Forms
# ---------------------------------------------------------------------------


def repeat_days_modal(event: WowRaidEvent, current: int | None) -> dict[str, Any]:
    """How often? → Other…: any number of days, 1–28, holding the repeat's own."""
    value = None
    if current is not None:
        value = str(current)
    field = text_box(
        raid_repeat_copy.DAYS_LABEL,
        raid_repeat_copy.DAYS_HINT,
        style=TEXT_INPUT_STYLE_SHORT,
        value=value,
        max_length=2,
        required=True,
    )
    return event_form(event, "repeat_days", raid_repeat_copy.DAYS_MODAL, field)


def repeat_next_modal(event: WowRaidEvent, series: WowRaidSeries, tz_name: str) -> dict[str, Any]:
    """[Change next date]: the next raid's date and time in the server's timezone, read like Date & Time's."""
    field = text_box(
        raid_copy.when_label(tz_name),
        raid_copy.WHEN_HINT,
        style=TEXT_INPUT_STYLE_SHORT,
        value=when_prefill(series.next_starts_at, tz_name),
        max_length=WHEN_MAX,
        required=True,
    )
    return event_form(event, "repeat_next", raid_repeat_copy.NEXT_MODAL, field)


# ---------------------------------------------------------------------------
# /raid-admin repeats and the "Posted" message
# ---------------------------------------------------------------------------


def repeats_list(listed: list[tuple[WowRaidSeries, WowRaidEvent]]) -> dict[str, Any]:
    """The server's repeats as a menu, each by its latest raid; picking one opens its Repeat card."""
    if not listed:
        return ephemeral_data(raid_repeat_copy.REPEATS_NONE)
    select = {
        "type": COMPONENT_TYPE_STRING_SELECT,
        "custom_id": raid_custom_id.encode(raid_custom_id.REPEATS_PICK),
        "placeholder": raid_repeat_copy.PICK_PLACEHOLDER,
        "min_values": 1,
        "max_values": 1,
        "options": [_listed(series, latest) for series, latest in listed],
    }
    return ephemeral_data(raid_repeat_copy.repeats_header(len(listed)), components=[action_row(select)])


def _listed(series: WowRaidSeries, latest: WowRaidEvent) -> dict[str, Any]:
    """'Onyxia's Lair' — 'Every week · next Tue, Oct 13 8:00pm'; its value is the latest raid."""
    every = raid_repeat.every_words(series.every_days).capitalize()
    upcoming = raid_repeat.slot_words(series.next_starts_at, series.tz_name)
    return {
        "label": display_title(latest)[:_LABEL_MAX],
        "description": f"{every} · next {upcoming}"[:_LABEL_MAX],
        "value": str(latest.id),
    }


def posted_data(channel_id: str, link: str, event_id: uuid.UUID) -> dict[str, Any]:
    """[Post raid]'s "Posted" message with [Repeat this raid]."""
    repeat = button(raid_repeat_copy.REPEAT_THIS, BUTTON_STYLE_SECONDARY, raid_custom_id.encode("rp", event_id, "open"))
    return ephemeral_data(raid_copy.posted(channel_id, link), components=[action_row(repeat)])
