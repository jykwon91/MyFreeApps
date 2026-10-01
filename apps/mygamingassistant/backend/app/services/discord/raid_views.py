"""Private (ephemeral) message bodies for the raid bot — pure builders.

The public signup post lives in :mod:`app.services.wow.raid_embed`; this
module renders everything only the clicking user sees: the create preview,
the first-time class/role picker, "My signup", the full roster, /raid list,
/raid prefs and the cancel confirmation.
"""
from __future__ import annotations

from collections.abc import Sequence
from datetime import datetime
from typing import Any, Final
from zoneinfo import ZoneInfo

from platform_shared.services.discord import (
    BUTTON_STYLE_DANGER,
    BUTTON_STYLE_PRIMARY,
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
    ROLE_FIELD_LABELS,
    ROLE_LABELS,
    ROLE_ORDER,
    class_role_label,
)
from app.services.wow.raid_embed import (
    COLOR_OPEN,
    class_icon,
    display_title,
    escape_name,
    local_day_label,
)
from app.services.wow.raid_roster import compute_roster_summary

EMBED_DESCRIPTION_LIMIT: Final = 4096

_STATUS_WORDS: Final[dict[str, str]] = {
    "confirmed": "signed up",
    "tentative": "tentative",
    "late": "coming late",
    "declined": "declined",
    "bench": "on the bench",
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


def _option(label: str, value: str, emoji: dict[str, str] | None) -> dict[str, Any]:
    option: dict[str, Any] = {"label": label, "value": value}
    if emoji is not None:
        option["emoji"] = emoji
    return option


def _row(*components: dict[str, Any]) -> dict[str, Any]:
    return {"type": COMPONENT_TYPE_ACTION_ROW, "components": list(components)}


# ---------------------------------------------------------------------------
# /raid-admin create preview + cancel confirmation
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
# First-time signup picker
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


def role_picker_data(event: WowRaidEvent, status: str, wow_class: str, *, emojis: EmojiSet) -> dict[str, Any]:
    info = CLASSES_BY_KEY[wow_class]
    buttons = [
        _button(
            ROLE_LABELS[role],
            BUTTON_STYLE_PRIMARY,
            raid_custom_id.encode("role", event.id, status, wow_class, role),
            emoji=emojis.component(f"role_{role}"),
        )
        for role in info.roles
    ]
    return ephemeral_data(f"Which role will you play as a {info.label}?", components=[_row(*buttons)])


# ---------------------------------------------------------------------------
# My signup / Roster
# ---------------------------------------------------------------------------


def my_signup_data(
    event: WowRaidEvent, signup: WowRaidSignup | None, signups: Sequence[WowRaidSignup]
) -> dict[str, Any]:
    if signup is None:
        return ephemeral_data(raid_copy.NOT_SIGNED_UP)
    status_text = _STATUS_WORDS.get(signup.status, signup.status)
    if signup.status == "bench":
        bench = compute_roster_summary(signups, size_cap=event.size_cap).bench_overflow
        position = next((i for i, s in enumerate(bench, start=1) if s.discord_user_id == signup.discord_user_id), None)
        if position is not None:
            status_text = f"on the bench (#{position} in line)"
    content = f"For **{display_title(event)}** you're **{status_text}**"
    if signup.wow_class or signup.role:
        content += f" as {class_role_label(signup.wow_class, signup.role)}"
    content += "."
    if signup.status == "declined":
        return ephemeral_data(content)
    change = _button("Change class or role", BUTTON_STYLE_SECONDARY, raid_custom_id.encode("change", event.id))
    return ephemeral_data(content, components=[_row(change)])


def roster_data(
    event: WowRaidEvent, signups: Sequence[WowRaidSignup], guild: WowRaidGuild, *, emojis: EmojiSet
) -> dict[str, Any]:
    ordered = sorted(signups, key=lambda s: s.signed_up_at)
    summary = compute_roster_summary(ordered, size_cap=event.size_cap)
    sections: list[str] = []

    for role in ROLE_ORDER:
        players = [s for s in ordered if s.status == "confirmed" and s.role == role]
        sections.append(_section(f"{ROLE_FIELD_LABELS[role]} ({len(players)})", players, emojis))
    unassigned = [s for s in ordered if s.status == "confirmed" and s.role not in ROLE_ORDER]
    if unassigned:
        sections.append(_section(f"No role yet ({len(unassigned)})", unassigned, emojis))
    for status, label in (("late", "Late"), ("tentative", "Tentative")):
        players = [s for s in ordered if s.status == status]
        if players:
            sections.append(_section(f"{label} ({len(players)})", players, emojis))
    if summary.bench_overflow:
        sections.append(
            _section(f"Bench ({summary.bench_count}), in line order", summary.bench_overflow, emojis, numbered=True)
        )
    declined = [s for s in ordered if s.status == "declined"]
    if declined:
        sections.append(f"**Declined ({len(declined)})**\n" + ", ".join(escape_name(s.display_name) for s in declined))

    description = _clip_lines("\n\n".join(sections), EMBED_DESCRIPTION_LIMIT)
    embed = {
        "title": f"Roster — {display_title(event)} — {local_day_label(event.starts_at, guild.timezone)}",
        "description": description,
        "color": COLOR_OPEN,
        "footer": {"text": f"Confirmed {summary.confirmed_count}/{event.size_cap} · Signed up {summary.signed_up_count}"},
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
    heading: str, players: Sequence[WowRaidSignup], emojis: EmojiSet, *, numbered: bool = False
) -> str:
    if not players:
        return f"**{heading}**\n—"
    lines = []
    for index, player in enumerate(players, start=1):
        line = f"{class_icon(player.wow_class, emojis)} {escape_name(player.display_name)}".strip()
        if numbered:
            line = f"{index}. {line}"
        lines.append(line)
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
        line = f"**{display_title(event)}** — <t:{unix(event.starts_at)}:F> · {summary.confirmed_count}/{event.size_cap} confirmed"
        if event.message_id:
            line += f" · [Open]({message_link(guild_discord_id, event.channel_id, event.message_id)})"
        lines.append(line)
    return ephemeral_data("\n".join(lines))


def prefs_data(pref: WowRaidMemberPref | None, *, heading: str | None = None) -> dict[str, Any]:
    wow_class = None
    role = None
    dm_on = True
    if pref is not None:
        wow_class = pref.default_wow_class
        role = pref.default_role
        dm_on = not pref.dm_opt_out
    lines = []
    if heading:
        lines.append(heading)
    if wow_class or role:
        lines.append(f"Signing up as: **{class_role_label(wow_class, role)}**")
    else:
        lines.append("Signing up as: not set yet. I'll ask the first time you tap **Sign up**.")
    reminder_state = "on" if dm_on else "off"
    lines.append(f"DM reminders: **{reminder_state}**")
    lines.append("Change these with `/raid prefs class: role: dm_reminders:`.")
    test_button = _button("Send me a test DM", BUTTON_STYLE_SECONDARY, raid_custom_id.encode("testdm"))
    return ephemeral_data("\n".join(lines), components=[_row(test_button)])
