"""Public raid signup message — a PURE function of (event, signups, guild).

Builds the embed + button rows for the signup post.  Used for the initial
post (REST), every button click (UPDATE_MESSAGE, type 7) and every edit /
cancellation (REST edit).  No I/O, no clock — ``starts_at`` is rendered with
Discord ``<t:…>`` timestamps so every viewer sees their own local time.

Layout
------
Title        "Onyxia — Sat Oct 10"               ("CANCELLED — " prefix when cancelled)
Description  <t:X:F> (<t:X:R>) / notes /
             "**Confirmed 15/40 (1 late)** · Tentative 3 · Queued 2 · Bench 1 · Absence 4"
             (seats taken: late players hold seats too)
Fields       Tanks (n) / Healers (n) / DPS (n): one line per class, e.g.
             "<class icon> Warrior ×2: Alice, Bob"; then Late / Tentative /
             "Queued (n) · waiting for a seat" (in line order) /
             "Bench (n) · backups" / Absence.
             Icons are the bot's application emojis; without them (before the
             first emoji sync) the class shows as a text tag, "[WAR]".
Footer       "Signed up: 20 · Created by Thrall · Raid ID a1b2"
Colors       blurple open, orange full, grey cancelled.

Discord limits & degradation
----------------------------
Each field value ≤ 1024 chars, the whole embed ≤ 6000 (we budget 5800).
When the full roster doesn't fit, degrade in order until it does:
  1. cap the names shown per line, the rest become "+N more";
  2. the status fields become counts ("Tap Roster to see who.");
  3. role lines drop names entirely ("[WAR] Warrior ×5").
The [Roster] button always shows the complete list privately.
"""
from __future__ import annotations

import re
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Final
from zoneinfo import ZoneInfo

from platform_shared.services.discord import (
    BUTTON_STYLE_SECONDARY,
    BUTTON_STYLE_SUCCESS,
    COMPONENT_TYPE_ACTION_ROW,
    COMPONENT_TYPE_BUTTON,
    EmojiSet,
)

from app.models.wow.wow_raid_event import WowRaidEvent
from app.models.wow.wow_raid_guild import WowRaidGuild
from app.models.wow.wow_raid_signup import WowRaidSignup
from app.services.wow import raid_custom_id
from app.services.wow.raid_catalog import (
    CLASSES,
    CLASSES_BY_KEY,
    ROLE_FIELD_LABELS,
    ROLE_ORDER,
    raid_name,
    spec_info,
)
from app.services.wow.raid_roster import RosterSummary, compute_roster_summary

COLOR_OPEN: Final = 0x5865F2
COLOR_FULL: Final = 0xE67E22
COLOR_CANCELLED: Final = 0x95A5A6

FIELD_VALUE_LIMIT: Final = 1024
EMBED_TOTAL_BUDGET: Final = 5800  # Discord's hard cap is 6000; keep headroom.
MAX_NAME_CHARS: Final = 32

NO_SIGNUPS_TEXT: Final = "No one yet. Be the first!"
EMPTY_ROLE_TEXT: Final = "—"
COLLAPSED_STATUS_TEXT: Final = "Tap **Roster** to see who."

NO_MENTIONS: Final[dict[str, Any]] = {"parse": []}

_MARKDOWN_SPECIALS: Final = re.compile(r"([\\*_~`|>\[\]])")
_STATUS_FIELDS: Final = (
    ("late", "Late"),
    ("tentative", "Tentative"),
    ("queued", "Queued"),
    ("bench", "Bench"),
    ("absence", "Absence"),
)
# Said after the count, so the queue and the bench aren't mistaken for each other.
_STATUS_HINTS: Final[dict[str, str]] = {"queued": "waiting for a seat", "bench": "backups"}
# Status buttons after [Sign up]: (status, label, icon).
_STATUS_BUTTONS: Final = (
    ("late", "Late", "status_late"),
    ("tentative", "Tentative", "status_tentative"),
    ("bench", "Bench", "status_bench"),
    ("absence", "Absence", "status_absence"),
)


@dataclass(frozen=True)
class _Entry:
    name: str
    wow_class: str | None


