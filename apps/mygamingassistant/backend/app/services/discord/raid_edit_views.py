"""Raid: Edit's private card, menus and forms — pure builders.

Right-click a raid post → Apps → **Raid: Edit** opens the edit card: the
raid as it stands — title, leader, date and time, description, banner,
color and its role and class limits — with a button for each, then
[Copy raid] [Cancel raid] [Delete raid] [Done].

* Title, Date & Time, Deadline, Description, Image, Role limits, Class
  limits and Cancel raid open a form (type 9) holding what's there now;
  its submit shows the card again, saying what changed.
* Leader and Color swap the card for a menu (type 7) with [Back].
* Sign-ups swaps it for Manage sign-ups (``raid_manage_views``).
* Notes: off / Notes: on lets members leave the leader a note, or hides
  the notes (``raid_note``); the card comes back saying which.
* Copy raid opens a form for the copy's date and time, then shows the
  copy on the create preview (``components/raid_duplicate``).
* Delete raid asks first: [Delete raid] [Keep it].
* After a move, the card offers [Tell them in channel] while anyone is
  on the raid.

A raid that's cancelled or finished can be copied or deleted.
"""
from __future__ import annotations

from datetime import datetime
from typing import Any, Final
from zoneinfo import ZoneInfo

from platform_shared.services.discord import (
    BUTTON_STYLE_DANGER,
    BUTTON_STYLE_PRIMARY,
    BUTTON_STYLE_SECONDARY,
    COMPONENT_TYPE_STRING_SELECT,
    COMPONENT_TYPE_USER_SELECT,
    TEXT_INPUT_STYLE_PARAGRAPH,
    TEXT_INPUT_STYLE_SHORT,
)

from app.models.wow.wow_raid_event import WowRaidEvent
from app.services.discord import raid_copy, raid_deadline_copy, raid_limit_copy, raid_manage_copy, raid_member_copy
from app.services.discord.interaction import ephemeral_data, modal_response
# FIELD is re-exported: the forms' submit handlers read the box by it.
from app.services.discord.raid_forms import FIELD as FIELD
from app.services.discord.raid_forms import event_form, text_box
from app.services.discord.raid_leader_views import raid_line
from app.services.discord.raid_views import action_row, button, unix
from app.services.wow import raid_custom_id
from app.services.wow.raid_banners import banner_url
from app.services.wow.raid_colors import RAID_COLORS, RaidColor, color_of
from app.services.wow.raid_deadline import deadline_prefill
from app.services.wow.raid_details import (
    DESCRIPTION_MAX,
    IMAGE_URL_MAX,
    REASON_MAX,
    TITLE_MAX,
    leader_id,
    leader_name,
)
from app.services.wow.raid_embed import post_color
from app.services.wow.raid_limit_forms import class_form_prefill
from app.services.wow.raid_limits import LIMIT_ROLES, Limits
from app.services.wow.raid_text import display_title, escape_name, title_text

