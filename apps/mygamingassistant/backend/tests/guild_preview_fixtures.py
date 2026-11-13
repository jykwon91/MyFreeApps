"""Guilds for the link-preview card's tests and sample render."""
from __future__ import annotations

from datetime import datetime, timezone

from app.schemas.wow.guild.guild_member_response import GuildMemberResponse
from app.schemas.wow.guild.guild_response import GuildResponse

NOW = datetime(2026, 11, 13, 12, 0, tzinfo=timezone.utc)
CLASSES = ("Warrior", "Paladin", "Hunter", "Rogue", "Priest", "Shaman", "Mage", "Warlock", "Druid")


def make_member(
    name: str,
    surname: str = "",
    *,
    class_name: str | None = "Mage",
    level: int | None = 60,
    honorable_kills: int | None = None,
    dungeons_done: int | None = None,
    rank: int | None = 5,
    refreshed_at: datetime = NOW,
) -> GuildMemberResponse:
    return GuildMemberResponse(
        slug=f"{name}-{surname}".lower(), name=name, surname=surname, class_name=class_name, level=level,
        item_level=None, honorable_kills=honorable_kills, killing_blows=None, deaths_from_players=None,
        total_kills=None, total_deaths=None, dungeons_done=dungeons_done, exalted_reputations=None,
        baseline=None, professions=[], rank=rank, refreshed_at=refreshed_at,
    )


def make_guild(
    members: list[GuildMemberResponse], *, name: str = "topdeadcenter", faction: str = "alliance",
    roster_updated_at: datetime | None = NOW,
) -> GuildResponse:
    return GuildResponse(
        slug="topdeadcenter", name=name, faction=faction, roster_size=len(members), roster_updated_at=roster_updated_at,
        refresh_failed=False, refresh_failed_at=None, can_refresh=True, refresh_available_at=None, gone=False,
        gains_window_days=7, members=members,
    )


def realistic_guild(faction: str = "alliance", name: str = "topdeadcenter") -> GuildResponse:
    """31 members: long and accented names, a spread of classes and levels, a tie for most dungeon clears."""
    named = [
        ("Zoë", "Ãrthas"), ("Bartholomewsworth", "Featherstonehaugh"), ("Kel", "Thuzad"), ("Anduin", "Wrynn"),
        ("Mörgan", "Lé-Fay"), ("Thrall", "Doomhammer"), ("Jaina", "Proudmoore"), ("Sylvanas", "Windrunner"),
    ]
    members = []
    for index in range(31):
        first, surname = named[index] if index < len(named) else (f"Member{index}", "")
        members.append(make_member(
            first, surname, class_name=CLASSES[index % len(CLASSES)], level=60 if index < 12 else 20 + index,
            honorable_kills=12_400 - index * 410 if index % 3 else None,
            dungeons_done=[9, 9, 8, 7][index] if index < 4 else (index % 6 or None),
            rank=0 if index == 0 else 3,
        ))
    return make_guild(members, name=name, faction=faction)