@dataclass(frozen=True)
class _RenderMode:
    """How aggressively to compress the roster (see module docstring)."""

    names_per_line: int | None  # None = all names
    collapse_status_fields: bool


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def build_signup_message(
    event: WowRaidEvent,
    signups: Sequence[WowRaidSignup],
    guild: WowRaidGuild,
    *,
    emojis: EmojiSet,
) -> dict[str, Any]:
    """Message payload (embeds + components + allowed_mentions) for the signup post.

    Used for edits and UPDATE_MESSAGE responses — carries no ``content`` so
    the original post's role ping text is left untouched.
    """
    return {
        "embeds": [build_signup_embed(event, signups, guild, emojis=emojis)],
        "components": build_signup_components(event, emojis=emojis),
        "allowed_mentions": NO_MENTIONS,
    }


def build_initial_post(
    event: WowRaidEvent,
    signups: Sequence[WowRaidSignup],
    guild: WowRaidGuild,
    *,
    ping_role: bool,
    emojis: EmojiSet,
) -> dict[str, Any]:
    """The first post of a raid: same message, plus the guild's role ping.

    ``allowed_mentions`` names exactly that one role — never @everyone/@here,
    never users.  Reposts (after the original was deleted) pass
    ``ping_role=False``.
    """
    message = build_signup_message(event, signups, guild, emojis=emojis)
    if ping_role and guild.ping_role_id:
        message["content"] = f"<@&{guild.ping_role_id}>"
        message["allowed_mentions"] = {"parse": [], "roles": [guild.ping_role_id]}
    return message


def build_signup_components(event: WowRaidEvent, *, emojis: EmojiSet) -> list[dict[str, Any]]:
    """Two button rows; every button is disabled once the raid is no longer open."""
    disabled = event.status != "scheduled"
    row1 = [
        _button(
            "Sign up", BUTTON_STYLE_SUCCESS, raid_custom_id.encode("signup", event.id), disabled,
            emoji=emojis.component("status_signed"),
        ),
    ]
    row1 += [
        _button(
            label, BUTTON_STYLE_SECONDARY, raid_custom_id.encode("status", event.id, status), disabled,
            emoji=emojis.component(icon),
        )
        for status, label, icon in _STATUS_BUTTONS
    ]
    row2 = [
        _button("My signup", BUTTON_STYLE_SECONDARY, raid_custom_id.encode("mine", event.id), disabled),
        _button("Roster", BUTTON_STYLE_SECONDARY, raid_custom_id.encode("roster", event.id), disabled),
    ]
    return [
        {"type": COMPONENT_TYPE_ACTION_ROW, "components": row1},
        {"type": COMPONENT_TYPE_ACTION_ROW, "components": row2},
    ]


def build_signup_embed(
    event: WowRaidEvent,
    signups: Sequence[WowRaidSignup],
    guild: WowRaidGuild,
    *,
    emojis: EmojiSet,
) -> dict[str, Any]:
    summary = compute_roster_summary(signups, size_cap=event.size_cap)
    title = _title(event, guild)
    description = _description(event, summary)
    footer = _footer(event, summary)

    fields: list[dict[str, Any]] = []
    if signups:
        fields = _fit_fields(signups, emojis, fixed_len=len(title) + len(description) + len(footer))

    embed: dict[str, Any] = {
        "title": title,
        "description": description,
        "color": _color(event, summary),
        "footer": {"text": footer},
    }
    if fields:
        embed["fields"] = fields
    return embed


def embed_length(embed: dict[str, Any]) -> int:
    """Characters Discord counts toward the 6000 total."""
    total = len(embed.get("title", "")) + len(embed.get("description", ""))
    total += len(embed.get("footer", {}).get("text", ""))
    for embed_field in embed.get("fields", []):
        total += len(embed_field["name"]) + len(embed_field["value"])
    return total


def display_title(event: WowRaidEvent) -> str:
    """'Onyxia' — the event's custom title, else the raid's display name."""
    return event.title or raid_name(event.raid_key)


def local_day_label(starts_at: datetime, tz_name: str) -> str:
    """'Sat Oct 10' in the guild's timezone (portable — no %-d)."""
    local = starts_at.astimezone(ZoneInfo(tz_name))
    return f"{local:%a %b} {local.day}"


def escape_name(display_name: str) -> str:
    """Trim to MAX_NAME_CHARS and escape Discord markdown so names render literally."""
    name = " ".join(display_name.split())
    if len(name) > MAX_NAME_CHARS:
        name = name[: MAX_NAME_CHARS - 1] + "…"
    return _MARKDOWN_SPECIALS.sub(r"\\\1", name)


