"""Private (ephemeral) message bodies for the raid bot — pure builders.

The public signup post lives in :mod:`app.services.wow.raid_embed`; this
module renders everything only the clicking user sees: the create preview,
the class and spec selects, "My signup", the full roster, /raid list,
/raid prefs, the cancel confirmation and the "free my seat?" confirmation.
"""
from __future__ import annotations

from collections.abc import Sequence
from datetime import datetime
from typing import Any, Final
from zoneinfo import ZoneInfo

from platform_shared.services.discord import (
    BUTTON_STYLE_DANGER,
    BUTTON_STYLE_SECONDARY,
    BUTTON_STYLE_SUCCESS,
    COMPONENT_TYPE_ACTION_ROW,
    COMPONENT_TYPE_BUTTON,
    COMPONENT_TYPE_STRING_SELECT,
    EmojiSet,
)

from app.models.wow.wow_raid_event import WowRaidEvent
from app.models.wow.wow_raid_guild import WowRaidGuild
from app.models.wow.wow_raid_member_pref import WowRaidMemberPref
from app.models.wow.wow_raid_signup import WowRaidSignup
from app.services.discord import raid_copy
from app.services.discord.interaction import ephemeral_data
from app.services.discord.rest import message_link
from app.services.wow import raid_custom_id
from app.services.wow.raid_catalog import (
    CLASSES,
    CLASSES_BY_KEY,
    ROLE_DESCRIPTIONS,
    ROLE_FIELD_LABELS,
    ROLE_ORDER,
    WowSpecInfo,
    saved_spec,
    signup_label,
)
from app.services.wow.raid_embed import (
    COLOR_OPEN,
    display_title,
    escape_name,
    local_day_label,
    seats_label,
    spec_icon,
    status_heading,
)
from app.services.wow.raid_roster import (
    ABSENCE_STATUS,
    BENCH_STATUS,
    QUEUED_STATUS,
    TENTATIVE_STATUS,
    compute_roster_summary,
    in_line_order,
    order_numbers,
    queue_position,
)

EMBED_DESCRIPTION_LIMIT: Final = 4096

# Second line on "My signup" for statuses that don't speak for themselves.
_MY_SIGNUP_NOTES: Final[dict[str, str]] = {
    TENTATIVE_STATUS: raid_copy.TENTATIVE_NOTE,
    QUEUED_STATUS: raid_copy.QUEUE_MOVES_UP,
    BENCH_STATUS: raid_copy.BENCH_NOTE,
}

_STATUS_WORDS: Final[dict[str, str]] = {
    "confirmed": "signed up",
    "late": "coming late",
    "tentative": "tentative",
    "bench": "on the bench",
    "absence": "absent",
}


# ---------------------------------------------------------------------------
# Shared formatting
# ---------------------------------------------------------------------------


def unix(moment: datetime) -> int:
    return int(moment.timestamp())


def local_clock_label(moment: datetime, tz_name: str) -> str:
    """'8:00 PM' in the guild's timezone."""
    local = moment.astimezone(ZoneInfo(tz_name))
    return f"{local:%I:%M %p}".lstrip("0")


def event_choice_label(event: WowRaidEvent, tz_name: str) -> str:
    """Autocomplete label, e.g. 'Sat Oct 10 8pm Onyxia' (≤ 100 chars)."""
    local = event.starts_at.astimezone(ZoneInfo(tz_name))
    clock = f"{local:%I:%M%p}".lstrip("0").lower().replace(":00", "")
    return f"{local:%a %b} {local.day} {clock} {display_title(event)}"[:100]


def _button(label: str, style: int, custom_id: str, *, emoji: dict[str, str] | None = None) -> dict[str, Any]:
    button: dict[str, Any] = {"type": COMPONENT_TYPE_BUTTON, "style": style, "label": label, "custom_id": custom_id}
    if emoji is not None:
        button["emoji"] = emoji
    return button


