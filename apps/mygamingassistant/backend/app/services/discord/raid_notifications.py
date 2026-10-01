"""Message builders for the scheduled raid notifications — pure, no DB, no I/O.

The worker (``app/services/wow/raid_notification_worker.py``) loads the
data and sends; everything that decides *what* a message says, who it pings
and how it fits Discord's limits lives here so it can be unit-tested
directly.

Mentions are always explicit: every payload carries ``allowed_mentions``
with ``parse: []`` plus only the role / user ids that message is meant to
ping.  Never @everyone / @here.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Any, Final
from zoneinfo import ZoneInfo

from platform_shared.services.discord import MESSAGE_FLAG_SUPPRESS_NOTIFICATIONS

from app.services.discord import raid_copy
from app.services.wow.raid_catalog import effective_spec
from app.services.wow.raid_composition import RoleGaps
from app.services.wow.raid_consumables import ConsumableChecklist, ConsumableItem
from app.services.wow.raid_embed import COLOR_OPEN, EMBED_TOTAL_BUDGET, FIELD_VALUE_LIMIT, embed_length
from app.services.wow.raid_roster import RosterSummary

CONTENT_LIMIT: Final = 2000
# Discord rejects allowed_mentions.users lists longer than 100.
MAX_MENTIONED_USERS: Final = 100
# The 24h nudge pings only while fewer than 70% of the seats are taken.
LATE_NUDGE_PING_PERCENT: Final = 70

# Classes whose DPS spec is a caster for consumables purposes.  Balance
# druids / elemental shamans exist, but the bot doesn't know specs — the
# class default (physical) matches the consumables dataset's own default.
_TIER_TITLES: Final[tuple[tuple[str, str], ...]] = (
    ("essential", "Essential"),
    ("recommended", "Recommended"),
    ("tryhard", "Tryhard"),
)
# Trimming order when the embed doesn't fit: lowest-value tier first.
_TRIM_ORDER: Final[tuple[str, ...]] = ("tryhard", "recommended", "essential")


def no_mentions() -> dict[str, Any]:
    return {"parse": []}


# ---------------------------------------------------------------------------
# Signup nudge (channel, 48h / 24h)
# ---------------------------------------------------------------------------


def _plural(count: int, singular: str, plural: str) -> str:
    return f"{count} {singular if count == 1 else plural}"


def still_need_parts(gaps: RoleGaps) -> list[str]:
    """'2 tanks', '6 healers' — the scarce roles only; open spots cover DPS."""
    parts: list[str] = []
    if gaps.tanks:
        parts.append(_plural(gaps.tanks, "tank", "tanks"))
    if gaps.healers:
        parts.append(_plural(gaps.healers, "healer", "healers"))
    return parts


def should_ping_nudge(*, early: bool, summary: RosterSummary, gaps: RoleGaps) -> bool:
    """Role ping rule: the early (48h) nudge pings when a scarce role is short;
    later nudges ping only while the raid is under 70% full."""
    if early:
        return gaps.any_scarce
    return summary.seats_taken * 100 < summary.size_cap * LATE_NUDGE_PING_PERCENT


def build_signup_nudge(
    *,
    raid_label: str,
    starts_unix: int,
    summary: RosterSummary,
    gaps: RoleGaps,
    early: bool,
    ping_role_id: str | None,
    signup_link: str | None,
) -> dict[str, Any] | None:
    """The nudge message payload, or None when the raid is full (no nudge)."""
    if summary.is_full:
        return None
    sentences = [
        raid_copy.nudge_headline(raid_label, starts_unix),
        f"{summary.seats_taken} of {summary.size_cap} confirmed.",
    ]
    parts = still_need_parts(gaps)
    if parts:
        sentences.append(f"Still need: **{', '.join(parts)}**.")
    sentences.append(f"{_plural(summary.open_seats, 'spot', 'spots')} open.")
    if signup_link:
        sentences.append(f"[Sign up]({signup_link})")
    content = " ".join(sentences)

    if ping_role_id and should_ping_nudge(early=early, summary=summary, gaps=gaps):
        return {
            "content": f"<@&{ping_role_id}> {content}",
            "allowed_mentions": {"parse": [], "roles": [ping_role_id]},
        }
    return {
        "content": content,
        "allowed_mentions": no_mentions(),
        "flags": MESSAGE_FLAG_SUPPRESS_NOTIFICATIONS,
    }


# ---------------------------------------------------------------------------
# User-mention messages (ready check, DM fallback)
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class MentionChunk:
    content: str
    user_ids: list[str]


def chunk_user_mentions(head: str, tail: str, user_ids: list[str]) -> list[MentionChunk]:
    """Split ``head + <@a> <@b> … + tail`` into messages Discord accepts.

    Each chunk stays within 2000 characters and 100 mentioned users.  One
    message in the normal case; a very large raid spills into more.
    """
    unique_ids = list(dict.fromkeys(user_ids))
    budget = CONTENT_LIMIT - len(head) - len(tail)
    chunks: list[MentionChunk] = []
    current: list[str] = []
    used = 0
    for user_id in unique_ids:
        mention_len = len(f"<@{user_id}>") + (1 if current else 0)
        if current and (used + mention_len > budget or len(current) >= MAX_MENTIONED_USERS):
            chunks.append(_mention_chunk(head, tail, current))
            current, used = [], 0
            mention_len -= 1
        current.append(user_id)
        used += mention_len
    if current:
        chunks.append(_mention_chunk(head, tail, current))
    return chunks


def _mention_chunk(head: str, tail: str, user_ids: list[str]) -> MentionChunk:
    mentions = " ".join(f"<@{user_id}>" for user_id in user_ids)
    return MentionChunk(content=f"{head}{mentions}{tail}", user_ids=list(user_ids))


def mention_payload(chunk: MentionChunk) -> dict[str, Any]:
    return {
        "content": chunk.content,
        "allowed_mentions": {"parse": [], "users": chunk.user_ids},
    }


def build_ready_check(*, raid_label: str, starts_unix: int, user_ids: list[str]) -> list[dict[str, Any]]:
    """Ready-check posts mentioning the seated players (no role ping)."""
    head = raid_copy.ready_check_headline(raid_label, starts_unix) + "\n"
    return [mention_payload(chunk) for chunk in chunk_user_mentions(head, "", user_ids)]


def build_dm_fallback(user_ids: list[str]) -> list[dict[str, Any]]:
    """'I couldn't DM @A @B. …' — mentions only the players the DM missed."""
    chunks = chunk_user_mentions(raid_copy.DM_FALLBACK_HEAD, raid_copy.DM_FALLBACK_TAIL, user_ids)
    return [mention_payload(chunk) for chunk in chunks]


