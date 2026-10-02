"""Text the raid bot's messages share — titles, times, names, seats, icons.

Pure helpers for the post (``raid_embed``), the private cards and roster
(``raid_views``), the publisher and the notifications: the raid's title,
its day and server time in the guild's timezone, Discord-markdown
escaping and trimmed names, the seats summary, list headings, and the
class / spec icons with their text fallback ("[WAR]") while the emojis
aren't uploaded.
"""
from __future__ import annotations

import re
from datetime import datetime
from typing import Final
from zoneinfo import ZoneInfo

from platform_shared.services.discord import EmojiSet

from app.models.wow.wow_raid_event import WowRaidEvent
from app.models.wow.wow_raid_signup import WowRaidSignup
from app.services.wow.raid_catalog import CLASSES_BY_KEY, effective_spec, raid_name, spec_info
from app.services.wow.raid_roster import RosterSummary

MAX_NAME_CHARS: Final = 32

_MARKDOWN_SPECIALS: Final = re.compile(r"([\\*_~`|>\[\]])")
# A name can start a line: a heading, bullet or numbered list there shows as typed.
_LEADING_MARK: Final = re.compile(r"^([#+-])")
_LEADING_NUMBER: Final = re.compile(r"^(\d+)\.")
# Said after the count, so the bench isn't mistaken for seats.
_STATUS_HINTS: Final[dict[str, str]] = {"bench": "backups"}


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
    """Trim to *max_chars* and escape Discord markdown so names render literally.

    A leading ``#``, ``-``, ``+`` or ``1.`` is escaped too, since a name can
    start a line, and ``://`` gets a zero-width space so a name never links.
    """
    name = " ".join(display_name.split())
    if len(name) > max_chars:
        name = name[: max_chars - 1] + "…"
    name = _LEADING_NUMBER.sub(r"\1\\.", _LEADING_MARK.sub(r"\\\1", escape_markdown(name)))
    return name.replace("://", ":\u200b//")


def seats_label(summary: RosterSummary) -> str:
    """'14/40 confirmed (2 late) · 3 in queue' — late players hold seats too."""
    return f"{summary.seats_taken}/{summary.size_cap} confirmed{seats_detail(summary)}"


def seats_detail(summary: RosterSummary) -> str:
    """' (2 late) · 3 in queue' — what follows the confirmed count."""
    detail = ""
    if summary.late_count:
        detail += f" ({summary.late_count} late)"
    if summary.queued_count:
        detail += f" · {summary.queued_count} in queue"
    return detail


def status_heading(status: str, label: str, count: int) -> str:
    """'Bench (2) · backups' — the count, plus a hint for the bench."""
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
