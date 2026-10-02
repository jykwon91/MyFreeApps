"""Private (ephemeral) message bodies for the raid bot — pure builders.

The public signup post lives in :mod:`app.services.wow.raid_embed`; this
module renders everything only the clicking user sees: the create preview,
the class and spec selects, the My sign-up card, the full roster,
/raid list, /raid prefs, the cancel confirmation and the "free my seat?"
confirmation.
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
    TANK_COLUMN,
    TANK_SPECS,
    WowSpecInfo,
    column_icon,
    column_specs,
    saved_spec,
    signup_label,
)
from app.services.wow.raid_embed import (
    COLOR_OPEN,
    STATUS_LISTS,
    build_signup_embed,
    column_heading,
    roster_entry,
)
from app.services.wow.raid_post_buttons import build_signup_components
from app.services.wow.raid_post_layout import post_columns, with_status
from app.services.wow.raid_roster import (
    ABSENCE_STATUS,
    BENCH_STATUS,
    QUEUED_STATUS,
    TENTATIVE_STATUS,
    compute_roster_summary,
    order_numbers,
    queue_position,
)
from app.services.wow.raid_text import (
    display_title,
    escape_markdown,
    escape_name,
    icon_text,
    local_day_label,
    seats_label,
    signup_icon,
    status_heading,
)

EMBED_DESCRIPTION_LIMIT: Final = 4096

# The My sign-up card's status line: (label, icon).  The queue shows its place instead.
_STATUS_LINES: Final[dict[str, tuple[str, str]]] = {
    "confirmed": ("Signed up", "status_signed"),
    "late": ("Late", "status_late"),
    TENTATIVE_STATUS: ("Tentative", "status_tentative"),
    BENCH_STATUS: ("On the bench", "status_bench"),
    ABSENCE_STATUS: ("Absent", "status_absence"),
}
# Second line on My sign-up for statuses that don't speak for themselves.
_MY_SIGNUP_NOTES: Final[dict[str, str]] = {
    TENTATIVE_STATUS: raid_copy.TENTATIVE_NOTE,
    QUEUED_STATUS: raid_copy.QUEUE_MOVES_UP,
    BENCH_STATUS: raid_copy.BENCH_NOTE,
}


# ---------------------------------------------------------------------------
# Shared formatting
# ---------------------------------------------------------------------------


def unix(moment: datetime) -> int:
    return int(moment.timestamp())


def event_choice_label(event: WowRaidEvent, tz_name: str) -> str:
    """Autocomplete label, e.g. 'Sat Oct 10 8pm Onyxia's Lair' (≤ 100 chars)."""
    local = event.starts_at.astimezone(ZoneInfo(tz_name))
    clock = f"{local:%I:%M%p}".lstrip("0").lower().replace(":00", "")
    return f"{local:%a %b} {local.day} {clock} {display_title(event)}"[:100]


def button(label: str, style: int, custom_id: str, *, emoji: dict[str, str] | None = None) -> dict[str, Any]:
    component: dict[str, Any] = {"type": COMPONENT_TYPE_BUTTON, "style": style, "label": label, "custom_id": custom_id}
    if emoji is not None:
        component["emoji"] = emoji
    return component


def _back_to_card(event: WowRaidEvent) -> dict[str, Any]:
    """[Back] to the My sign-up card a menu or the roster was opened from."""
    return button("Back", BUTTON_STYLE_SECONDARY, raid_custom_id.encode("card", event.id, "back"))


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


def action_row(*components: dict[str, Any]) -> dict[str, Any]:
    return {"type": COMPONENT_TYPE_ACTION_ROW, "components": list(components)}


def _select(custom_id: str, placeholder: str, options: list[dict[str, Any]]) -> dict[str, Any]:
    return {
        "type": COMPONENT_TYPE_STRING_SELECT,
        "custom_id": custom_id,
        "placeholder": placeholder,
        "min_values": 1,
        "max_values": 1,
        "options": options,
    }


def _tank_label(spec: WowSpecInfo) -> str:
    """'Feral Druid' — where every option is a tank, '(tank)' goes without saying."""
    return spec.full_label.removesuffix(" (tank)")


# ---------------------------------------------------------------------------
# /raid-admin create preview, cancel confirmation, seat confirmation
# ---------------------------------------------------------------------------


def preview_data(
    event: WowRaidEvent, guild: WowRaidGuild, *, emojis: EmojiSet, notice: str | None = None
) -> dict[str, Any]:
    """The post exactly as it will look (its buttons greyed out), then [Post raid] / [Cancel]."""
    intro = raid_copy.preview_intro(event.channel_id, guild.ping_role_id)
    if notice:
        intro = f"{notice}\n\n{intro}"
    actions = action_row(
        button("Post raid", BUTTON_STYLE_SUCCESS, raid_custom_id.encode("confirm", event.id)),
        button("Cancel", BUTTON_STYLE_SECONDARY, raid_custom_id.encode("discard", event.id)),
    )
    post_buttons = build_signup_components(event, [], emojis=emojis)  # disabled until it's posted
    return ephemeral_data(
        intro,
        components=[*post_buttons, actions],
        embeds=[build_signup_embed(event, [], guild, emojis=emojis)],
    )