def _option(
    label: str, value: str, emoji: dict[str, str] | None, *, description: str | None = None, default: bool = False
) -> dict[str, Any]:
    option: dict[str, Any] = {"label": label, "value": value}
    if description is not None:
        option["description"] = description
    if emoji is not None:
        option["emoji"] = emoji
    if default:
        option["default"] = True
    return option


def _row(*components: dict[str, Any]) -> dict[str, Any]:
    return {"type": COMPONENT_TYPE_ACTION_ROW, "components": list(components)}


# ---------------------------------------------------------------------------
# /raid-admin create preview, cancel confirmation, seat confirmation
# ---------------------------------------------------------------------------


def preview_data(event: WowRaidEvent, guild: WowRaidGuild, *, notice: str | None = None) -> dict[str, Any]:
    stamp = unix(event.starts_at)
    lines: list[str] = []
    if notice:
        lines.extend([notice, ""])
    lines.append(f"**{display_title(event)} ({event.size_cap}-man)**")
    lines.append(f"<t:{stamp}:F> (<t:{stamp}:R>)")
    if event.notes:
        lines.append(f"Notes: {event.notes}")
    lines.append(
        f"That's {local_clock_label(event.starts_at, guild.timezone)} {guild.timezone}. Does this look right?"
    )
    components = [
        _row(
            _button("Post raid", BUTTON_STYLE_SUCCESS, raid_custom_id.encode("confirm", event.id)),
            _button("Cancel", BUTTON_STYLE_SECONDARY, raid_custom_id.encode("discard", event.id)),
        )
    ]
    return ephemeral_data("\n".join(lines), components=components)


def release_confirm_data(event: WowRaidEvent, status: str) -> dict[str, Any]:
    """Ask before a seat holder's seat goes to the queue (see ``hands_seat_to_queue``)."""
    components = [
        _row(
            _button("Yes, free my seat", BUTTON_STYLE_DANGER, raid_custom_id.encode("release", event.id, status)),
            _button("Keep my seat", BUTTON_STYLE_SECONDARY, raid_custom_id.encode("stay", event.id)),
        )
    ]
    return ephemeral_data(raid_copy.release_prompt(status), components=components)


def cancel_confirm_data(event: WowRaidEvent) -> dict[str, Any]:
    components = [
        _row(
            _button("Cancel raid", BUTTON_STYLE_DANGER, raid_custom_id.encode("cancel", event.id)),
            _button("Keep raid", BUTTON_STYLE_SECONDARY, raid_custom_id.encode("keep", event.id)),
        )
    ]
    content = raid_copy.cancel_prompt(display_title(event), unix(event.starts_at))
    if event.cancel_reason:
        content += f"\nReason: {event.cancel_reason}"
    return ephemeral_data(content, components=components)


# ---------------------------------------------------------------------------
# Class and spec selects
# ---------------------------------------------------------------------------


def class_picker_data(event: WowRaidEvent, status: str, *, emojis: EmojiSet) -> dict[str, Any]:
    select = {
        "type": COMPONENT_TYPE_STRING_SELECT,
        "custom_id": raid_custom_id.encode("class", event.id, status),
        "placeholder": "Pick your class",
        "min_values": 1,
        "max_values": 1,
        "options": [_option(cls.label, cls.key, emojis.component(cls.key)) for cls in CLASSES],
    }
    return ephemeral_data(raid_copy.CLASS_PROMPT, components=[_row(select)])


def spec_picker_data(
    event: WowRaidEvent, status: str, wow_class: str, *, current: WowSpecInfo | None, emojis: EmojiSet
) -> dict[str, Any]:
    """The class's specs; *current* (the player's spec, never a guess) is preselected.

    Discord sends nothing when the preselected option is picked again, so
    only the spec the player actually has may be marked default.
    """
    info = CLASSES_BY_KEY[wow_class]
    options = [
        _option(
            spec.label,
            spec.choice_value,
            emojis.component(spec.icon) or emojis.component(wow_class),
            description=ROLE_DESCRIPTIONS[spec.display_role],
            default=spec == current,
        )
        for spec in info.specs
    ]
    select = {
        "type": COMPONENT_TYPE_STRING_SELECT,
        "custom_id": raid_custom_id.encode("spec", event.id, wow_class, status),
        "placeholder": "Pick your spec",
        "min_values": 1,
        "max_values": 1,
        "options": options,
    }
    other_class = _button("Different class", BUTTON_STYLE_SECONDARY, raid_custom_id.encode("pickclass", event.id, status))
    content = raid_copy.spec_prompt(info.label)
    if current is not None:
        content = raid_copy.spec_switch_prompt(current.full_label)
    return ephemeral_data(content, components=[_row(select), _row(other_class)])


