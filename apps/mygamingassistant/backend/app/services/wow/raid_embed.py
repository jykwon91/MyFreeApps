"""Public raid signup message — a PURE function of (event, signups, guild).

Builds the embed + button rows for the signup post, laid out like
Raid-Helper's (in our own art).  Used for the initial post (REST), every
button click (UPDATE_MESSAGE, type 7), every edit / cancellation (REST edit)
and the create preview.  No I/O, no clock — times are Discord ``<t:…>``
timestamps, so every viewer sees their own local time.

Layout
------
Author       "Onyxia's Lair · Leader: Thrall"      ("CANCELLED · " prefix when cancelled)
Description  the title in letter tiles (else "## Onyxia's Lair")
             {date} <t:X:D>  {time} <t:X:t>  {signups} **14/40** confirmed (2 late) · 3 in queue
             {globe} Server time: Sat 8:00 PM EDT  {countdown} <t:X:R>
             notes
             {tank} Tanks **2**  {melee} Melee **6**  {ranged} Ranged **4**  {healer} Healers **2**
Fields       one inline column per button with anyone in it, "{icon} Warrior (3)":
             "{spec icon} `1` **Alice**" per line, in line order; late players
             end with {late}, the queue is ~~struck~~ and ends with {queued};
             then Tentative / Bench / Absence as "{spec icon} Name" lists.
             While sign-ups are open, "Nobody yet" names the empty columns, so
             every class button's icon is labelled somewhere on the post.
Footer       "ID a1b2c3 · Tap your class to sign up. My sign-up changes your spec."
Colors       purple; grey once cancelled.
Buttons      [Tank] + one per class (icon + column count), then [Late]
             [Tentative] [Bench] [Absence] [My sign-up].

Icons are the bot's application emojis.  Without them (before the first
emoji sync) a class shows as a text tag ("[WAR]"), a class button as
"WAR 3", the markers as "(late)" / "(queued)", and the title as plain text.

Discord limits & degradation
----------------------------
Each field value ≤ 1024 chars, the whole embed ≤ 6000 (we budget 5800).
When the post doesn't fit, it gives up detail in order until it does:
  1. the order numbers;
  2. the entry icons (markers become text; the Tanks column and the lists
     keep a class tag);
  3. the letter tiles (plain-text title);
  4. names beyond 9 characters;
  5. names past a cap per list, which become "+N more" (down to none).
A column too long for its field takes the next steps on its own.
My sign-up → [Full roster] always shows the complete list privately.
"""
from __future__ import annotations

import re
from collections.abc import Callable, Sequence
from dataclasses import dataclass, replace
from datetime import datetime
from functools import partial
from typing import Any, Final
from zoneinfo import ZoneInfo

from platform_shared.services.discord import (
    BUTTON_STYLE_SECONDARY,
    COMPONENT_TYPE_ACTION_ROW,
    COMPONENT_TYPE_BUTTON,
    EmojiSet,
)

from app.models.wow.wow_raid_event import WowRaidEvent
from app.models.wow.wow_raid_guild import WowRaidGuild
from app.models.wow.wow_raid_signup import WowRaidSignup
from app.services.wow import raid_custom_id
from app.services.wow.raid_catalog import (
    CLASSES_BY_KEY,
    POST_COLUMNS,
    TANK_COLUMN,
    column_icon,
    column_label,
    column_tag,
    effective_spec,
    raid_name,
    spec_info,
)
from app.services.wow.raid_post_layout import (
    NO_CLASS_COLUMN,
    NO_CLASS_LABEL,
    ROLE_ROW,
    column_counts,
    post_columns,
    role_counts,
    tile_line,
    with_status,
)
from app.services.wow.raid_roster import (
    QUEUED_STATUS,
    RosterSummary,
    compute_roster_summary,
    order_numbers,
)

COLOR_OPEN: Final = 0x7D3C98
COLOR_CANCELLED: Final = 0x95A5A6

FIELD_VALUE_LIMIT: Final = 1024
AUTHOR_NAME_LIMIT: Final = 256
EMBED_TOTAL_BUDGET: Final = 5800  # Discord's hard cap is 6000; keep headroom.
MAX_NAME_CHARS: Final = 32
POST_NAME_CHARS: Final = 12  # three columns side by side on a desktop
SHORT_NAME_CHARS: Final = 9

