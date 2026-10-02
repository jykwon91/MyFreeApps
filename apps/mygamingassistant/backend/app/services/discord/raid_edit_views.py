"""Raid: Edit's private card, menus and forms — pure builders.

Right-click a raid post → Apps → **Raid: Edit** opens the edit card: the
raid as it stands — title, leader, date and time, description, banner and
color — with a button for each, then [Cancel raid] [Delete raid] [Done].

* Title, Date & Time, Description, Image and Cancel raid open a form
  (type 9) holding what's there now; its submit shows the card again,
  saying what changed.
* Leader and Color swap the card for a menu (type 7) with [Back].
* Delete raid asks first: [Delete raid] [Keep it].
* After a move, the card offers [Tell them in channel] while anyone is
  on the raid.

A raid that's cancelled or finished can only be deleted.
"""
from __future__ import annotations

from datetime import datetime
from typing import Any, Final
from zoneinfo import ZoneInfo

from platform_shared.services.discord import (
    BUTTON_STYLE_DANGER,
    BUTTON_STYLE_PRIMARY,
    BUTTON_STYLE_SECONDARY,
    COMPONENT_TYPE_LABEL,
    COMPONENT_TYPE_STRING_SELECT,
    COMPONENT_TYPE_TEXT_INPUT,
    COMPONENT_TYPE_USER_SELECT,
    TEXT_INPUT_STYLE_PARAGRAPH,
    TEXT_INPUT_STYLE_SHORT,
)

from app.models.wow.wow_raid_event import WowRaidEvent
from app.services.discord import raid_copy
from app.services.discord.interaction import ephemeral_data, modal_response
from app.services.discord.raid_leader_views import raid_line
from app.services.discord.raid_views import action_row, button, unix
from app.services.wow import raid_custom_id
from app.services.wow.raid_banners import banner_url
from app.services.wow.raid_colors import RAID_COLORS, RaidColor, color_of
from app.services.wow.raid_details import (
    DESCRIPTION_MAX,
    IMAGE_URL_MAX,
    REASON_MAX,
    TITLE_MAX,
    leader_id,
    leader_name,
)
from app.services.wow.raid_embed import post_color
from app.services.wow.raid_text import display_title, escape_name, title_text

# Each form's one input.
FIELD: Final = "value"
WHEN_MAX: Final = 40


# ---------------------------------------------------------------------------
# The edit card
# ---------------------------------------------------------------------------


def edit_card(event: WowRaidEvent, *, notice: str | None = None, notify_count: int = 0) -> dict[str, Any]:
    """The raid as it stands, with a button per thing to change.

    *notice* says what just changed (else the card asks what to change).
    *notify_count* — after a move, how many people are on the raid: the
    card offers to tell them in the raid's channel.
    """
    embed: dict[str, Any] = {
        "title": "Edit raid",
        "description": "\n".join(_detail_lines(event)),
        "color": post_color(event),
        "footer": {"text": f"ID {str(event.id)[:6]} · {raid_copy.EDIT_FOOTER}"},
    }
    banner = event.image_url or banner_url(event.raid_key)
    if banner is not None:
        embed["thumbnail"] = {"url": banner}

    if event.status != "scheduled":
        rows = [action_row(_edit_button(event, "Delete raid", "delete", BUTTON_STYLE_DANGER), _done_button(event))]
        return ephemeral_data(notice or raid_copy.EDIT_GONE_PROMPT, components=rows, embeds=[embed])

    content = notice or raid_copy.EDIT_PROMPT
    rows = [
        action_row(
            _edit_button(event, "Title", "title"),
            _edit_button(event, "Leader", "leader"),
            _edit_button(event, "Date & Time", "when"),
        ),
        action_row(
            _edit_button(event, "Description", "desc"),
            _edit_button(event, "Image", "image"),
            _edit_button(event, "Color", "color"),
        ),
        action_row(
            _edit_button(event, "Cancel raid", "cancel", BUTTON_STYLE_DANGER),
            _edit_button(event, "Delete raid", "delete", BUTTON_STYLE_DANGER),
            _done_button(event),
        ),
    ]
    if notify_count:
        content = f"{content}\n{raid_copy.notify_offer(notify_count)}"
        notify = button(raid_copy.NOTIFY_BUTTON, BUTTON_STYLE_PRIMARY, raid_custom_id.encode("lc", event.id, "notify"))
        rows.insert(0, action_row(notify))
    return ephemeral_data(content, components=rows, embeds=[embed])


