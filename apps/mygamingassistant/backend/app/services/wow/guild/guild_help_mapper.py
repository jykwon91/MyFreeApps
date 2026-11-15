"""``GuildHelpRow`` → ``GuildHelpMember`` response model conversion.

Separating this from the service keeps the row-to-response logic testable in
isolation, following the pattern of ``guild_response_mapper.py`` and
``guild_recipe_mapper.py``.
"""
from __future__ import annotations

import logging

from app.repositories.wow.guild_help_row import GuildHelpRow
from app.schemas.wow.guild.guild_help_response import (
    GuildHelpEquippedItem,
    GuildHelpMember,
    GuildHelpProfession,
    GuildHelpTalentTree,
)
from app.services.wow.character.character_sheet_codec import read_sheet

logger = logging.getLogger(__name__)


def help_member_from_row(row: GuildHelpRow) -> GuildHelpMember | None:
    """Convert a ``GuildHelpRow`` to a ``GuildHelpMember``, or None on version mismatch.

    Returns None when the stored sheet belongs to a schema version the codec
    no longer understands.  The caller should skip the member — the next
    character-refresh cycle will update the sheet.
    """
    sheet = read_sheet(row.sheet, row.sheet_version)
    if sheet is None:
        logger.debug("guild help: skipping %s — sheet version mismatch", row.slug)
        return None

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

    return GuildHelpMember(
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
