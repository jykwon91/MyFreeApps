"""Event & thread's card and Length form — pure builders.

[Event & thread] ends row 2 of More options and of Raid: Edit's card
(:func:`extras_button`).  The card (:func:`extras_card`) says where the
raid's Discord event and thread stand and how long the raid runs:

* [Discord event: on|off] and [Thread: on|off] name where each stands
  (green while on); a tap switches it, the id naming the new state, so a
  card left open can't flip it back;
* [Length] opens a form (:func:`length_modal`);
* [Try again] shows on a posted raid while an extra that's on was refused
  or is missing;
* [Back] is Raid: Edit's ``back``, which shows the card it came from: More
  options for a draft, Raid: Edit's card otherwise.

While the Discord calls run the card comes back busy, every button off.
"""
from __future__ import annotations

from datetime import datetime
from typing import Any, Final

from platform_shared.services.discord import (
    BUTTON_STYLE_PRIMARY,
    BUTTON_STYLE_SECONDARY,
    BUTTON_STYLE_SUCCESS,
    TEXT_INPUT_STYLE_SHORT,
)

from app.models.wow.wow_raid_event import WowRaidEvent
from app.models.wow.wow_raid_guild import WowRaidGuild
from app.services.discord import raid_extras_copy
from app.services.discord.interaction import ephemeral_data
from app.services.discord.raid_forms import event_form, text_box
from app.services.discord.raid_leader_views import raid_line
from app.services.discord.raid_views import action_row, button
from app.services.wow import raid_custom_id
from app.services.wow.raid_deadline import deadline_prefill
from app.services.wow.raid_extras_rules import event_state, thread_state

LENGTH_MAX: Final = 16
# What [Try again] fixes: Discord refused the extra, or a posted raid's is missing.
_RETRYABLE: Final = ("refused", "missing")


def extras_button(event: WowRaidEvent) -> dict[str, Any]:
    """[Event & thread] — opens the card."""
    return button(raid_extras_copy.BUTTON, BUTTON_STYLE_SECONDARY, raid_custom_id.encode("xt", event.id, "open"))


def extras_card(
    event: WowRaidEvent, guild: WowRaidGuild, *, now: datetime, notice: str | None = None, busy: bool = False
) -> dict[str, Any]:
    """What just happened (else what the extras are), the raid, a line each, then the buttons."""
    states = (event_state(event, now), thread_state(event))
    lines = [
        notice or raid_extras_copy.CARD_PROMPT,
        raid_line(event),
        raid_extras_copy.event_line(event, guild, now),
        raid_extras_copy.thread_line(event),
        raid_extras_copy.length_line(event),
    ]
    if "refused" in states:
        lines.append(raid_extras_copy.FIX_HINT)
    toggles = action_row(
        _toggle(event, "Discord event", "event", event.discord_event_enabled, busy),
        _toggle(event, "Thread", "thread", event.thread_enabled, busy),
        _button(event, raid_extras_copy.LENGTH_BUTTON, "length", busy),
    )
    back = button("Back", BUTTON_STYLE_SECONDARY, raid_custom_id.encode("ed", event.id, "back"), disabled=busy)
    actions = action_row(back)
    if event.message_id is not None and any(state in _RETRYABLE for state in states):
        actions = action_row(_button(event, raid_extras_copy.TRY_AGAIN, "retry", busy, BUTTON_STYLE_PRIMARY), back)
    return ephemeral_data("\n".join(lines), components=[toggles, actions], embeds=[])


def length_modal(event: WowRaidEvent) -> dict[str, Any]:
    """How long the raid runs, starting from the raid's ('3h'); empty = 3 hours."""
    field = text_box(
        raid_extras_copy.LENGTH_LABEL,
        raid_extras_copy.LENGTH_HINT,
        style=TEXT_INPUT_STYLE_SHORT,
        value=deadline_prefill(event.length_minutes),
        max_length=LENGTH_MAX,
        required=False,
        placeholder=raid_extras_copy.LENGTH_PLACEHOLDER,
    )
    return event_form(event, "length", raid_extras_copy.LENGTH_TITLE, field)


def _toggle(event: WowRaidEvent, name: str, part: str, enabled: bool, busy: bool) -> dict[str, Any]:
    """[Discord event: on] — green while on; the id names the state a tap switches it to."""
    style = BUTTON_STYLE_SECONDARY
    target = f"{part}_on"
    if enabled:
        style = BUTTON_STYLE_SUCCESS
        target = f"{part}_off"
    return _button(event, raid_extras_copy.toggle_label(name, enabled), target, busy, style)


def _button(
    event: WowRaidEvent, label: str, verb: str, busy: bool, style: int = BUTTON_STYLE_SECONDARY
) -> dict[str, Any]:
    return button(label, style, raid_custom_id.encode("xt", event.id, verb), disabled=busy)