def release_confirm_data(event: WowRaidEvent, status: str) -> dict[str, Any]:
    """Ask before a seat holder's seat goes to the queue (see ``hands_seat_to_queue``)."""
    components = [
        action_row(
            button("Yes, free my seat", BUTTON_STYLE_DANGER, raid_custom_id.encode("release", event.id, status)),
            button("Keep my seat", BUTTON_STYLE_SECONDARY, raid_custom_id.encode("stay", event.id)),
        )
    ]
    return ephemeral_data(raid_copy.release_prompt(status), components=components)


def cancel_confirm_data(event: WowRaidEvent) -> dict[str, Any]:
    components = [
        action_row(
            button("Cancel raid", BUTTON_STYLE_DANGER, raid_custom_id.encode("cancel", event.id)),
            button("Keep raid", BUTTON_STYLE_SECONDARY, raid_custom_id.encode("keep", event.id)),
        )
    ]
    content = raid_copy.cancel_prompt(display_title(event), unix(event.starts_at))
    if event.cancel_reason:
        content += f"\nReason: {event.cancel_reason}"
    return ephemeral_data(content, components=components)


# ---------------------------------------------------------------------------
# Class and spec selects
# ---------------------------------------------------------------------------


def class_picker_data(event: WowRaidEvent, status: str, *, emojis: EmojiSet, back: bool = False) -> dict[str, Any]:
    """Tank, then the classes — the same columns as the buttons on the post.

    *back* adds [Back] to the My sign-up card the menu was opened from.
    """
    tanks = [_tank_label(spec) for spec in TANK_SPECS]
    tank = _option(
        "Tank",
        TANK_COLUMN,
        emojis.component(column_icon(TANK_COLUMN)),
        description=", ".join(tanks[:-1]) + f" or {tanks[-1]}",
    )
    classes = [_option(cls.label, cls.key, emojis.component(cls.key)) for cls in CLASSES]
    select = _select(raid_custom_id.encode("class", event.id, status), "Pick your class", [tank, *classes])
    rows = [action_row(select)]
    if back:
        rows.append(action_row(_back_to_card(event)))
    return ephemeral_data(raid_copy.CLASS_PROMPT, components=rows)


def spec_picker_data(
    event: WowRaidEvent,
    status: str,
    column: str,
    *,
    current: WowSpecInfo | None,
    emojis: EmojiSet,
    back: bool = False,
) -> dict[str, Any]:
    """The column's specs (a class's, or every tank spec); *current* is preselected.

    *current* is the player's spec, never a guess: Discord sends nothing
    when the preselected option is picked again.  *back* adds [Back] to the
    My sign-up card the menu was opened from.
    """
    select = _select(
        raid_custom_id.encode("spec", event.id, column, status),
        "Pick your spec",
        [_spec_option(spec, column, current, emojis) for spec in column_specs(column)],
    )
    buttons = [button("Different class", BUTTON_STYLE_SECONDARY, raid_custom_id.encode("pickclass", event.id, status))]
    if back:
        buttons.append(_back_to_card(event))
    return ephemeral_data(_spec_prompt(column, current), components=[action_row(select), action_row(*buttons)])


def _spec_option(spec: WowSpecInfo, column: str, current: WowSpecInfo | None, emojis: EmojiSet) -> dict[str, Any]:
    emoji = emojis.component(spec.icon) or emojis.component(spec.class_key)
    if column == TANK_COLUMN:
        return _option(_tank_label(spec), spec.choice_value, emoji, default=spec == current)
    description = ROLE_DESCRIPTIONS[spec.display_role]
    if spec.column == TANK_COLUMN:
        description = raid_copy.TANK_SPEC_NOTE
    return _option(spec.label, spec.choice_value, emoji, description=description, default=spec == current)


def _spec_prompt(column: str, current: WowSpecInfo | None) -> str:
    if current is not None:
        return raid_copy.spec_switch_prompt(current.full_label)
    if column == TANK_COLUMN:
        return raid_copy.TANK_PROMPT
    return raid_copy.spec_prompt(CLASSES_BY_KEY[column].label)


# ---------------------------------------------------------------------------
# My sign-up card / Roster
# ---------------------------------------------------------------------------


