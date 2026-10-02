"""Public raid signup message — a PURE function of (event, signups, guild).

Builds the embed + button rows for the signup post, laid out like
Raid-Helper's (in our own art).  Used for the initial post (REST), every
button click (UPDATE_MESSAGE, type 7), every edit / cancellation (REST edit)
and the create preview.  No I/O, no clock — times are Discord ``<t:…>``
timestamps, so every viewer sees their own local time.  The banner's URL
comes from the committed art and the app's public origin (``raid_banners``).

Layout
------
Author       "Onyxia's Lair · Leader: Thrall"      ("CANCELLED · " prefix when cancelled;
             the leader is whoever the raid was handed to, else its creator)
Description  the title in letter tiles (else "## Onyxia's Lair")
             {date} <t:X:D>  {time} <t:X:t>  {signups} **14/40** confirmed (2 late) · 3 in queue
             {globe} Server time: Sat 8:00 PM EDT  {countdown} <t:X:R>
             {lock} **Sign-ups are closed.**        (once the leader closes them)
             notes
             {tank} Tanks **2**  {melee} Melee **6**  {ranged} Ranged **4**  {healer} Healers **2**
             (a role the raid limits shows its players in line over the limit: Tanks **2/2**)
Fields       one inline column per button with anyone in it, "{icon} Warrior (3)":
             "{spec icon} `1` **Alice**" per line, in line order; late players
             end with {late}, the queue is ~~struck~~ and ends with {queued};
             then Tentative / Bench / Absence as "{spec icon} Name" lists.
             While sign-ups are open, "Nobody yet" names the empty columns, so
             every class button's icon is labelled somewhere on the post.
Image        the leader's banner link, else the raid's banner (``raid_banners``),
             until the raid is cancelled.
Footer       "ID a1b2c3 · Tap your class to sign up. My sign-up changes your spec."
             ("Sign-ups are closed." once closed, "This raid was cancelled.")
Colors       the leader's pick (``raid_colors``, purple by default); grey once
             sign-ups close or the raid is cancelled.
Buttons      [Tank] + one per class (icon + column count, "3/4" under a limit), then [Late]
             [Tentative] [Bench] [Absence] [My sign-up] — ``raid_post_buttons``.

Icons are the bot's application emojis.  Without them (before the first
emoji sync) a class shows as a text tag ("[WAR]"), a class button as
"WAR 3", the markers as "(late)" / "(queued)", and the title as plain text.

Discord limits & degradation
----------------------------
Each field value ≤ 1024 chars, the whole embed ≤ 6000 (we budget 5800; the
banner's URL doesn't count).
When the post doesn't fit, it gives up detail in order until it does:
  1. the order numbers;
  2. the entry icons (markers become text; the Tanks column and the lists
     keep a class tag);
  3. the letter tiles (plain-text title);
  4. names beyond 9 characters;
  5. names past a cap per list, which become "+N more" (down to none).
A column too long for its field takes the next steps on its own.  Each
level's length comes from running totals (``raid_post_fit``), so the post
is rendered once, however long its lists.
My sign-up → [Full roster] always shows the complete list privately.
"""
from __future__ import annotations

from collections.abc import Callable, Sequence
from dataclasses import dataclass, replace
from functools import partial
from typing import Any, Final

from platform_shared.services.discord import EmojiSet

from app.models.wow.wow_raid_event import WowRaidEvent
from app.models.wow.wow_raid_guild import WowRaidGuild
from app.models.wow.wow_raid_signup import WowRaidSignup
from app.services.wow.raid_banners import banner_url
from app.services.wow.raid_catalog import TANK_COLUMN, column_icon, column_label
from app.services.wow.raid_colors import DEFAULT_COLOR
from app.services.wow.raid_details import leader_name, mention_roles
from app.services.wow.raid_limits import Limits, role_row
from app.services.wow.raid_post_buttons import build_signup_components
from app.services.wow.raid_post_fit import FittedField, Lines
from app.services.wow.raid_post_layout import (
    NO_CLASS_COLUMN,
    NO_CLASS_LABEL,
    ROLE_ROW,
    post_columns,
    tile_line,
    with_status,
)
from app.services.wow.raid_roster import (
    QUEUED_STATUS,
    RosterSummary,
    compute_roster_summary,
    order_numbers,
)
from app.services.wow.raid_text import (
    MAX_NAME_CHARS,
    class_tag,
    display_title,
    escape_markdown,
    escape_name,
    icon_text,
    seats_detail,
    server_time_label,
    signup_icon,
    status_heading,
)