def _detail_lines(event: WowRaidEvent) -> list[str]:
    starts = unix(event.starts_at)
    return [
        f"**Title:** {title_text(event)}",
        f"**Leader:** {leader_text(event)}",
        f"**Date & Time:** <t:{starts}:F> (<t:{starts}:R>)",
        f"**Image:** {_image_text(event)}",
        f"**Color:** {_color_text(event)}",
        *_description_lines(event),
    ]


def leader_text(event: WowRaidEvent) -> str:
    """The leader's name as captured, else a mention of them."""
    name = leader_name(event)
    if name:
        return escape_name(name)
    return f"<@{leader_id(event)}>"


def _image_text(event: WowRaidEvent) -> str:
    if event.image_url:
        return f"[Your image]({event.image_url})"
    return "The raid's own banner"


def _color_text(event: WowRaidEvent) -> str:
    color = color_of(event.color)
    if color is None:
        return f"#{event.color:06X}"
    return f"{color.swatch} {color.label}"


def _description_lines(event: WowRaidEvent) -> list[str]:
    """The description quoted as the post shows it, last so a long one doesn't split the card."""
    if not event.notes:
        return ["**Description:** *none*"]
    return ["**Description:**", *(f"> {line}" for line in event.notes.splitlines())]


def _edit_button(event: WowRaidEvent, label: str, action: str, style: int = BUTTON_STYLE_SECONDARY) -> dict[str, Any]:
    return button(label, style, raid_custom_id.encode("ed", event.id, action))


def _done_button(event: WowRaidEvent) -> dict[str, Any]:
    return _edit_button(event, "Done", "done", BUTTON_STYLE_PRIMARY)


def _back_button(event: WowRaidEvent, label: str = "Back") -> dict[str, Any]:
    return _edit_button(event, label, "back")


# ---------------------------------------------------------------------------
# Leader and Color menus
# ---------------------------------------------------------------------------


def leader_picker(event: WowRaidEvent, *, notice: str | None = None) -> dict[str, Any]:
    """Any member of the server; bots are turned away when picked."""
    select = {
        "type": COMPONENT_TYPE_USER_SELECT,
        "custom_id": raid_custom_id.encode("pick", event.id, "leader"),
        "placeholder": "Pick the raid's leader",
        "min_values": 1,
        "max_values": 1,
    }
    lines = [raid_line(event), f"**Leader:** {leader_text(event)}", notice or raid_copy.LEADER_PROMPT]
    rows = [action_row(select), action_row(_back_button(event))]
    return ephemeral_data("\n".join(lines), components=rows, embeds=[])


def color_picker(event: WowRaidEvent) -> dict[str, Any]:
    """The six colors, the raid's own marked."""
    current = color_of(event.color)
    select = {
        "type": COMPONENT_TYPE_STRING_SELECT,
        "custom_id": raid_custom_id.encode("pick", event.id, "color"),
        "placeholder": "Pick a color",
        "min_values": 1,
        "max_values": 1,
        "options": [_color_option(color, current) for color in RAID_COLORS],
    }
    rows = [action_row(select), action_row(_back_button(event))]
    return ephemeral_data(f"{raid_line(event)}\n{raid_copy.COLOR_PROMPT}", components=rows, embeds=[])


def _color_option(color: RaidColor, current: RaidColor | None) -> dict[str, Any]:
    option: dict[str, Any] = {"label": color.label, "value": color.key, "emoji": {"name": color.swatch}}
    if color == current:
        option["default"] = True
    return option