# ---------------------------------------------------------------------------
# Consumables DM (24h)
# ---------------------------------------------------------------------------


def consumables_role(wow_class: str | None, role: str | None, spec: str | None = None) -> str | None:
    """The player's spec → the consumables dataset's role vocabulary.

    Caster specs (Balance, Elemental, Shadow, every Mage and Warlock spec) get
    caster consumables, other DPS specs physical ones.  A sign-up from before
    specs uses the Classic default spec for its class and role.
    """
    info = effective_spec(wow_class, role, spec)
    if info is not None:
        if info.spec_role == "caster":
            return "dps_caster"
        role = info.raid_role
    if role in ("tank", "healer"):
        return role
    if role == "dps":
        return "dps_physical"
    return None


def day_word(starts_at: datetime, now: datetime, tz_name: str) -> str:
    """'today' / 'tomorrow' / 'on Sat' — in the guild's timezone."""
    tz = ZoneInfo(tz_name)
    start_local = starts_at.astimezone(tz)
    days = (start_local.date() - now.astimezone(tz).date()).days
    if days == 0:
        return "today"
    if days == 1:
        return "tomorrow"
    return f"on {start_local:%a}"


def _item_line(item: ConsumableItem) -> str:
    name = item.name.replace("[", "(").replace("]", ")")
    return f"[{name}]({item.wowhead_url}) — {item.why}"


def _tier_value(lines: list[str], dropped: int) -> str:
    rows = list(lines)
    if dropped:
        rows.append(f"+{dropped} more")
    return "\n".join(rows)


def _tier_fields(kept: dict[str, list[str]], dropped: dict[str, int]) -> list[dict[str, Any]]:
    fields: list[dict[str, Any]] = []
    for tier, title in _TIER_TITLES:
        if not kept[tier] and not dropped[tier]:
            continue
        fields.append({"name": title, "value": _tier_value(kept[tier], dropped[tier]), "inline": False})
    return fields


def _tier_to_trim(kept: dict[str, list[str]], dropped: dict[str, int], base_len: int) -> str | None:
    """Which tier loses its last item next, or None when the embed fits."""
    over_field = [
        tier for tier in _TRIM_ORDER
        if kept[tier] and len(_tier_value(kept[tier], dropped[tier])) > FIELD_VALUE_LIMIT
    ]
    if over_field:
        return over_field[0]
    fields = _tier_fields(kept, dropped)
    total = base_len + sum(len(f["name"]) + len(f["value"]) for f in fields)
    if total <= EMBED_TOTAL_BUDGET:
        return None
    return next((tier for tier in _TRIM_ORDER if kept[tier]), None)


def build_consumables_embed(
    *,
    title: str,
    starts_unix: int,
    checklist: ConsumableChecklist,
    signup_link: str | None,
) -> dict[str, Any]:
    """The per-player checklist embed; trims Tryhard first to fit Discord's limits."""
    description_lines = [f"<t:{starts_unix}:F> (<t:{starts_unix}:R>)"]
    if checklist.classic_advice:
        description_lines.append(raid_copy.CLASSIC_CAVEAT)
    if signup_link:
        description_lines.append(f"[Jump to the raid]({signup_link})")
    embed: dict[str, Any] = {
        "title": title[:256],
        "description": "\n".join(description_lines),
        "color": COLOR_OPEN,
        "footer": {"text": raid_copy.DM_FOOTER},
    }
    base_len = embed_length(embed)

    kept: dict[str, list[str]] = {
        "essential": [_item_line(item) for item in checklist.essential],
        "recommended": [_item_line(item) for item in checklist.recommended],
        "tryhard": [_item_line(item) for item in checklist.tryhard],
    }
    dropped: dict[str, int] = {tier: 0 for tier in kept}
    while (tier := _tier_to_trim(kept, dropped, base_len)) is not None:
        kept[tier].pop()
        dropped[tier] += 1

    fields = _tier_fields(kept, dropped)
    if fields:
        embed["fields"] = fields
    return embed


def build_consumables_dm(
    *,
    title: str,
    starts_unix: int,
    checklist: ConsumableChecklist,
    signup_link: str | None,
) -> dict[str, Any]:
    embed = build_consumables_embed(
        title=title, starts_unix=starts_unix, checklist=checklist, signup_link=signup_link
    )
    return {"embeds": [embed], "allowed_mentions": no_mentions()}


def build_generic_reminder_dm(*, raid_label: str, starts_unix: int, signup_link: str | None) -> dict[str, Any]:
    return {
        "content": raid_copy.generic_reminder_dm(raid_label, starts_unix, signup_link),
        "allowed_mentions": no_mentions(),
    }
