"""Private cards for the raid post's right-click menu — pure builders.

Raid: Close / Raid: Open answer with a card that names the raid, says where
its sign-ups stand and offers the opposite ([Reopen sign-ups] / [Close
sign-ups]).  Raid: Signed lists everyone on the raid for its leader, column
by column like the post, then tentative, bench and absence, then the
players' notes while the raid takes them, with [Ping signed members] and
[Manage sign-ups] (``raid_manage_views``), then [Attendance]
(``raid_attendance_views``) once the raid has started; the ping's message
form lives here too.
"""
from __future__ import annotations

from collections.abc import Sequence
from typing import Any, Final

from platform_shared.services.discord import (
    BUTTON_STYLE_PRIMARY,
    BUTTON_STYLE_SECONDARY,
    COMPONENT_TYPE_LABEL,
    COMPONENT_TYPE_TEXT_INPUT,
    TEXT_INPUT_STYLE_PARAGRAPH,
    EmojiSet,
)

from app.models.wow.wow_raid_event import WowRaidEvent
from app.models.wow.wow_raid_signup import NOTE_MAX, WowRaidSignup
from app.services.discord import raid_attendance_copy, raid_copy, raid_manage_copy, raid_member_copy, raid_unsigned_copy
from app.services.discord.interaction import ephemeral_data, modal_response
from app.services.discord.raid_views import EMBED_DESCRIPTION_LIMIT, action_row, button, clip_lines, unix
from app.services.wow import raid_custom_id
from app.services.wow.raid_catalog import CLASSES_BY_KEY, TANK_COLUMN, effective_spec
from app.services.wow.raid_deadline import CLOSED_HINT
from app.services.wow.raid_embed import STATUS_LISTS, column_heading, post_color
from app.services.wow.raid_note import shown_note
from app.services.wow.raid_post_layout import post_columns, with_status
from app.services.wow.raid_roster import QUEUED_STATUS, compute_roster_summary, listed_user_ids
from app.services.wow.raid_text import display_title, escape_note, icon_text, signed_name, status_heading, title_text

# The ping form's one input, and how long a message it takes.
PING_FIELD: Final = "message"
PING_MAX_CHARS: Final = 500
# How long each note runs on Raid: Signed when they don't all fit in full.
SHORT_NOTE_CHARS: Final = 40

# Said after the spec of a line player who isn't simply confirmed.
_LINE_MARKERS: Final[dict[str, str]] = {"late": "late", QUEUED_STATUS: "queued"}


def raid_line(event: WowRaidEvent) -> str:
    """'**Onyxia's Lair** · <t:X:F>' — which raid a card is about."""
    return f"**{title_text(event)}** · <t:{unix(event.starts_at)}:F>"


# ---------------------------------------------------------------------------
# Raid: Close / Raid: Open
# ---------------------------------------------------------------------------


def closed_card(event: WowRaidEvent, text: str) -> dict[str, Any]:
    """Where the raid's sign-ups stand now, with the button that flips them."""
    if event.closed_at is None:
        flip = button("Close sign-ups", BUTTON_STYLE_SECONDARY, raid_custom_id.encode("lc", event.id, "close"))
    else:
        flip = button("Reopen sign-ups", BUTTON_STYLE_SECONDARY, raid_custom_id.encode("lc", event.id, "reopen"))
    return ephemeral_data(f"{raid_line(event)}\n{text}", components=[action_row(flip)], embeds=[])


# ---------------------------------------------------------------------------
# Raid: Signed and the ping
# ---------------------------------------------------------------------------