# ---------------------------------------------------------------------------
# My signup / Roster
# ---------------------------------------------------------------------------


def my_signup_data(
    event: WowRaidEvent, signup: WowRaidSignup | None, signups: Sequence[WowRaidSignup]
) -> dict[str, Any]:
    if signup is None:
        return ephemeral_data(raid_copy.NOT_SIGNED_UP)
    status_text = _STATUS_WORDS.get(signup.status, signup.status)
    if signup.status == QUEUED_STATUS:
        status_text = raid_copy.queue_place(queue_position(signups, signup.discord_user_id))
    content = f"For **{display_title(event)}** you're **{status_text}**"
    if signup.status == ABSENCE_STATUS:
        return ephemeral_data(f"{content}.")
    if signup.wow_class or signup.role:
        content += f" as {signup_label(signup.wow_class, signup.role, signup.spec)}"
    content += "."
    note = _MY_SIGNUP_NOTES.get(signup.status)
    if note is not None:
        content += f"\n{note}"
    change = _button("Change class or spec", BUTTON_STYLE_SECONDARY, raid_custom_id.encode("change", event.id))
    return ephemeral_data(content, components=[_row(change)])


def roster_data(
    event: WowRaidEvent, signups: Sequence[WowRaidSignup], guild: WowRaidGuild, *, emojis: EmojiSet
) -> dict[str, Any]:
    """Everyone, by role then status.

    Seat holders carry their order number (`12`); the queue lists each
    player's place in it (#1 moves up first).
    """
    ordered = in_line_order(signups)
    summary = compute_roster_summary(ordered, size_cap=event.size_cap)
    seat_marks = {user_id: f"`{number}`" for user_id, number in order_numbers(ordered).items()}
    queue_marks = {s.discord_user_id: f"#{place}" for place, s in enumerate(summary.queue, start=1)}
    sections: list[str] = []

    for role in ROLE_ORDER:
        players = [s for s in ordered if s.status == "confirmed" and s.role == role]
        sections.append(_section(f"{ROLE_FIELD_LABELS[role]} ({len(players)})", players, emojis, seat_marks))
    unassigned = [s for s in ordered if s.status == "confirmed" and s.role not in ROLE_ORDER]
    if unassigned:
        sections.append(_section(f"No role yet ({len(unassigned)})", unassigned, emojis, seat_marks))
    late = [s for s in ordered if s.status == "late"]
    if late:
        sections.append(_section(status_heading("late", "Late", len(late)), late, emojis, seat_marks))
    tentative = [s for s in ordered if s.status == TENTATIVE_STATUS]
    if tentative:
        sections.append(_section(status_heading(TENTATIVE_STATUS, "Tentative", len(tentative)), tentative, emojis, {}))
    if summary.queue:
        heading = status_heading(QUEUED_STATUS, "Queued", summary.queued_count)
        sections.append(_section(heading, summary.queue, emojis, queue_marks))
    bench = [s for s in ordered if s.status == BENCH_STATUS]
    if bench:
        sections.append(_section(status_heading(BENCH_STATUS, "Bench", len(bench)), bench, emojis, {}))
    absent = [s for s in ordered if s.status == ABSENCE_STATUS]
    if absent:
        sections.append(f"**Absence ({len(absent)})**\n" + ", ".join(escape_name(s.display_name) for s in absent))

    description = _clip_lines("\n\n".join(sections), EMBED_DESCRIPTION_LIMIT)
    embed = {
        "title": f"Roster — {display_title(event)} — {local_day_label(event.starts_at, guild.timezone)}",
        "description": description,
        "color": COLOR_OPEN,
        "footer": {"text": f"{seats_label(summary)} · Signed up {summary.signed_up_count}"},
    }
    return ephemeral_data("", embeds=[embed])


