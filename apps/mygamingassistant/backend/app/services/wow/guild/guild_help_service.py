"""Guild help tab: return each live member's equipped items, recipe ability ids, and talents.

The frontend does all matching and scoring client-side.  The service only reads
the stored sheets (already in the DB) and projects what the tab needs.  Members
whose sheet is stale (wrong version) or missing are silently skipped — they just
won't appear in the matcher.
"""
from __future__ import annotations

import logging

from app.db.session import unit_of_work
from app.repositories.wow import guild_repo
from app.schemas.wow.guild.guild_help_response import (
    GuildHelpEquippedItem,
    GuildHelpMember,
    GuildHelpProfession,
    GuildHelpResponse,
    GuildHelpTalentTree,
)
from app.services.wow.character.character_sheet_codec import read_sheet

logger = logging.getLogger(__name__)


async def get_help(slug: str) -> GuildHelpResponse | None:
    """The guild help data for every live member, or None when the guild isn't stored."""
    async with unit_of_work() as db:
        guild = await guild_repo.get_by_slug(db, slug)
        if guild is None:
            return None
        if guild.gone_at is not None:
            return GuildHelpResponse(members=[])
        rows = await guild_repo.member_sheets(db, guild.id)

    members: list[GuildHelpMember] = []
    for row in rows:
        sheet = read_sheet(row.sheet, row.sheet_version)
        if sheet is None:
            # Sheet belongs to a different schema version: skip; the next character
            # fetch will refresh it.
            logger.debug("guild help: skipping %s — sheet version mismatch", row.slug)
            continue

        equipped = [
            GuildHelpEquippedItem(
                slot=item.slot,
                item_id=item.item_id,
                name=item.name,
                item_level=item.item_level,
                inventory_type=item.inventory_type,
                enchantments=item.enchantments,
            )
            for item in sheet.items
        ]

        recipe_ability_ids: list[int] = []
        help_profs: list[GuildHelpProfession] = []
        if sheet.professions:
            for prof in sheet.professions.primaries + sheet.professions.secondaries:
                recipe_ability_ids.extend(r.id for r in prof.recipes)
                help_profs.append(
                    GuildHelpProfession(
                        profession_id=prof.id,
                        name=prof.name,
                        skill=prof.skill,
                        max_skill=prof.max_skill,
                    )
                )

        # Talent tree points from wow_character.talent_points (active set only).
        # None when never fetched or the last Blizzard call failed.
        talents: list[GuildHelpTalentTree] | None = None
        if row.talent_points is not None:
            talents = [
                GuildHelpTalentTree(tree_id=tp["tree_id"], points=tp["points"])
                for tp in row.talent_points
                if tp.get("points", 0) > 0
            ]

        members.append(
            GuildHelpMember(
                slug=sheet.slug,
                name=sheet.name,
                surname=sheet.surname,
                class_name=sheet.class_name,
                level=sheet.level,
                equipped=equipped,
                recipe_ability_ids=recipe_ability_ids,
                professions=help_profs,
                talents=talents,
            )
        )

    return GuildHelpResponse(members=members)
