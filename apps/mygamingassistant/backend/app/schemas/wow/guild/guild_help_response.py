"""The guild help tab: each member's equipped items, known recipe ability ids, and talents.

The frontend does all matching and scoring; the backend only returns the raw
sheet data it already has. Recipe ability ids are Blizzard's SkillLineAbility ids
(the same ids the frontend's ``recipeSpell()`` maps to crafting-file spell ids).
"""
from pydantic import BaseModel


class GuildHelpEquippedItem(BaseModel):
    """One equipped slot from a stored ``CharacterItem``."""

    # Blizzard's slot: HEAD, NECK, WRIST, MAIN_HAND, FINGER_1, etc.
    slot: str
    item_id: int
    name: str
    item_level: int
    # Blizzard's inventory_type: HEAD, TWOHWEAPON, SHIELD, WEAPONMAINHAND, etc.
    inventory_type: str
    # Non-empty when the item already has an enchant (any enchant).
    enchantments: list[str]


class GuildHelpProfession(BaseModel):
    """One profession a member has, for the crafter chip."""

    # Blizzard's SkillLine id (197 Tailoring, 333 Enchanting…).
    profession_id: int
    name: str
    skill: int
    max_skill: int


class GuildHelpTalentTree(BaseModel):
    """Points spent in one talent tree (from the active talent set)."""

    # Blizzard's SkillTree id — matches ``talentTrees.json`` tree.id on the frontend.
    tree_id: int
    points: int


class GuildHelpMember(BaseModel):
    """One live guild member with their latest stored sheet data."""

    slug: str
    name: str
    surname: str
    class_name: str | None
    level: int
    # Items the member currently wears, from their stored sheet.
    equipped: list[GuildHelpEquippedItem]
    # Blizzard SkillLineAbility ids from every known recipe across all professions.
    # The frontend maps these to spell ids via ``recipeSpell()`` to look up crafting data.
    recipe_ability_ids: list[int]
    # The member's known professions, for the crafter badge and profession filter.
    professions: list[GuildHelpProfession]
    # Active talent tree point totals; None when never fetched or last call failed.
    # The frontend maps tree_id → scorer spec id for per-beneficiary gear scoring.
    talents: list[GuildHelpTalentTree] | None


class GuildHelpResponse(BaseModel):
    """Every live member's sheet data for the guild help tab."""

    members: list[GuildHelpMember]
