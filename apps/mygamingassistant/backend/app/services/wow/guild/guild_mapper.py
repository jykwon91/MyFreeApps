"""Blizzard's guild JSON → ``GuildIdentity`` / ``GuildRoster``.

Anything malformed is dropped, never guessed: a guild without an id, a known
faction, a name and a slug of letters, digits and hyphens (each within its
column) is not stored; a roster entry without a character id and a rank in
0..``GUILD_RANK_MAX`` is skipped. An entry whose slug isn't a valid character
name still counts as a member (by id), with ``slug`` None.
"""
from __future__ import annotations

from typing import Any

from app.core.wow_guild import (
    GUILD_FACTIONS,
    GUILD_NAME_MAX_LENGTH,
    GUILD_RANK_MAX,
    GUILD_SLUG_MAX_LENGTH,
    GUILD_SLUG_PATTERN,
)
from app.services.wow.character.character_json import as_dict, as_int, as_list, as_str
from app.services.wow.character.character_slug import normalize_character_slug
from app.services.wow.guild.guild_identity import GuildIdentity
from app.services.wow.guild.guild_roster import GuildRoster
from app.services.wow.guild.guild_roster_member import GuildRosterMember


def to_guild_identity(raw: Any) -> GuildIdentity | None:
    """``profile["guild"]`` or ``/data/wow/guild/{slug}`` → the guild, or None."""
    data = as_dict(raw)
    blizzard_id = as_int(data.get("id"))
    slug = (as_str(data.get("slug")) or "").lower()
    name = as_str(data.get("name"))
    faction = as_str(as_dict(data.get("faction")).get("type"))
    if blizzard_id is None or faction not in GUILD_FACTIONS:
        return None
    if not name or len(name) > GUILD_NAME_MAX_LENGTH:
        return None
    if len(slug) > GUILD_SLUG_MAX_LENGTH or not GUILD_SLUG_PATTERN.fullmatch(slug):
        return None
    return GuildIdentity(blizzard_guild_id=blizzard_id, slug=slug, name=name, faction=faction)


def to_roster(raw: Any) -> GuildRoster:
    """``/data/wow/guild/{slug}/roster`` → the readable members and how many were listed."""
    entries = as_list(as_dict(raw).get("members"))
    members: list[GuildRosterMember] = []
    for entry in entries:
        character = as_dict(as_dict(entry).get("character"))
        blizzard_id = as_int(character.get("id"))
        rank = as_int(as_dict(entry).get("rank"))
        if blizzard_id is None or rank is None or not 0 <= rank <= GUILD_RANK_MAX:
            continue
        slug = normalize_character_slug(as_str(character.get("slug")) or "")
        members.append(GuildRosterMember(slug=slug, blizzard_character_id=blizzard_id, rank=rank))
    return GuildRoster(members=members, listed=len(entries))