NOBODY_YET: Final = "Nobody yet"
SIGN_UP_HINT: Final = "Tap your class to sign up. My sign-up changes your spec."
EM_SPACE: Final = " "

NO_MENTIONS: Final[dict[str, Any]] = {"parse": []}

_MARKDOWN_SPECIALS: Final = re.compile(r"([\\*_~`|>\[\]])")
# Event statuses that still take sign-ups (a draft is the create preview).
_OPEN_STATUSES: Final = ("draft", "scheduled")
_FOOTER_HINTS: Final[dict[str, str]] = {
    "cancelled": "This raid was cancelled.",
    "completed": "Sign-ups are closed.",
}
# The lists under the columns: (status, label, icon).
STATUS_LISTS: Final = (
    ("tentative", "Tentative", "status_tentative"),
    ("bench", "Bench", "status_bench"),
    ("absence", "Absence", "status_absence"),
)
# Said after the count, so the queue and the bench aren't mistaken for each other.
_STATUS_HINTS: Final[dict[str, str]] = {"queued": "waiting for a seat", "bench": "backups"}
# After a name in a column: (icon, text when the icon is missing or dropped).
_MARKERS: Final[dict[str, tuple[str, str]]] = {
    "late": ("status_late", "(late)"),
    QUEUED_STATUS: ("status_queued", "(queued)"),
}
# The status buttons under the class buttons: (status, label, icon).
_STATUS_BUTTONS: Final = (
    ("late", "Late", "status_late"),
    ("tentative", "Tentative", "status_tentative"),
    ("bench", "Bench", "status_bench"),
    ("absence", "Absence", "status_absence"),
)
_BUTTONS_PER_ROW: Final = 5


@dataclass(frozen=True)
class _Style:
    """How much detail the post shows (see "degradation" above)."""

    numbers: bool = True  # order numbers in the columns
    icons: bool = True  # spec and marker icons on each entry
    tiles: bool = True  # the title in letter tiles
    name_chars: int = POST_NAME_CHARS
    cap: int | None = None  # names shown per list; the rest are "+N more"


@dataclass(frozen=True)
class _Roster:
    """The post's lists, worked out once and rendered at each level of detail."""

    columns: dict[str, list[WowRaidSignup]]  # columns with anyone in them, in post order
    empty_columns: list[str]
    lists: dict[str, list[WowRaidSignup]]  # tentative / bench / absence
    numbers: dict[str, int]
    roles: dict[str, int]

    @classmethod
    def of(cls, signups: Sequence[WowRaidSignup]) -> _Roster:
        by_column = post_columns(signups)
        return cls(
            columns={column: players for column, players in by_column.items() if players},
            empty_columns=[column for column, players in by_column.items() if not players],
            lists={status: with_status(signups, status) for status, _, _ in STATUS_LISTS},
            numbers=order_numbers(signups),
            roles=role_counts(signups),
        )

    @property
    def longest(self) -> int:
        return max((len(players) for players in (*self.columns.values(), *self.lists.values())), default=0)


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
        "components": build_signup_components(event, signups, emojis=emojis),
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


def build_signup_components(
    event: WowRaidEvent, signups: Sequence[WowRaidSignup], *, emojis: EmojiSet
) -> list[dict[str, Any]]:
    """Class buttons with their column counts, then the status buttons.

    Every button is disabled once the raid is no longer open.
    """
    disabled = event.status != "scheduled"
    counts = column_counts(signups)
    class_buttons = [_class_button(event, column, counts[column], disabled, emojis) for column in POST_COLUMNS]
    status_buttons = [
        _button(raid_custom_id.encode("status", event.id, status), label, disabled, emojis.component(icon))
        for status, label, icon in _STATUS_BUTTONS
    ]
    status_buttons.append(
        _button(raid_custom_id.encode("mine", event.id), "My sign-up", disabled, emojis.component("ui_gear"))
    )
    rows = [class_buttons[i : i + _BUTTONS_PER_ROW] for i in range(0, len(class_buttons), _BUTTONS_PER_ROW)]
    rows.append(status_buttons)
    return [{"type": COMPONENT_TYPE_ACTION_ROW, "components": row} for row in rows]