def my_signup_data(
    event: WowRaidEvent, signup: WowRaidSignup | None, signups: Sequence[WowRaidSignup], *, emojis: EmojiSet
) -> dict[str, Any]:
    """Your status and spec for this raid, with [Change spec] and [Full roster].

    Once the leader closes sign-ups, [Change spec] goes and the card says so.
    """
    roster = button("Full roster", BUTTON_STYLE_SECONDARY, raid_custom_id.encode("card", event.id, "roster"))
    closed = event.closed_at is not None
    if signup is None:
        text = raid_copy.CLOSED if closed else raid_copy.NOT_SIGNED_UP
        return ephemeral_data(text, components=[action_row(roster)], embeds=[])
    lines = [
        f"**Your sign-up** · {escape_markdown(display_title(event))} · <t:{unix(event.starts_at)}:F>",
        f"Status: {_status_text(signup, signups, emojis)}",
    ]
    buttons = [roster]
    if signup.status != ABSENCE_STATUS:
        if signup.wow_class is not None:
            label = f"**{signup_label(signup.wow_class, signup.role, signup.spec)}**"
            lines.append(" ".join(part for part in ("Spec:", signup_icon(signup, emojis), label) if part))
        if not closed:
            buttons.insert(0, button("Change spec", BUTTON_STYLE_SECONDARY, raid_custom_id.encode("change", event.id)))
    note = raid_copy.CLOSED if closed else _MY_SIGNUP_NOTES.get(signup.status)
    if note is not None:
        lines.append(note)
    return ephemeral_data("\n".join(lines), components=[action_row(*buttons)], embeds=[])


def _status_text(signup: WowRaidSignup, signups: Sequence[WowRaidSignup], emojis: EmojiSet) -> str:
    """'{icon} **Late**' — the queue shows its place: '#2 in the queue'."""
    if signup.status == QUEUED_STATUS:
        place = raid_copy.queue_place(queue_position(signups, signup.discord_user_id))
        return icon_text(emojis, "status_queued", f"**{place}**")
    label, icon = _STATUS_LINES.get(signup.status, (signup.status, ""))
    return icon_text(emojis, icon, f"**{label}**")


def roster_data(
    event: WowRaidEvent,
    signups: Sequence[WowRaidSignup],
    guild: WowRaidGuild,
    *,
    emojis: EmojiSet,
    back: bool = False,
) -> dict[str, Any]:
    """Everyone, laid out like the post's columns, with full names.

    Seat holders and the queue carry their order number (`12`); the queue is
    struck through.  Tentative, bench and absence follow, one per line.
    *back* adds [Back] to the My sign-up card it was opened from.
    """
    summary = compute_roster_summary(signups, size_cap=event.size_cap)
    numbers = order_numbers(signups)
    sections: list[str] = []
    for column, players in post_columns(signups).items():
        if players:
            entries = [roster_entry(player, numbers.get(player.discord_user_id), emojis) for player in players]
            sections.append("\n".join([f"**{column_heading(column, len(players), emojis)}**", *entries]))
    for status, label, icon in STATUS_LISTS:
        players = with_status(signups, status)
        if players:
            heading = icon_text(emojis, icon, status_heading(status, label, len(players)))
            entries = [f"{signup_icon(player, emojis)} {escape_name(player.display_name)}".strip() for player in players]
            sections.append("\n".join([f"**{heading}**", *entries]))

    embed = {
        "title": f"Roster — {display_title(event)} — {local_day_label(event.starts_at, guild.timezone)}",
        "description": clip_lines("\n\n".join(sections) or raid_copy.NOBODY_SIGNED_UP, EMBED_DESCRIPTION_LIMIT),
        "color": COLOR_OPEN,
        "footer": {"text": f"{seats_label(summary)} · Signed up {summary.signed_up_count}"},
    }
    components: list[dict[str, Any]] = []
    if back:
        components.append(action_row(_back_to_card(event)))
    return ephemeral_data("", components=components, embeds=[embed])


def clip_lines(text: str, limit: int) -> str:
    """Cut at a line break so an icon's ``<:name:id>`` markup is never split.

    The "…" goes on a line of its own, so the last name shown reads whole.
    """
    if len(text) <= limit:
        return text
    cut = text.rfind("\n", 0, limit - 1)
    if cut <= 0:
        return text[: limit - 1] + "…"
    return text[:cut] + "\n…"


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
        if event.closed_at is not None:
            line += " · sign-ups closed"
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
    test_button = button("Send me a test DM", BUTTON_STYLE_SECONDARY, raid_custom_id.encode("testdm"))
    return ephemeral_data("\n".join(lines), components=[action_row(test_button)])


def _signing_up_as(pref: WowRaidMemberPref | None) -> str:
    if pref is None or pref.default_wow_class not in CLASSES_BY_KEY:
        return "Signing up as: not set yet. I'll ask the first time you tap your class on a raid post."
    spec = saved_spec(pref.saved_specs, pref.default_wow_class)
    if spec is not None:
        return f"Signing up as: **{spec.full_label}**"
    class_label = CLASSES_BY_KEY[pref.default_wow_class].label
    return f"Signing up as: **{class_label}**. I'll ask your spec the first time you tap your class on a raid post."


def _other_saved_specs(pref: WowRaidMemberPref | None) -> list[WowSpecInfo]:
    """Saved specs for classes other than the default, in class order."""
    if pref is None:
        return []
    specs = [saved_spec(pref.saved_specs, cls.key) for cls in CLASSES if cls.key != pref.default_wow_class]
    return [spec for spec in specs if spec is not None]
