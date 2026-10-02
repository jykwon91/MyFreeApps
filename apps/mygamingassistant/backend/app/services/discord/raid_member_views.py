"""My sign-up — the private card a member opens from the raid post — its forms and asking card; pure builders.

The card is text lines (no embed): what the last tap did, if anything, then
the raid, your status, spec and character name, your note for the leader
while the raid takes notes, and a hint for statuses that don't speak for
themselves.  Its buttons come in two rows: what you can change ([Change
spec] [Character name] [Add note]), then [Full roster] and [Forget my
specs].  The reply to a tap that made you late, tentative or absent asks
why, with [Add reason] (the same note form).
"""
from __future__ import annotations

import uuid
from collections.abc import Sequence
from typing import Any, Final

from platform_shared.services.discord import (
    BUTTON_STYLE_DANGER,
    BUTTON_STYLE_SECONDARY,
    TEXT_INPUT_STYLE_SHORT,
    EmojiSet,
)

from app.models.wow.wow_raid_event import WowRaidEvent
from app.models.wow.wow_raid_member_pref import WowRaidMemberPref
from app.models.wow.wow_raid_signup import CHARACTER_NAME_MAX, NOTE_MAX, WowRaidSignup
from app.services.discord import raid_copy, raid_member_copy
from app.services.discord.interaction import ephemeral_data
from app.services.discord.raid_forms import event_form, text_box
from app.services.discord.raid_views import action_row, button, saved_labels, unix
from app.services.wow import raid_custom_id
from app.services.wow.raid_catalog import signup_label
from app.services.wow.raid_note import shown_note
from app.services.wow.raid_roster import (
    ABSENCE_STATUS,
    BENCH_STATUS,
    QUEUED_STATUS,
    TENTATIVE_STATUS,
    queue_position,
)
from app.services.wow.raid_text import escape_name, escape_note, icon_text, signup_icon, title_text

# The card's status line: (label, icon).  The queue shows its place instead.
_STATUS_LINES: Final[dict[str, tuple[str, str]]] = {
    "confirmed": ("Signed up", "status_signed"),
    "late": ("Late", "status_late"),
    TENTATIVE_STATUS: ("Tentative", "status_tentative"),
    BENCH_STATUS: ("On the bench", "status_bench"),
    ABSENCE_STATUS: ("Absent", "status_absence"),
}
# The card's last line for statuses that don't speak for themselves.
_MY_SIGNUP_NOTES: Final[dict[str, str]] = {
    TENTATIVE_STATUS: raid_copy.TENTATIVE_NOTE,
    QUEUED_STATUS: raid_copy.QUEUE_MOVES_UP,
    BENCH_STATUS: raid_copy.BENCH_NOTE,
}


def my_signup_data(
    event: WowRaidEvent,
    signup: WowRaidSignup | None,
    signups: Sequence[WowRaidSignup],
    *,
    emojis: EmojiSet,
    can_forget: bool = False,
    notice: str | None = None,
) -> dict[str, Any]:
    """Your status, spec and character name for this raid, with what you can change.

    [Change spec] goes once the leader closes sign-ups, and the card says
    so; [Character name] stays until the raid starts.  Both need a class
    and a status other than absence.  While the raid takes notes, any
    sign-up shows its note and [Add note] / [Edit note].  [Forget my specs]
    shows on a sign-up when *can_forget* (a class or spec is saved).
    *notice* (what the last tap did) goes on top.
    """
    lines = []
    if notice is not None:
        lines.append(notice)
    roster = button("Full roster", BUTTON_STYLE_SECONDARY, raid_custom_id.encode("card", event.id, "roster"))
    closed = event.closed_at is not None
    if signup is None:
        lines.append(_not_signed_up(closed))
        return ephemeral_data("\n".join(lines), components=[action_row(roster)], embeds=[])
    lines.append(f"**Your sign-up** · {title_text(event)} · <t:{unix(event.starts_at)}:F>")
    lines.append(f"Status: {_status_text(signup, signups, emojis)}")
    changes = []
    if signup.status != ABSENCE_STATUS:
        if not closed:
            changes.append(button("Change spec", BUTTON_STYLE_SECONDARY, raid_custom_id.encode("change", event.id)))
        if signup.wow_class is not None:
            label = f"**{signup_label(signup.wow_class, signup.role, signup.spec)}**"
            lines.append(" ".join(part for part in ("Spec:", signup_icon(signup, emojis), label) if part))
            lines.append(_character_line(signup))
            custom_id = raid_custom_id.encode("card", event.id, "char")
            changes.append(button(raid_member_copy.CHARACTER_BUTTON, BUTTON_STYLE_SECONDARY, custom_id))
    if event.signup_notes_enabled:
        lines.append(_note_line(signup))
        changes.append(_note_button(event, signup))
    note = _MY_SIGNUP_NOTES.get(signup.status)
    if closed:
        note = raid_copy.CLOSED
    if note is not None:
        lines.append(note)
    rows = []
    if changes:
        rows.append(action_row(*changes))
    bottom = [roster]
    if can_forget:
        forget = raid_custom_id.encode("card", event.id, "forget")
        bottom.append(button(raid_member_copy.FORGET_BUTTON, BUTTON_STYLE_SECONDARY, forget))
    rows.append(action_row(*bottom))
    return ephemeral_data("\n".join(lines), components=rows, embeds=[])


