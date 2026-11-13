"""What the guild's link-preview card says: its subtitle and podium boards. Pure — no drawing, no I/O.

Ranked like the page's leaderboards (frontend ``rankBoard``): highest first, ties share a rank (1, 2, 2, 4) and
read by name, members without a number are left out (never ranked as 0). The card also leaves out zeros: a
"0 HKs" podium row says nothing.
"""
from __future__ import annotations

from collections.abc import Callable, Sequence

from app.core.guild_preview import COMPACT_FROM, MAX_LEVEL, PODIUM_SIZE
from app.schemas.wow.guild.guild_member_response import GuildMemberResponse
from app.schemas.wow.guild.guild_preview_board import GuildPreviewBoard
from app.schemas.wow.guild.guild_preview_entry import GuildPreviewEntry
from app.schemas.wow.guild.guild_response import GuildResponse

TITLE_HONORABLE_KILLS = "Most honorable kills"
TITLE_DUNGEON_CLEARS = "Most dungeon clears"
TITLE_HIGHEST_LEVEL = "Highest level"


def format_compact(value: int) -> str:
    """12400 -> "12.4k"; under 10,000 it is whole with a thousands comma ("1,234")."""
    if value < COMPACT_FROM:
        return f"{value:,}"
    return f"{round(value / 1000, 1):g}k"


def full_name(member: GuildMemberResponse) -> str:
    return f"{member.name} {member.surname}".strip()


def rank_members(
    members: Sequence[GuildMemberResponse], value_of: Callable[[GuildMemberResponse], int | None],
) -> list[GuildPreviewEntry]:
    """Every member with a number above 0, best first; ties share a rank and read by name."""
    scored = [(full_name(m), m.class_name, value) for m in members if (value := value_of(m)) is not None and value > 0]
    scored.sort(key=lambda row: (-row[2], row[0].casefold()))
    entries: list[GuildPreviewEntry] = []
    rank = 0
    for index, (name, class_name, value) in enumerate(scored):
        if index == 0 or scored[index - 1][2] != value:
            rank = index + 1
        entries.append(GuildPreviewEntry(rank=rank, name=name, class_name=class_name, value=value))
    return entries


def _podium(title: str, entries: list[GuildPreviewEntry]) -> GuildPreviewBoard | None:
    if not entries:
        return None
    return GuildPreviewBoard(title=title, entries=tuple(entries[:PODIUM_SIZE]))


def podium_boards(members: Sequence[GuildMemberResponse]) -> list[GuildPreviewBoard]:
    """The card's panels, at most two: honorable kills and dungeon clears.

    A board nobody has a number on gives way to "Highest level" (shown once, even if both are empty);
    with no levels either the card has no panels.
    """
    kills = _podium(TITLE_HONORABLE_KILLS, rank_members(members, lambda m: m.honorable_kills))
    dungeons = _podium(TITLE_DUNGEON_CLEARS, rank_members(members, lambda m: m.dungeons_done))
    boards = [board for board in (kills, dungeons) if board is not None]
    if len(boards) < 2:
        level = _podium(TITLE_HIGHEST_LEVEL, rank_members(members, lambda m: m.level))
        if level is not None:
            boards.append(level)
    return boards


def subtitle(guild: GuildResponse) -> str:
    """"Alliance · 31 members · 12 at 60": the faction, the members with a profile, those at the cap."""
    parts: list[str] = []
    if guild.faction:
        parts.append(guild.faction.capitalize())
    count = len(guild.members)
    parts.append(f"{count} {'member' if count == 1 else 'members'}")
    at_cap = sum(1 for m in guild.members if m.level == MAX_LEVEL)
    if at_cap > 0:
        parts.append(f"{at_cap} at {MAX_LEVEL}")
    return " · ".join(parts)