def class_tag(wow_class: str | None) -> str:
    info = CLASSES_BY_KEY.get(wow_class or "")
    if info is None:
        return ""
    return f"[{info.tag}]"


def class_icon(wow_class: str | None, emojis: EmojiSet) -> str:
    """The class's emoji markup, else its text tag ("[WAR]"); empty for no class."""
    if wow_class is None or wow_class not in CLASSES_BY_KEY:
        return ""
    return emojis.markup(wow_class, class_tag(wow_class))


def spec_icon(wow_class: str | None, spec: str | None, emojis: EmojiSet) -> str:
    """The spec's emoji; else the class icon (a pre-spec signup, or the spec emoji is missing)."""
    info = spec_info(wow_class, spec)
    if info is None:
        return class_icon(wow_class, emojis)
    return emojis.markup(info.icon, class_icon(wow_class, emojis))


# ---------------------------------------------------------------------------
# Header / footer
# ---------------------------------------------------------------------------


def _title(event: WowRaidEvent, guild: WowRaidGuild) -> str:
    title = f"{display_title(event)} — {local_day_label(event.starts_at, guild.timezone)}"
    if event.status == "cancelled":
        return f"CANCELLED — {title}"
    return title


def _description(event: WowRaidEvent, summary: RosterSummary) -> str:
    unix = int(event.starts_at.timestamp())
    lines: list[str] = []
    if event.status == "cancelled":
        lines.append(f"~~<t:{unix}:F>~~")
        if event.cancel_reason:
            lines.append(f"**Cancelled:** {event.cancel_reason}")
        else:
            lines.append("**This raid has been cancelled.**")
    else:
        lines.append(f"<t:{unix}:F> (<t:{unix}:R>)")
    if event.notes:
        lines.append(event.notes)

    counts = [f"**{seats_label(summary)}**"]
    optional_counts = (
        ("Tentative", summary.tentative_count),
        ("Queued", summary.queued_count),
        ("Bench", summary.bench_count),
        ("Absence", summary.absence_count),
    )
    counts.extend(f"{label} {count}" for label, count in optional_counts if count)
    lines.append(" · ".join(counts))

    if summary.signed_up_count == 0:
        lines.append(NO_SIGNUPS_TEXT)
    return "\n".join(lines)


def seats_label(summary: RosterSummary) -> str:
    """'Confirmed 40/40 (2 late)' — late players hold seats too."""
    label = f"Confirmed {summary.seats_taken}/{summary.size_cap}"
    if summary.late_count:
        label += f" ({summary.late_count} late)"
    return label


def status_heading(status: str, label: str, count: int) -> str:
    """'Queued (3) · waiting for a seat' — the count, plus a hint for the queue and the bench."""
    heading = f"{label} ({count})"
    hint = _STATUS_HINTS.get(status)
    if hint:
        heading += f" · {hint}"
    return heading


def _footer(event: WowRaidEvent, summary: RosterSummary) -> str:
    parts = [f"Signed up: {summary.signed_up_count}"]
    if event.created_by_display_name:
        parts.append(f"Created by {' '.join(event.created_by_display_name.split())[:MAX_NAME_CHARS]}")
    parts.append(f"Raid ID {str(event.id)[:4]}")
    return " · ".join(parts)


def _color(event: WowRaidEvent, summary: RosterSummary) -> int:
    if event.status == "cancelled":
        return COLOR_CANCELLED
    if summary.is_full:
        return COLOR_FULL
    return COLOR_OPEN


# ---------------------------------------------------------------------------
# Fields + degradation
# ---------------------------------------------------------------------------


def _fit_fields(signups: Sequence[WowRaidSignup], emojis: EmojiSet, *, fixed_len: int) -> list[dict[str, Any]]:
    ordered = sorted(signups, key=lambda s: s.signed_up_at)
    role_groups = _role_groups(ordered)
    status_groups = {
        status: [_entry(s) for s in ordered if s.status == status] for status, _ in _STATUS_FIELDS
    }
    longest_line = max(
        [len(entries) for groups in role_groups.values() for entries in groups.values()]
        + [len(entries) for entries in status_groups.values()]
        + [0]
    )

    modes: list[_RenderMode] = [_RenderMode(None, False)]
    modes += [_RenderMode(limit, False) for limit in range(longest_line - 1, 0, -1)]
    modes += [_RenderMode(None, True)]
    modes += [_RenderMode(limit, True) for limit in range(longest_line - 1, -1, -1)]

    fields: list[dict[str, Any]] = []
    for mode in modes:
        fields = _render_fields(role_groups, status_groups, mode, emojis)
        if _fits(fields, fixed_len):
            return fields
    return fields  # mode (0, collapsed) is bounded far below the limits