COLOR_OPEN: Final = DEFAULT_COLOR.value
COLOR_CLOSED: Final = 0x95A5A6  # sign-ups closed, or the raid cancelled

FIELD_VALUE_LIMIT: Final = 1024
AUTHOR_NAME_LIMIT: Final = 256
EMBED_TOTAL_BUDGET: Final = 5800  # Discord's hard cap is 6000; keep headroom.
POST_NAME_CHARS: Final = 12  # three columns side by side on a desktop
SHORT_NAME_CHARS: Final = 9

NOBODY_YET: Final = "Nobody yet"
SIGN_UP_HINT: Final = "Tap your class to sign up. My sign-up changes your spec."
CLOSED_HINT: Final = "Sign-ups are closed."
EM_SPACE: Final = " "

NO_MENTIONS: Final[dict[str, Any]] = {"parse": []}

# Event statuses that still take sign-ups (a draft is the create preview).
_OPEN_STATUSES: Final = ("draft", "scheduled")
_FOOTER_HINTS: Final[dict[str, str]] = {
    "cancelled": "This raid was cancelled.",
    "completed": CLOSED_HINT,
}
# The lists under the columns: (status, label, icon).
STATUS_LISTS: Final = (
    ("tentative", "Tentative", "status_tentative"),
    ("bench", "Bench", "status_bench"),
    ("absence", "Absence", "status_absence"),
)
# After a name in a column: (icon, text when the icon is missing or dropped).
_MARKERS: Final[dict[str, tuple[str, str]]] = {
    "late": ("status_late", "(late)"),
    QUEUED_STATUS: ("status_queued", "(queued)"),
}


@dataclass(frozen=True)
class _Style:
    """How much detail the post shows (see "degradation" above)."""

    numbers: bool = True  # order numbers in the columns
    icons: bool = True  # spec and marker icons on each entry
    tiles: bool = True  # the title in letter tiles
    name_chars: int = POST_NAME_CHARS
    cap: int | None = None  # names shown per list; the rest are "+N more"

    @property
    def look(self) -> tuple[bool, bool, int]:
        """What an entry's text depends on: not the cap, not the tiles."""
        return (self.numbers, self.icons, self.name_chars)