# ---------------------------------------------------------------------------
# Delete check
# ---------------------------------------------------------------------------


def delete_check(event: WowRaidEvent, signups: int) -> dict[str, Any]:
    """Ask before deleting: nobody is told, unlike Cancel raid."""
    rows = [
        action_row(
            button("Delete raid", BUTTON_STYLE_DANGER, raid_custom_id.encode("del", event.id)),
            _back_button(event, "Keep it"),
        )
    ]
    text = raid_copy.delete_prompt(title_text(event), signups, can_cancel=event.status == "scheduled")
    return ephemeral_data(text, components=rows, embeds=[])


# ---------------------------------------------------------------------------
# Forms
# ---------------------------------------------------------------------------


def title_modal(event: WowRaidEvent) -> dict[str, Any]:
    field = _field(
        raid_copy.TITLE_LABEL,
        raid_copy.TITLE_HINT,
        style=TEXT_INPUT_STYLE_SHORT,
        value=display_title(event),
        max_length=TITLE_MAX,
        required=True,
    )
    return _modal(event, "title", raid_copy.TITLE_MODAL, field)


def when_modal(event: WowRaidEvent, tz_name: str) -> dict[str, Any]:
    """Date and time in the server's timezone, starting from the raid's."""
    field = _field(
        raid_copy.when_label(tz_name),
        raid_copy.WHEN_HINT,
        style=TEXT_INPUT_STYLE_SHORT,
        value=when_prefill(event.starts_at, tz_name),
        max_length=WHEN_MAX,
        required=True,
    )
    return _modal(event, "when", raid_copy.WHEN_MODAL, field)


def description_modal(event: WowRaidEvent) -> dict[str, Any]:
    field = _field(
        raid_copy.DESC_LABEL,
        raid_copy.DESC_HINT,
        style=TEXT_INPUT_STYLE_PARAGRAPH,
        value=event.notes,
        max_length=DESCRIPTION_MAX,
        required=False,
    )
    return _modal(event, "desc", raid_copy.DESC_MODAL, field)


def image_modal(event: WowRaidEvent) -> dict[str, Any]:
    field = _field(
        raid_copy.IMAGE_LABEL,
        raid_copy.IMAGE_HINT,
        style=TEXT_INPUT_STYLE_SHORT,
        value=event.image_url,
        max_length=IMAGE_URL_MAX,
        required=False,
    )
    return _modal(event, "image", raid_copy.IMAGE_MODAL, field)


def cancel_modal(event: WowRaidEvent) -> dict[str, Any]:
    field = _field(
        raid_copy.CANCEL_LABEL,
        raid_copy.CANCEL_HINT,
        style=TEXT_INPUT_STYLE_SHORT,
        value=None,
        max_length=REASON_MAX,
        required=False,
    )
    return _modal(event, "cancel", raid_copy.CANCEL_MODAL, field)


def when_prefill(starts_at: datetime, tz_name: str) -> str:
    """'10/14/2026 8:00pm' — the start in the server's timezone, as the form reads it."""
    local = starts_at.astimezone(ZoneInfo(tz_name))
    clock = f"{local.hour % 12 or 12}:{local:%M}{local:%p}".lower()
    return f"{local.month}/{local.day}/{local.year} {clock}"


def _field(
    label: str, hint: str, *, style: int, value: str | None, max_length: int, required: bool
) -> dict[str, Any]:
    text_input: dict[str, Any] = {
        "type": COMPONENT_TYPE_TEXT_INPUT,
        "custom_id": FIELD,
        "style": style,
        "max_length": max_length,
        "required": required,
    }
    if required:
        text_input["min_length"] = 1
    if value:
        text_input["value"] = value[:max_length]
    return {"type": COMPONENT_TYPE_LABEL, "label": label, "description": hint, "component": text_input}


def _modal(event: WowRaidEvent, name: str, title: str, field: dict[str, Any]) -> dict[str, Any]:
    return modal_response(raid_custom_id.encode("m", event.id, name), title, [field])