def _fits(fields: list[dict[str, Any]], fixed_len: int) -> bool:
    if any(len(f["value"]) > FIELD_VALUE_LIMIT for f in fields):
        return False
    total = fixed_len + sum(len(f["name"]) + len(f["value"]) for f in fields)
    return total <= EMBED_TOTAL_BUDGET


def _entry(signup: WowRaidSignup) -> _Entry:
    return _Entry(name=escape_name(signup.display_name), wow_class=signup.wow_class)


def _role_groups(ordered: Sequence[WowRaidSignup]) -> dict[str, dict[str, list[_Entry]]]:
    """role → class → entries, for confirmed signups.  Unknown roles → 'unknown'."""
    groups: dict[str, dict[str, list[_Entry]]] = {role: {} for role in (*ROLE_ORDER, "unknown")}
    for signup in ordered:
        if signup.status != "confirmed":
            continue
        role = signup.role if signup.role in ROLE_ORDER else "unknown"
        class_key = signup.wow_class if signup.wow_class in CLASSES_BY_KEY else ""
        groups[role].setdefault(class_key, []).append(_entry(signup))
    return groups


def _render_fields(
    role_groups: dict[str, dict[str, list[_Entry]]],
    status_groups: dict[str, list[_Entry]],
    mode: _RenderMode,
    emojis: EmojiSet,
) -> list[dict[str, Any]]:
    fields: list[dict[str, Any]] = []
    for role in ROLE_ORDER:
        by_class = role_groups[role]
        count = sum(len(entries) for entries in by_class.values())
        lines = [
            _class_line(class_key, by_class[class_key], mode.names_per_line, emojis)
            for class_key in _class_order(by_class)
        ]
        fields.append(_field(f"{ROLE_FIELD_LABELS[role]} ({count})", "\n".join(lines) or EMPTY_ROLE_TEXT))

    unknown = role_groups["unknown"]
    unknown_entries = [entry for entries in unknown.values() for entry in entries]
    if unknown_entries:
        fields.append(
            _field(
                f"No role yet ({len(unknown_entries)})",
                _tagged_names(unknown_entries, mode.names_per_line, emojis),
            )
        )

    for status, label in _STATUS_FIELDS:
        entries = status_groups[status]
        if not entries:
            continue
        if mode.collapse_status_fields:
            value = COLLAPSED_STATUS_TEXT
        else:
            value = _tagged_names(entries, mode.names_per_line, emojis)
        fields.append(_field(status_heading(status, label, len(entries)), value))
    return fields


def _class_order(by_class: dict[str, list[_Entry]]) -> list[str]:
    known = [cls.key for cls in CLASSES if cls.key in by_class]
    if "" in by_class:
        known.append("")
    return known


def _class_line(class_key: str, entries: list[_Entry], limit: int | None, emojis: EmojiSet) -> str:
    info = CLASSES_BY_KEY.get(class_key)
    if info is None:
        head = f"Unknown class ×{len(entries)}"
    else:
        head = f"{class_icon(class_key, emojis)} {info.label} ×{len(entries)}"
    if limit == 0:
        return head
    return f"{head}: {_names([entry.name for entry in entries], limit)}"


def _tagged_names(entries: list[_Entry], limit: int | None, emojis: EmojiSet) -> str:
    labels = [f"{class_icon(entry.wow_class, emojis)} {entry.name}".strip() for entry in entries]
    return _names(labels, limit)


def _names(names: list[str], limit: int | None) -> str:
    if limit is None or len(names) <= limit:
        return ", ".join(names)
    hidden = len(names) - limit
    if limit == 0:
        return f"+{hidden} more"
    return f"{', '.join(names[:limit])} +{hidden} more"


def _field(name: str, value: str) -> dict[str, Any]:
    return {"name": name, "value": value, "inline": False}


def _button(
    label: str, style: int, custom_id: str, disabled: bool, *, emoji: dict[str, str] | None = None
) -> dict[str, Any]:
    button: dict[str, Any] = {
        "type": COMPONENT_TYPE_BUTTON,
        "style": style,
        "label": label,
        "custom_id": custom_id,
        "disabled": disabled,
    }
    if emoji is not None:
        button["emoji"] = emoji
    return button