@dataclass(frozen=True)
class _Roster:
    """The post's lists, worked out once and rendered at each level of detail."""

    columns: dict[str, list[WowRaidSignup]]  # columns with anyone in them, in post order
    empty_columns: list[str]
    lists: dict[str, list[WowRaidSignup]]  # tentative / bench / absence
    numbers: dict[str, int]
    roles: dict[str, str]  # the role row: seat holders, or "3/4" under a limit

    @classmethod
    def of(cls, signups: Sequence[WowRaidSignup], limits: Limits) -> _Roster:
        by_column = post_columns(signups)
        return cls(
            columns={column: players for column, players in by_column.items() if players},
            empty_columns=[column for column, players in by_column.items() if not players],
            lists={status: with_status(signups, status) for status, _, _ in STATUS_LISTS},
            numbers=order_numbers(signups),
            roles=role_row(signups, limits),
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
    """The first post of a raid: same message, plus the raid's role pings.

    The roles are those picked for the raid, else the server's ping role
    (``mention_roles``).  ``allowed_mentions`` names exactly those roles —
    never @everyone/@here, never users.  ``ping_role=False`` posts it
    without a ping.
    """
    message = build_signup_message(event, signups, guild, emojis=emojis)
    if not ping_role:
        return message
    roles = mention_roles(event, guild)
    if roles:
        message["content"] = " ".join(f"<@&{role_id}>" for role_id in roles)
        message["allowed_mentions"] = {"parse": [], "roles": roles}
    return message


def build_signup_embed(
    event: WowRaidEvent,
    signups: Sequence[WowRaidSignup],
    guild: WowRaidGuild,
    *,
    emojis: EmojiSet,
) -> dict[str, Any]:
    summary = compute_roster_summary(signups, size_cap=event.size_cap)
    roster = _Roster.of(signups, Limits.of(event))
    ladder = _ladder(roster.longest)
    fields = _fitted_fields(event, roster, ladder, emojis)
    descriptions = {tiles: _description(event, guild, summary, roster, tiles, emojis) for tiles in (True, False)}
    author, footer = _author(event), _footer(event)
    level = _first_fit(ladder, len(author) + len(footer), descriptions, fields)
    embed: dict[str, Any] = {
        "author": {"name": author},
        "description": descriptions[ladder[level].tiles],
        "color": post_color(event),
        "footer": {"text": footer},
    }
    if fields:
        embed["fields"] = [field.field(level) for field in fields]
    banner = _banner(event)
    if banner:
        embed["image"] = {"url": banner}
    return embed


def embed_length(embed: dict[str, Any]) -> int:
    """Characters Discord counts toward the 6000 total."""
    total = len(embed.get("title", "")) + len(embed.get("description", ""))
    total += len(embed.get("author", {}).get("name", ""))
    total += len(embed.get("footer", {}).get("text", ""))
    for embed_field in embed.get("fields", []):
        total += len(embed_field["name"]) + len(embed_field["value"])
    return total


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


def _first_fit(
    ladder: Sequence[_Style], base: int, descriptions: dict[bool, str], fields: Sequence[FittedField]
) -> int:
    """The richest level within the budget; else the leanest, which is bounded far below it."""
    for level, style in enumerate(ladder):
        total = base + len(descriptions[style.tiles]) + sum(field.length(level) for field in fields)
        if total <= EMBED_TOTAL_BUDGET:
            return level
    return len(ladder) - 1


def _author(event: WowRaidEvent) -> str:
    text = " ".join(display_title(event).split())
    leader = leader_name(event)
    if leader:
        text += f" · Leader: {' '.join(leader.split())[:MAX_NAME_CHARS]}"
    if event.status == "cancelled":
        text = f"CANCELLED · {text}"
    return text[:AUTHOR_NAME_LIMIT]


def _description(
    event: WowRaidEvent,
    guild: WowRaidGuild,
    summary: RosterSummary,
    roster: _Roster,
    tiles: bool,
    emojis: EmojiSet,
) -> str:
    unix = int(event.starts_at.timestamp())
    lines = [_title_line(event, tiles, emojis)]
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
                f"**{summary.seats_taken}/{summary.size_cap}** confirmed{seats_detail(summary)}",
            ),
        )
        server = (
            icon_text(emojis, "info_globe", f"Server time: {server_time_label(event.starts_at, guild.timezone)}"),
            icon_text(emojis, "info_countdown", f"<t:{unix}:R>"),
        )
        lines.append(EM_SPACE.join(when))
        lines.append(EM_SPACE.join(server))
        if event.closed_at is not None:
            lines.append(icon_text(emojis, "info_lock", f"**{CLOSED_HINT}**"))
    if event.notes:
        lines.append(event.notes)
    lines.append(
        EM_SPACE.join(
            icon_text(emojis, icon, f"{label} **{roster.roles[role]}**") for role, label, icon in ROLE_ROW
        )
    )
    return "\n".join(lines)


def _title_line(event: WowRaidEvent, tiles: bool, emojis: EmojiSet) -> str:
    title = display_title(event)
    if tiles:
        spelled = tile_line(title, emojis)
        if spelled is not None:
            return spelled
    return f"## {escape_markdown(' '.join(title.split()))}"


def _cancel_line(event: WowRaidEvent) -> str:
    if event.cancel_reason:
        return f"**Cancelled:** {event.cancel_reason}"
    return "**This raid has been cancelled.**"


