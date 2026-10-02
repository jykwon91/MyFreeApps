"""Copy raid's form — pure builders.

* :func:`copy_modal` — Raid: Edit → [Copy raid]: when the copy starts,
  suggested a week after the raid (``raid_repeat.copy_suggestion``).
"""
from __future__ import annotations

from datetime import datetime
from typing import Any

from platform_shared.services.discord import TEXT_INPUT_STYLE_SHORT

from app.models.wow.wow_raid_event import WowRaidEvent
from app.services.discord import raid_copy, raid_repeat_copy
from app.services.discord.raid_edit_views import WHEN_MAX, when_prefill
from app.services.discord.raid_forms import event_form, text_box
from app.services.wow.raid_repeat import copy_suggestion


def copy_modal(event: WowRaidEvent, tz_name: str, *, now: datetime) -> dict[str, Any]:
    """The copy's date and time in the server's timezone, read like Date & Time's."""
    field = text_box(
        raid_copy.when_label(tz_name),
        raid_copy.WHEN_HINT,
        style=TEXT_INPUT_STYLE_SHORT,
        value=when_prefill(copy_suggestion(event.starts_at, tz_name, now), tz_name),
        max_length=WHEN_MAX,
        required=True,
    )
    return event_form(event, "copy", raid_repeat_copy.COPY_MODAL, field)