def build_signup_embed(
    event: WowRaidEvent,
    signups: Sequence[WowRaidSignup],
    guild: WowRaidGuild,
    *,
    emojis: EmojiSet,
) -> dict[str, Any]:
    summary = compute_roster_summary(signups, size_cap=event.size_cap)
    roster = _Roster.of(signups)
    ladder = _ladder(roster.longest)
    embed: dict[str, Any] = {}
    for level in range(len(ladder)):
        embed = _render(event, guild, summary, roster, ladder[level:], emojis)
        if embed_length(embed) <= EMBED_TOTAL_BUDGET:
            break
    return embed  # the leanest level is bounded far below the limits


def embed_length(embed: dict[str, Any]) -> int:
    """Characters Discord counts toward the 6000 total."""
    total = len(embed.get("title", "")) + len(embed.get("description", ""))
    total += len(embed.get("author", {}).get("name", ""))
    total += len(embed.get("footer", {}).get("text", ""))
    for embed_field in embed.get("fields", []):
        total += len(embed_field["name"]) + len(embed_field["value"])
    return total


def display_title(event: WowRaidEvent) -> str:
    """The event's custom title, else the raid's display name ("Onyxia's Lair")."""
    return event.title or raid_name(event.raid_key)


def local_day_label(starts_at: datetime, tz_name: str) -> str:
    """'Sat Oct 10' in the guild's timezone (portable — no %-d)."""
    local = starts_at.astimezone(ZoneInfo(tz_name))
    return f"{local:%a %b} {local.day}"


def server_time_label(starts_at: datetime, tz_name: str) -> str:
    """'Sat 8:00 PM EDT' — the start in the guild's timezone (portable — no %-I)."""
    local = starts_at.astimezone(ZoneInfo(tz_name))
    return f"{local:%a} {local.hour % 12 or 12}:{local:%M %p %Z}"


def escape_markdown(text: str) -> str:
    """Escape Discord markdown so text renders literally."""
    return _MARKDOWN_SPECIALS.sub(r"\\\1", text)


def escape_name(display_name: str, *, max_chars: int = MAX_NAME_CHARS) -> str:
    """Trim to *max_chars* and escape Discord markdown so names render literally."""
    name = " ".join(display_name.split())
    if len(name) > max_chars:
        name = name[: max_chars - 1] + "…"
    return escape_markdown(name)


def seats_label(summary: RosterSummary) -> str:
    """'14/40 confirmed (2 late) · 3 in queue' — late players hold seats too."""
    return f"{summary.seats_taken}/{summary.size_cap} confirmed{_seats_detail(summary)}"


def _seats_detail(summary: RosterSummary) -> str:
    detail = ""
    if summary.late_count:
        detail += f" ({summary.late_count} late)"
    if summary.queued_count:
        detail += f" · {summary.queued_count} in queue"
    return detail


def status_heading(status: str, label: str, count: int) -> str:
    """'Queued (3) · waiting for a seat' — the count, plus a hint for the queue and the bench."""
    heading = f"{label} ({count})"
    hint = _STATUS_HINTS.get(status)
    if hint:
        heading += f" · {hint}"
    return heading


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
    """The spec's emoji; else the class icon (no spec, or the spec emoji is missing)."""
    info = spec_info(wow_class, spec)
    if info is None:
        return class_icon(wow_class, emojis)
    return emojis.markup(info.icon, class_icon(wow_class, emojis))


def signup_icon(signup: WowRaidSignup, emojis: EmojiSet) -> str:
    """The icon of the spec a sign-up shows as (a pre-spec one: its default spec)."""
    spec = effective_spec(signup.wow_class, signup.role, signup.spec)
    if spec is None:
        return class_icon(signup.wow_class, emojis)
    return spec_icon(spec.class_key, spec.key, emojis)


def icon_text(emojis: EmojiSet, icon: str, text: str) -> str:
    """'{icon} text', or just the text while the icon isn't uploaded."""
    return f"{emojis.markup(icon)} {text}".strip()


# ---------------------------------------------------------------------------
# Embed
# ---------------------------------------------------------------------------


def _ladder(longest_list: int) -> list[_Style]:
    """Every level of detail, richest first; the last always fits."""
    lean = _Style(numbers=False, icons=False, tiles=False, name_chars=SHORT_NAME_CHARS)
    return [
        _Style(),
        _Style(numbers=False),
        _Style(numbers=False, icons=False),
        _Style(numbers=False, icons=False, tiles=False),
        lean,
        *(replace(lean, cap=cap) for cap in range(longest_list - 1, -1, -1)),
    ]