def _footer(event: WowRaidEvent) -> str:
    hint = _FOOTER_HINTS.get(event.status, SIGN_UP_HINT)
    if event.closed_at is not None and event.status == "scheduled":
        hint = CLOSED_HINT
    return f"ID {str(event.id)[:6]} · {hint}"


def _banner(event: WowRaidEvent) -> str | None:
    """The leader's banner link, else the raid's banner; a cancelled post drops its art."""
    if event.status == "cancelled":
        return None
    return event.image_url or banner_url(event.raid_key)


def post_color(event: WowRaidEvent) -> int:
    """The leader's color (purple by default) while sign-ups are open; grey once they close or it's cancelled."""
    if event.status == "cancelled" or event.closed_at is not None:
        return COLOR_CLOSED
    if event.color is None:
        return COLOR_OPEN
    return event.color


# ---------------------------------------------------------------------------
# Fields
# ---------------------------------------------------------------------------


def _fitted_fields(
    event: WowRaidEvent, roster: _Roster, ladder: Sequence[_Style], emojis: EmojiSet
) -> list[FittedField]:
    fields: list[FittedField] = []
    for column, players in roster.columns.items():
        entries = partial(_column_entries, column=column, players=players, numbers=roster.numbers, emojis=emojis)
        fields.append(_fitted(column_heading(column, len(players), emojis), entries, "\n", ladder, inline=True))
    for status, label, icon in STATUS_LISTS:
        players = roster.lists[status]
        if players:
            name = icon_text(emojis, icon, status_heading(status, label, len(players)))
            fields.append(_fitted(name, partial(_list_entries, players=players, emojis=emojis), ", ", ladder))
    if roster.empty_columns and event.status in _OPEN_STATUSES and event.closed_at is None:
        legend = " · ".join(icon_text(emojis, column_icon(c), column_label(c)) for c in roster.empty_columns)
        fields.append(FittedField.fixed(NOBODY_YET, legend, levels=len(ladder)))
    return fields


def _fitted(
    name: str,
    entries: Callable[[_Style], list[str]],
    sep: str,
    ladder: Sequence[_Style],
    *,
    inline: bool = False,
) -> FittedField:
    """A list as a field at every level of *ladder*, rendering each look once."""
    looks: dict[tuple[bool, bool, int], Lines] = {}
    levels: list[tuple[Lines, int | None]] = []
    for style in ladder:
        if style.look not in looks:
            looks[style.look] = Lines.of(entries(style), sep)
        levels.append((looks[style.look], style.cap))
    return FittedField.of(name, levels, limit=FIELD_VALUE_LIMIT, inline=inline)


def column_heading(column: str, count: int, emojis: EmojiSet) -> str:
    """'{icon} Warrior (3)' — 'No class yet (1)' for sign-ups without a class."""
    if column == NO_CLASS_COLUMN:
        return f"{NO_CLASS_LABEL} ({count})"
    return icon_text(emojis, column_icon(column), f"{column_label(column)} ({count})")


def roster_entry(signup: WowRaidSignup, number: int | None, emojis: EmojiSet) -> str:
    """A column line with every detail and the full name, for the private roster."""
    return _column_entry(signup, "", number, _Style(name_chars=MAX_NAME_CHARS), emojis)


def _column_entries(
    style: _Style,
    *,
    column: str,
    players: Sequence[WowRaidSignup],
    numbers: dict[str, int],
    emojis: EmojiSet,
) -> list[str]:
    return [_column_entry(signup, column, numbers.get(signup.discord_user_id), style, emojis) for signup in players]


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


def _list_entries(style: _Style, *, players: Sequence[WowRaidSignup], emojis: EmojiSet) -> list[str]:
    """'{spec icon} Alice', '{spec icon} Bob' — no order numbers off the line."""
    return [_list_entry(signup, style, emojis) for signup in players]


def _list_entry(signup: WowRaidSignup, style: _Style, emojis: EmojiSet) -> str:
    name = escape_name(signup.display_name, max_chars=style.name_chars)
    if style.icons:
        tag = signup_icon(signup, emojis)
    else:
        tag = class_tag(signup.wow_class)
    return f"{tag} {name}".strip()