def _not_signed_up(closed: bool) -> str:
    if closed:
        return raid_copy.CLOSED
    return raid_copy.NOT_SIGNED_UP


def _status_text(signup: WowRaidSignup, signups: Sequence[WowRaidSignup], emojis: EmojiSet) -> str:
    """'{icon} **Late**' — the queue shows its place: '#2 in the queue'."""
    if signup.status == QUEUED_STATUS:
        place = raid_copy.queue_place(queue_position(signups, signup.discord_user_id))
        return icon_text(emojis, "status_queued", f"**{place}**")
    label, icon = _STATUS_LINES.get(signup.status, (signup.status, ""))
    return icon_text(emojis, icon, f"**{label}**")


def _character_line(signup: WowRaidSignup) -> str:
    if signup.character_name is None:
        return raid_member_copy.CHARACTER_NOT_SET
    return raid_member_copy.character_line(escape_name(signup.character_name))


def _note_line(signup: WowRaidSignup) -> str:
    if signup.note is None:
        return raid_member_copy.NOTE_NOT_SET
    return raid_member_copy.note_line(escape_note(signup.note))


def _note_button(event: WowRaidEvent, signup: WowRaidSignup) -> dict[str, Any]:
    label = raid_member_copy.NOTE_EDIT
    if signup.note is None:
        label = raid_member_copy.NOTE_ADD
    return button(label, BUTTON_STYLE_SECONDARY, raid_custom_id.encode("card", event.id, "note"))


def note_lines(event: WowRaidEvent, signup: WowRaidSignup) -> list[str]:
    """The leader's player card: 'Note: "..."' while the raid takes notes and there's one, else nothing."""
    note = shown_note(event, signup)
    if note is None:
        return []
    return [raid_member_copy.note_line(escape_note(note))]


def note_form(event: WowRaidEvent, name: str, signup: WowRaidSignup) -> dict[str, Any]:
    """The note form (type 9) holding the note there now; *name* says where it opened (``note`` / ``reason``)."""
    box = text_box(
        raid_member_copy.NOTE_LABEL,
        raid_member_copy.NOTE_HINT,
        style=TEXT_INPUT_STYLE_SHORT,
        value=signup.note,
        max_length=NOTE_MAX,
        required=False,
        placeholder=raid_member_copy.note_placeholder(signup.status),
    )
    return event_form(event, name, raid_member_copy.NOTE_TITLE, box)


def reason_row(event_id: uuid.UUID) -> dict[str, Any]:
    """[Add reason] under the reply to a tap: the note form."""
    custom_id = raid_custom_id.encode("card", event_id, "reason")
    return action_row(button(raid_member_copy.REASON_BUTTON, BUTTON_STYLE_SECONDARY, custom_id))


def reason_text(text: str | None, status: str) -> str:
    """The reply so far (if anything), then 'You're marked **late**. Want to tell the raid leader why?'."""
    return "\n".join(part for part in (text, raid_member_copy.reason_prompt(status)) if part)


def reason_offer_data(event_id: uuid.UUID, text: str) -> dict[str, Any]:
    """A private reply asking why (*text* from ``reason_text``), with [Add reason]."""
    return ephemeral_data(text, components=[reason_row(event_id)], embeds=[])


def character_form(event: WowRaidEvent, name: str | None) -> dict[str, Any]:
    """[Character name]'s form (type 9), *name* typed in: the sign-up's, else the one saved for its class."""
    box = text_box(
        raid_member_copy.CHARACTER_LABEL,
        raid_member_copy.CHARACTER_HINT,
        style=TEXT_INPUT_STYLE_SHORT,
        value=name,
        max_length=CHARACTER_NAME_MAX,
        required=False,
        placeholder=raid_member_copy.CHARACTER_PLACEHOLDER,
    )
    return event_form(event, "char", raid_member_copy.CHARACTER_TITLE, box)


def forget_confirm_data(event: WowRaidEvent, pref: WowRaidMemberPref | None) -> dict[str, Any]:
    """[Forget my specs] asks first: what's saved, then [Yes, forget them] / [Keep them] (back to the card)."""
    lines = [
        raid_member_copy.FORGET_PROMPT,
        raid_member_copy.forget_saved(saved_labels(pref)),
        raid_member_copy.FORGET_AFTER,
    ]
    yes = raid_custom_id.encode("card", event.id, "forgetyes")
    keep = raid_custom_id.encode("card", event.id, "back")
    row = action_row(
        button(raid_member_copy.FORGET_YES, BUTTON_STYLE_DANGER, yes),
        button(raid_member_copy.FORGET_KEEP, BUTTON_STYLE_SECONDARY, keep),
    )
    return ephemeral_data("\n".join(lines), components=[row], embeds=[])