def _render(
    event: WowRaidEvent,
    guild: WowRaidGuild,
    summary: RosterSummary,
    roster: _Roster,
    styles: Sequence[_Style],
    emojis: EmojiSet,
) -> dict[str, Any]:
    """The embed at ``styles[0]``; a field too long for it takes the later styles."""
    embed: dict[str, Any] = {
        "author": {"name": _author(event)},
        "description": _description(event, guild, summary, roster, styles[0], emojis),
        "color": _color(event),
        "footer": {"text": _footer(event)},
    }
    fields = _fields(event, roster, styles, emojis)
    if fields:
        embed["fields"] = fields
    return embed


def _author(event: WowRaidEvent) -> str:
    text = " ".join(display_title(event).split())
    if event.created_by_display_name:
        leader = " ".join(event.created_by_display_name.split())[:MAX_NAME_CHARS]
        text += f" · Leader: {leader}"
    if event.status == "cancelled":
        text = f"CANCELLED · {text}"
    return text[:AUTHOR_NAME_LIMIT]


def _description(
    event: WowRaidEvent,
    guild: WowRaidGuild,
    summary: RosterSummary,
    roster: _Roster,
    style: _Style,
    emojis: EmojiSet,
) -> str:
    unix = int(event.starts_at.timestamp())
    lines = [_title_line(event, style, emojis)]
    if event.status == "cancelled":
        lines.append(_cancel_line(event))
        lines.append(f"~~<t:{unix}:F>~~")
    else:
        when = (
            icon_text(emojis, "info_date", f"<t:{unix}:D>"),
            icon_text(emojis, "info_time", f"<t:{unix}:t>"),
            icon_text(
                emojis,
                "info_signups",
                f"**{summary.seats_taken}/{summary.size_cap}** confirmed{_seats_detail(summary)}",
            ),
        )
        server = (
            icon_text(emojis, "info_globe", f"Server time: {server_time_label(event.starts_at, guild.timezone)}"),
            icon_text(emojis, "info_countdown", f"<t:{unix}:R>"),
        )
        lines.append(EM_SPACE.join(when))
        lines.append(EM_SPACE.join(server))
    if event.notes:
        lines.append(event.notes)
    lines.append(
        EM_SPACE.join(
            icon_text(emojis, icon, f"{label} **{roster.roles[role]}**") for role, label, icon in ROLE_ROW
        )
    )
    return "\n".join(lines)


def _title_line(event: WowRaidEvent, style: _Style, emojis: EmojiSet) -> str:
    title = display_title(event)
    if style.tiles:
        tiles = tile_line(title, emojis)
        if tiles is not None:
            return tiles
    return f"## {escape_markdown(' '.join(title.split()))}"


def _cancel_line(event: WowRaidEvent) -> str:
    if event.cancel_reason:
        return f"**Cancelled:** {event.cancel_reason}"
    return "**This raid has been cancelled.**"


def _footer(event: WowRaidEvent) -> str:
    hint = _FOOTER_HINTS.get(event.status, SIGN_UP_HINT)
    return f"ID {str(event.id)[:6]} · {hint}"


def _color(event: WowRaidEvent) -> int:
    if event.status == "cancelled":
        return COLOR_CANCELLED
    return COLOR_OPEN


# ---------------------------------------------------------------------------
# Fields
# ---------------------------------------------------------------------------


def _fields(
    event: WowRaidEvent, roster: _Roster, styles: Sequence[_Style], emojis: EmojiSet
) -> list[dict[str, Any]]:
    fields: list[dict[str, Any]] = []
    for column, players in roster.columns.items():
        render = partial(_column_value, column=column, players=players, numbers=roster.numbers, emojis=emojis)
        fields.append(_field(column_heading(column, len(players), emojis), _fitted(styles, render), inline=True))
    for status, label, icon in STATUS_LISTS:
        players = roster.lists[status]
        if players:
            render = partial(_list_value, players=players, emojis=emojis)
            name = icon_text(emojis, icon, status_heading(status, label, len(players)))
            fields.append(_field(name, _fitted(styles, render)))
    if roster.empty_columns and event.status in _OPEN_STATUSES:
        legend = " · ".join(icon_text(emojis, column_icon(c), column_label(c)) for c in roster.empty_columns)
        fields.append(_field(NOBODY_YET, legend))
    return fields