def signed_data(
    event: WowRaidEvent,
    signups: Sequence[WowRaidSignup],
    *,
    emojis: EmojiSet,
    notice: str | None = None,
) -> dict[str, Any]:
    """Everyone on the raid as 'Name (Spec)', column by column, for its leader.

    Late and queued players say so after their spec; tentative, bench and
    absence follow with the full spec name.  While the raid takes notes,
    the players' notes follow the list.  While the raid is on, [Manage
    sign-ups] and [Not signed up] show, after [Ping signed members] once
    anyone is listed; [Attendance] follows once it has started, and stands
    alone once it's done.
    *notice* goes above the list, e.g. why a ping didn't go out.
    """
    summary = compute_roster_summary(signups, size_cap=event.size_cap)
    head = [raid_line(event)]
    if event.closed_at is not None:
        head.append(icon_text(emojis, "info_lock", f"**{CLOSED_HINT}**"))
    sections = ["\n".join(head)]
    for column, players in post_columns(signups).items():
        if players:
            entries = ", ".join(_column_entry(player, column) for player in players)
            sections.append(f"**{column_heading(column, len(players), emojis)}**\n{entries}")
    for status, label, icon in STATUS_LISTS:
        players = with_status(signups, status)
        if players:
            heading = icon_text(emojis, icon, status_heading(status, label, len(players)))
            sections.append(f"**{heading}**\n" + ", ".join(_list_entry(player) for player in players))
    if len(sections) == 1:
        sections.append(raid_copy.NOBODY_SIGNED_UP)

    embed = {
        "title": f"Signed up ({summary.seats_taken}/{summary.size_cap})",
        "description": clip_lines(_with_notes(event, signups, "\n\n".join(sections)), EMBED_DESCRIPTION_LIMIT),
        "color": post_color(event),
        "footer": {"text": f"Raid ID {str(event.id)[:6]}"},
    }
    components: list[dict[str, Any]] = []
    if event.status == "scheduled":
        manage = button(raid_manage_copy.SIGNED_BUTTON, BUTTON_STYLE_SECONDARY, raid_custom_id.manage(event.id, "open"))
        unsigned = raid_custom_id.encode("un", event.id, "open")
        buttons = [manage, button(raid_unsigned_copy.SIGNED_BUTTON, BUTTON_STYLE_SECONDARY, unsigned)]
        if listed_user_ids(signups):
            ping = button("Ping signed members", BUTTON_STYLE_PRIMARY, raid_custom_id.encode("lc", event.id, "ping"))
            buttons.insert(0, ping)
        if event.start_applied_at is not None:
            buttons.append(_attendance_button(event))
        components.append(action_row(*buttons))
    elif event.status == "completed":
        components.append(action_row(_attendance_button(event)))
    return ephemeral_data(notice or "", components=components, embeds=[embed])


def _attendance_button(event: WowRaidEvent) -> dict[str, Any]:
    attendance = raid_custom_id.attendance(event.id, "open")
    return button(raid_attendance_copy.ATTENDANCE_BUTTON, BUTTON_STYLE_SECONDARY, attendance)


def _with_notes(event: WowRaidEvent, signups: Sequence[WowRaidSignup], text: str) -> str:
    """*text* (the list), then '**Notes (2)**' and a line per note in sign-up order: 'Alice - "Running late"'.

    Notes never push players off the list: when they don't fit in full,
    each is cut to ``SHORT_NOTE_CHARS``, and when that doesn't fit either a
    line says where to read them.  Nothing follows while notes are off.
    """
    noted = [(signed_name(signup), note) for signup in signups if (note := shown_note(event, signup)) is not None]
    if not noted:
        return text
    heading = f"{text}\n\n**Notes ({len(noted)})**"
    for max_chars in (NOTE_MAX, SHORT_NOTE_CHARS):
        lines = [f'{name} - "{escape_note(note, max_chars=max_chars)}"' for name, note in noted]
        described = "\n".join([heading, *lines])
        if len(described) <= EMBED_DESCRIPTION_LIMIT:
            return described
    return f"{heading}\n{raid_member_copy.NOTES_DID_NOT_FIT}"


def _column_entry(signup: WowRaidSignup, column: str) -> str:
    """'Alice (Fury)'; under Tanks 'Alice (Protection Warrior)'; 'Bob (Fury, late)'."""
    details: list[str] = []
    spec = effective_spec(signup.wow_class, signup.role, signup.spec)
    if spec is not None and column == TANK_COLUMN:
        details.append(spec.full_label.removesuffix(" (tank)"))
    elif spec is not None:
        details.append(spec.label)
    marker = _LINE_MARKERS.get(signup.status)
    if marker is not None:
        details.append(marker)
    return _entry(signup, details)


def _list_entry(signup: WowRaidSignup) -> str:
    """'Alice (Fury Warrior)' — off the columns, the class goes with the spec."""
    spec = effective_spec(signup.wow_class, signup.role, signup.spec)
    if spec is not None:
        return _entry(signup, [spec.full_label])
    wow_class = CLASSES_BY_KEY.get(signup.wow_class or "")
    if wow_class is not None:
        return _entry(signup, [wow_class.label])
    return _entry(signup, [])


def _entry(signup: WowRaidSignup, details: list[str]) -> str:
    name = signed_name(signup)
    if details:
        return f"{name} ({', '.join(details)})"
    return name


def ping_modal(event: WowRaidEvent) -> dict[str, Any]:
    """[Ping signed members] — the message to send, prefilled with a reminder."""
    message = {
        "type": COMPONENT_TYPE_TEXT_INPUT,
        "custom_id": PING_FIELD,
        "style": TEXT_INPUT_STYLE_PARAGRAPH,
        "min_length": 1,
        "max_length": PING_MAX_CHARS,
        "required": True,
        "value": raid_copy.ping_prefill(display_title(event))[:PING_MAX_CHARS],
    }
    field = {
        "type": COMPONENT_TYPE_LABEL,
        "label": raid_copy.PING_FIELD_LABEL,
        "description": raid_copy.PING_FIELD_HINT,
        "component": message,
    }
    return modal_response(raid_custom_id.encode("m", event.id, "ping"), raid_copy.PING_MODAL_TITLE, [field])