def _clip_lines(text: str, limit: int) -> str:
    """Cut at a line break so an icon's ``<:name:id>`` markup is never split.

    The "…" goes on a line of its own, so the last name shown reads whole.
    """
    if len(text) <= limit:
        return text
    cut = text.rfind("\n", 0, limit - 1)
    if cut <= 0:
        return text[: limit - 1] + "…"
    return text[:cut] + "\n…"


def _section(
    heading: str, players: Sequence[WowRaidSignup], emojis: EmojiSet, marks: dict[str, str]
) -> str:
    """One line per player: icon, their mark (order number or queue place) if any, name."""
    if not players:
        return f"**{heading}**\n—"
    lines = []
    for player in players:
        parts = [
            spec_icon(player.wow_class, player.spec, emojis),
            marks.get(player.discord_user_id, ""),
            escape_name(player.display_name),
        ]
        lines.append(" ".join(part for part in parts if part))
    return f"**{heading}**\n" + "\n".join(lines)


# ---------------------------------------------------------------------------
# /raid list and /raid prefs
# ---------------------------------------------------------------------------


def list_data(
    guild_discord_id: str,
    events: Sequence[WowRaidEvent],
    signups_by_event: dict[Any, list[WowRaidSignup]],
) -> dict[str, Any]:
    if not events:
        return ephemeral_data(raid_copy.NO_UPCOMING)
    lines = ["**Upcoming raids**"]
    for event in events:
        summary = compute_roster_summary(signups_by_event.get(event.id, []), size_cap=event.size_cap)
        line = f"**{display_title(event)}** — <t:{unix(event.starts_at)}:F> · {summary.seats_taken}/{event.size_cap} confirmed"
        if event.message_id:
            line += f" · [Open]({message_link(guild_discord_id, event.channel_id, event.message_id)})"
        lines.append(line)
    return ephemeral_data("\n".join(lines))


def prefs_data(pref: WowRaidMemberPref | None, *, heading: str | None = None) -> dict[str, Any]:
    lines = []
    if heading:
        lines.append(heading)
    lines.append(_signing_up_as(pref))
    others = _other_saved_specs(pref)
    if others:
        lines.append(f"Also saved: {', '.join(spec.full_label for spec in others)}")
    reminder_state = "on"
    if pref is not None and pref.dm_opt_out:
        reminder_state = "off"
    lines.append(f"DM reminders: **{reminder_state}**")
    lines.append("Change these with `/raid prefs class: spec: dm_reminders:`.")
    test_button = _button("Send me a test DM", BUTTON_STYLE_SECONDARY, raid_custom_id.encode("testdm"))
    return ephemeral_data("\n".join(lines), components=[_row(test_button)])


def _signing_up_as(pref: WowRaidMemberPref | None) -> str:
    if pref is None or pref.default_wow_class not in CLASSES_BY_KEY:
        return "Signing up as: not set yet. I'll ask the first time you tap **Sign up**."
    spec = saved_spec(pref.saved_specs, pref.default_wow_class)
    if spec is not None:
        return f"Signing up as: **{spec.full_label}**"
    class_label = CLASSES_BY_KEY[pref.default_wow_class].label
    return f"Signing up as: **{class_label}**. I'll ask your spec the first time you tap **Sign up**."


def _other_saved_specs(pref: WowRaidMemberPref | None) -> list[WowSpecInfo]:
    """Saved specs for classes other than the default, in class order."""
    if pref is None:
        return []
    specs = [saved_spec(pref.saved_specs, cls.key) for cls in CLASSES if cls.key != pref.default_wow_class]
    return [spec for spec in specs if spec is not None]