def _fitted(styles: Sequence[_Style], render: Callable[[_Style], str]) -> str:
    """The richest rendering that fits a field (the leanest style always does)."""
    value = ""
    for style in styles:
        value = render(style)
        if len(value) <= FIELD_VALUE_LIMIT:
            break
    return value


def column_heading(column: str, count: int, emojis: EmojiSet) -> str:
    """'{icon} Warrior (3)' — 'No class yet (1)' for sign-ups without a class."""
    if column == NO_CLASS_COLUMN:
        return f"{NO_CLASS_LABEL} ({count})"
    return icon_text(emojis, column_icon(column), f"{column_label(column)} ({count})")


def roster_entry(signup: WowRaidSignup, number: int | None, emojis: EmojiSet) -> str:
    """A column line with every detail and the full name, for the private roster."""
    return _column_entry(signup, "", number, _Style(name_chars=MAX_NAME_CHARS), emojis)


def _column_value(
    style: _Style,
    *,
    column: str,
    players: Sequence[WowRaidSignup],
    numbers: dict[str, int],
    emojis: EmojiSet,
) -> str:
    shown, hidden = _capped(players, style.cap)
    lines = [_column_entry(signup, column, numbers.get(signup.discord_user_id), style, emojis) for signup in shown]
    if hidden:
        lines.append(f"+{hidden} more")
    return "\n".join(lines)


def _column_entry(
    signup: WowRaidSignup, column: str, number: int | None, style: _Style, emojis: EmojiSet
) -> str:
    """One column line: spec icon, order number, bold name; the queue struck through, late and queued marked."""
    name = escape_name(signup.display_name, max_chars=style.name_chars)
    parts: list[str] = []
    if style.icons:
        parts.append(signup_icon(signup, emojis))
    elif column == TANK_COLUMN:
        parts.append(class_tag(signup.wow_class))
    if style.numbers and number is not None:
        parts.append(f"`{number}`")
    if signup.status == QUEUED_STATUS:
        parts.append(f"~~{name}~~")
    else:
        parts.append(f"**{name}**")
    marker = _MARKERS.get(signup.status)
    if marker is not None:
        icon, text = marker
        if style.icons:
            text = emojis.markup(icon, text)
        parts.append(text)
    return " ".join(part for part in parts if part)


def _list_value(style: _Style, *, players: Sequence[WowRaidSignup], emojis: EmojiSet) -> str:
    """'{spec icon} Alice, {spec icon} Bob +3 more' — no order numbers off the line."""
    shown, hidden = _capped(players, style.cap)
    entries = [_list_entry(signup, style, emojis) for signup in shown]
    if hidden:
        entries.append(f"+{hidden} more")
    return ", ".join(entries)


def _list_entry(signup: WowRaidSignup, style: _Style, emojis: EmojiSet) -> str:
    name = escape_name(signup.display_name, max_chars=style.name_chars)
    if style.icons:
        tag = signup_icon(signup, emojis)
    else:
        tag = class_tag(signup.wow_class)
    return f"{tag} {name}".strip()


def _capped(players: Sequence[WowRaidSignup], cap: int | None) -> tuple[Sequence[WowRaidSignup], int]:
    if cap is None or len(players) <= cap:
        return players, 0
    return players[:cap], len(players) - cap


def _field(name: str, value: str, *, inline: bool = False) -> dict[str, Any]:
    return {"name": name, "value": value, "inline": inline}


# ---------------------------------------------------------------------------
# Buttons
# ---------------------------------------------------------------------------


def _class_button(
    event: WowRaidEvent, column: str, count: int, disabled: bool, emojis: EmojiSet
) -> dict[str, Any]:
    """The column's icon and count ("WAR 3" until the icons are uploaded)."""
    emoji = emojis.component(column_icon(column))
    label = str(count)
    if emoji is None:
        label = f"{column_tag(column)} {count}"
    return _button(raid_custom_id.encode("cls", event.id, column), label, disabled, emoji)


def _button(custom_id: str, label: str, disabled: bool, emoji: dict[str, str] | None) -> dict[str, Any]:
    button: dict[str, Any] = {
        "type": COMPONENT_TYPE_BUTTON,
        "style": BUTTON_STYLE_SECONDARY,
        "label": label,
        "custom_id": custom_id,
        "disabled": disabled,
    }
    if emoji is not None:
        button["emoji"] = emoji
    return button
