"""Raid: Unsigned's cards — who hasn't signed up, its ping form, and /raid-admin raiders.

Every card is private and never pings (``ephemeral_data``'s allowed mentions
are none); the ping itself goes out through ``raid_ping``.

The list: the raid, whether sign-ups are closed, the roles checked and where
they came from, then the members not signed up under the class they last
signed up as ("No class yet" last), then why [Ping them] is off, if it is.
While the raid is on, a role menu above [Ping them] [Refresh] [Back] picks
the roles checked for it.
"""
from __future__ import annotations

from collections.abc import Sequence
from typing import Any

from platform_shared.services.discord import (
    BUTTON_STYLE_PRIMARY,
    BUTTON_STYLE_SECONDARY,
    COMPONENT_TYPE_LABEL,
    COMPONENT_TYPE_TEXT_INPUT,
    TEXT_INPUT_STYLE_PARAGRAPH,
    EmojiSet,
)

from app.models.wow.wow_raid_event import WowRaidEvent
from app.services.discord import raid_unsigned_copy
from app.services.discord.interaction import ephemeral_data, modal_response
from app.services.discord.raid_leader_views import PING_FIELD, PING_MAX_CHARS, raid_line
from app.services.discord.raid_views import EMBED_DESCRIPTION_LIMIT, action_row, button, clip_lines, role_menu
from app.services.wow import raid_custom_id
from app.services.wow.raid_deadline import CLOSED_HINT
from app.services.wow.raid_embed import column_heading, post_color
from app.services.wow.raid_text import display_title, escape_name, icon_text
from app.services.wow.raid_unsigned import Member, PingBlock, Pool


def unsigned_data(
    event: WowRaidEvent,
    *,
    pool: Pool,
    expected_count: int,
    columns: Sequence[tuple[str, Sequence[Member]]],
    truncated: bool,
    block: PingBlock | None,
    emojis: EmojiSet,
    notice: str | None = None,
) -> dict[str, Any]:
    """The members of *pool* not signed up, by *columns* (``raid_unsigned.by_class``).

    *expected_count* is how many hold the roles; *block* is why [Ping them]
    is off (``raid_unsigned.ping_block``).  *notice* goes above the list.
    """
    assert pool.source is not None
    head = [raid_line(event)]
    if event.closed_at is not None:
        head.append(icon_text(emojis, "info_lock", f"**{CLOSED_HINT}**"))
    head.append(raid_unsigned_copy.pool_line(pool.role_ids, pool.source))
    sections = ["\n".join(head)]
    for column, members in columns:
        names = ", ".join(escape_name(member.name) for member in members)
        sections.append(f"**{column_heading(column, len(members), emojis)}**\n{names}")
    if not columns:
        sections.append(raid_unsigned_copy.ALL_SIGNED)
    # The reason [Ping them] is off stays in view however long the list runs.
    tail = ""
    block_line = raid_unsigned_copy.block_line(block)
    if block_line is not None:
        tail = f"\n\n{block_line}"
    embed = {
        "title": raid_unsigned_copy.title(sum(len(members) for _, members in columns)),
        "description": clip_lines("\n\n".join(sections), EMBED_DESCRIPTION_LIMIT - len(tail)) + tail,
        "color": post_color(event),
        "footer": {"text": raid_unsigned_copy.footer(str(event.id)[:6], expected_count, truncated=truncated)},
    }
    ping = button(
        raid_unsigned_copy.PING_BUTTON, BUTTON_STYLE_PRIMARY, _verb(event, "ping"), disabled=block is not None
    )
    rows = [*_role_rows(event, pool.role_ids), action_row(ping, _refresh(event), _back(event))]
    return ephemeral_data(notice or "", components=rows, embeds=[embed])


def no_pool_data(event: WowRaidEvent, *, admin: bool, notice: str | None = None) -> dict[str, Any]:
    """No roles to check anywhere: the menu to pick them (and, for Manage Server, where the default is set)."""
    lines = [raid_line(event), raid_unsigned_copy.NO_POOL]
    if admin:
        lines.append(raid_unsigned_copy.NO_POOL_ADMIN)
    if notice:
        lines.append(notice)
    return ephemeral_data("\n".join(lines), components=_role_rows(event, ()), embeds=[])


def error_data(event: WowRaidEvent, text: str) -> dict[str, Any]:
    """The member list couldn't be read: why, with [Refresh] and [Back]."""
    rows = [action_row(_refresh(event), _back(event))]
    return ephemeral_data(f"{raid_line(event)}\n{text}", components=rows, embeds=[])


def checking_data(text: str) -> dict[str, Any]:
    """'Checking…' while the member list is read in the background (no buttons to press twice)."""
    return ephemeral_data(text, components=[], embeds=[])


def unsigned_ping_modal(event: WowRaidEvent) -> dict[str, Any]:
    """[Ping them] — the message to send, prefilled with a nudge to sign up."""
    message = {
        "type": COMPONENT_TYPE_TEXT_INPUT,
        "custom_id": PING_FIELD,
        "style": TEXT_INPUT_STYLE_PARAGRAPH,
        "min_length": 1,
        "max_length": PING_MAX_CHARS,
        "required": True,
        "value": raid_unsigned_copy.ping_prefill(display_title(event))[:PING_MAX_CHARS],
    }
    field = {
        "type": COMPONENT_TYPE_LABEL,
        "label": raid_unsigned_copy.FIELD_LABEL,
        "description": raid_unsigned_copy.FIELD_HINT,
        "component": message,
    }
    return modal_response(raid_custom_id.encode("m", event.id, "uping"), raid_unsigned_copy.MODAL_TITLE, [field])


def raiders_data(role_ids: Sequence[str], *, notice: str | None = None) -> dict[str, Any]:
    """``/raid-admin raiders``: the server's raider roles in a menu; emptying it clears them."""
    lines = [raid_unsigned_copy.RAIDERS_PROMPT]
    if notice:
        lines.append(notice)
    custom_id = raid_custom_id.encode(raid_custom_id.RAIDERS_PICK)
    menu = role_menu(custom_id, raid_unsigned_copy.RAIDERS_PLACEHOLDER, role_ids)
    return ephemeral_data("\n".join(lines), components=[action_row(menu)], embeds=[])


def _role_rows(event: WowRaidEvent, role_ids: Sequence[str]) -> list[dict[str, Any]]:
    """The raid's role menu while it's on; a raid that's done keeps the roles it had."""
    if event.status != "scheduled":
        return []
    return [action_row(role_menu(_verb(event, "roles"), raid_unsigned_copy.ROLE_PLACEHOLDER, role_ids))]


def _verb(event: WowRaidEvent, verb: str) -> str:
    return raid_custom_id.encode("un", event.id, verb)


def _refresh(event: WowRaidEvent) -> dict[str, Any]:
    return button(raid_unsigned_copy.REFRESH, BUTTON_STYLE_SECONDARY, _verb(event, "refresh"))


def _back(event: WowRaidEvent) -> dict[str, Any]:
    return button(raid_unsigned_copy.BACK, BUTTON_STYLE_SECONDARY, _verb(event, "back"))