WHEN_MAX: Final = 40
DEADLINE_MAX: Final = 16
ROLE_LIMIT_MAX: Final = 3
CLASS_LIMITS_MAX: Final = 500


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
    # The raid's own art, not the leader's link: should Discord ever refuse
    # that link, the card that changes it must still open.
    banner = banner_url(event.raid_key)
    if banner is not None:
        embed["thumbnail"] = {"url": banner}

    if event.status != "scheduled":
        delete = _edit_button(event, "Delete raid", "delete", BUTTON_STYLE_DANGER)
        rows = [action_row(_copy_button(event), delete, _done_button(event))]
        return ephemeral_data(notice or raid_copy.EDIT_GONE_PROMPT, components=rows, embeds=[embed])

    content = notice or raid_copy.EDIT_PROMPT
    rows = [
        action_row(
            _edit_button(event, "Title", "title"),
            _edit_button(event, "Leader", "leader"),
            _edit_button(event, "Date & Time", "when"),
            _edit_button(event, "Deadline", "deadline"),
        ),
        action_row(
            _edit_button(event, "Description", "desc"),
            _edit_button(event, "Image", "image"),
            _edit_button(event, "Color", "color"),
        ),
        action_row(
            _edit_button(event, "Role limits", "role_limits"),
            _edit_button(event, "Class limits", "class_limits"),
            button(raid_manage_copy.EDIT_BUTTON, BUTTON_STYLE_SECONDARY, raid_custom_id.manage(event.id, "open")),
            notes_button(event),
        ),
        action_row(
            _copy_button(event),
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
    limits = Limits.of(event)
    return [
        f"**Title:** {title_text(event)}",
        f"**Leader:** {leader_text(event)}",
        f"**Date & Time:** <t:{starts}:F> (<t:{starts}:R>)",
        *raid_deadline_copy.deadline_lines(event),
        f"**Image:** {_image_text(event)}",
        f"**Color:** {_color_text(event)}",
        raid_limit_copy.role_limits_line(limits.roles),
        raid_limit_copy.class_limits_line(limits.classes),
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


def notes_button(event: WowRaidEvent) -> dict[str, Any]:
    """[Notes: off] / [Notes: on] — where notes stand; a tap switches them (its id names the new state)."""
    enabled = bool(event.signup_notes_enabled)
    action = "notes_on"
    if enabled:
        action = "notes_off"
    return _edit_button(event, raid_member_copy.notes_toggle_label(enabled), action)


def _done_button(event: WowRaidEvent) -> dict[str, Any]:
    return _edit_button(event, "Done", "done", BUTTON_STYLE_PRIMARY)


def _copy_button(event: WowRaidEvent) -> dict[str, Any]:
    """[Copy raid]: a new raid with this one's settings (``components/raid_duplicate``)."""
    return button("Copy raid", BUTTON_STYLE_SECONDARY, raid_custom_id.encode("cp", event.id))


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
    field = text_box(
        raid_copy.TITLE_LABEL,
        raid_copy.TITLE_HINT,
        style=TEXT_INPUT_STYLE_SHORT,
        value=display_title(event),
        max_length=TITLE_MAX,
        required=True,
    )
    return event_form(event, "title", raid_copy.TITLE_MODAL, field)


def when_modal(event: WowRaidEvent, tz_name: str) -> dict[str, Any]:
    """Date and time in the server's timezone, starting from the raid's."""
    field = text_box(
        raid_copy.when_label(tz_name),
        raid_copy.WHEN_HINT,
        style=TEXT_INPUT_STYLE_SHORT,
        value=when_prefill(event.starts_at, tz_name),
        max_length=WHEN_MAX,
        required=True,
    )
    return event_form(event, "when", raid_copy.WHEN_MODAL, field)


def deadline_modal(event: WowRaidEvent) -> dict[str, Any]:
    """How long before the start sign-ups close, starting from the raid's ('2h'); empty = at the start."""
    field = text_box(
        raid_deadline_copy.LABEL,
        raid_deadline_copy.HINT,
        style=TEXT_INPUT_STYLE_SHORT,
        value=deadline_prefill(event.signup_deadline_minutes),
        max_length=DEADLINE_MAX,
        required=False,
        placeholder=raid_deadline_copy.PLACEHOLDER,
    )
    return event_form(event, "deadline", raid_deadline_copy.MODAL_TITLE, field)


def description_modal(event: WowRaidEvent) -> dict[str, Any]:
    field = text_box(
        raid_copy.DESC_LABEL,
        raid_copy.DESC_HINT,
        style=TEXT_INPUT_STYLE_PARAGRAPH,
        value=event.notes,
        max_length=DESCRIPTION_MAX,
        required=False,
    )
    return event_form(event, "desc", raid_copy.DESC_MODAL, field)


def image_modal(event: WowRaidEvent) -> dict[str, Any]:
    field = text_box(
        raid_copy.IMAGE_LABEL,
        raid_copy.IMAGE_HINT,
        style=TEXT_INPUT_STYLE_SHORT,
        value=event.image_url,
        max_length=IMAGE_URL_MAX,
        required=False,
    )
    return event_form(event, "image", raid_copy.IMAGE_MODAL, field)


def cancel_modal(event: WowRaidEvent) -> dict[str, Any]:
    field = text_box(
        raid_copy.CANCEL_LABEL,
        raid_copy.CANCEL_HINT,
        style=TEXT_INPUT_STYLE_SHORT,
        value=None,
        max_length=REASON_MAX,
        required=False,
    )
    return event_form(event, "cancel", raid_copy.CANCEL_MODAL, field)


def reason_modal(custom_id: str, *, hint: str = raid_manage_copy.REASON_HINT) -> dict[str, Any]:
    """Manage sign-ups' "say why" form, *hint* under its box; it carries the custom_id of the button that opened it."""
    field = text_box(
        raid_manage_copy.REASON_LABEL,
        hint,
        style=TEXT_INPUT_STYLE_SHORT,
        value=None,
        max_length=REASON_MAX,
        required=True,
    )
    return modal_response(custom_id, raid_manage_copy.REASON_TITLE, [field])


def role_limits_modal(event: WowRaidEvent) -> dict[str, Any]:
    """A box per role holding its limit; an empty box is no limit.  The hint goes on the first."""
    roles = Limits.of(event).roles
    fields = []
    for role in LIMIT_ROLES:
        hint = None
        if not fields:
            hint = raid_limit_copy.ROLE_HINT
        value = None
        if role in roles:
            value = str(roles[role])
        fields.append(
            text_box(
                raid_limit_copy.ROLE_FIELD_LABELS[role],
                hint,
                style=TEXT_INPUT_STYLE_SHORT,
                value=value,
                max_length=ROLE_LIMIT_MAX,
                required=False,
                custom_id=role,
                placeholder=raid_limit_copy.ROLE_PLACEHOLDER,
            )
        )
    return event_form(event, "role_limits", raid_limit_copy.ROLE_MODAL, *fields)


def class_limits_modal(event: WowRaidEvent) -> dict[str, Any]:
    """Every class on its own line with its limit ('Rogue: 3', 'Warrior: no limit')."""
    field = text_box(
        raid_limit_copy.CLASS_LABEL,
        raid_limit_copy.CLASS_HINT,
        style=TEXT_INPUT_STYLE_PARAGRAPH,
        value=class_form_prefill(Limits.of(event).classes),
        max_length=CLASS_LIMITS_MAX,
        required=False,
        placeholder=raid_limit_copy.CLASS_PLACEHOLDER,
    )
    return event_form(event, "class_limits", raid_limit_copy.CLASS_MODAL, field)


def when_prefill(starts_at: datetime, tz_name: str) -> str:
    """'10/14/2026 8:00pm' — the start in the server's timezone, as the form reads it."""
    local = starts_at.astimezone(ZoneInfo(tz_name))
    clock = f"{local.hour % 12 or 12}:{local:%M}{local:%p}".lower()
    return f"{local.month}/{local.day}/{local.year} {clock}"
