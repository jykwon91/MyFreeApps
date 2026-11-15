"""Unit tests for guild_help_mapper.help_member_from_row.

Pure unit tests — no database, no HTTP client needed.  The mapper only calls
``read_sheet`` and builds Pydantic response models, so we construct
``GuildHelpRow`` directly from a serialised ``CharacterResponse``.
"""
from __future__ import annotations

from app.core.wow_character import CHARACTER_SHEET_VERSION
from app.repositories.wow.guild_help_row import GuildHelpRow
from app.services.wow.character.character_sheet_codec import to_sheet_json
from app.services.wow.guild.guild_help_mapper import help_member_from_row

from wow_guild_fixtures import make_fetch, professions_json, specializations_json


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _row(
    *,
    slug: str = "jason-kwon",
    version: int = CHARACTER_SHEET_VERSION,
    professions: dict | None = None,
    specializations: dict | None = None,
    talent_points: list[dict] | None = None,
) -> GuildHelpRow:
    """Build a minimal ``GuildHelpRow`` with a serialised sheet."""
    fetch = make_fetch(slug=slug, professions=professions, specializations=specializations)
    sheet_dict = to_sheet_json(fetch.response)
    return GuildHelpRow(
        slug=slug,
        class_id=fetch.response.class_id,
        sheet=sheet_dict,
        sheet_version=version,
        talent_points=talent_points,
    )


# ---------------------------------------------------------------------------
# Version mismatch
# ---------------------------------------------------------------------------

def test_help_member_from_row_returns_none_on_version_mismatch() -> None:
    row = _row(version=CHARACTER_SHEET_VERSION + 1)
    assert help_member_from_row(row) is None


# ---------------------------------------------------------------------------
# Basic shape
# ---------------------------------------------------------------------------

def test_help_member_from_row_maps_identity_fields() -> None:
    row = _row()
    member = help_member_from_row(row)
    assert member is not None
    assert member.slug == "jason-kwon"
    assert member.name == "Jason"
    assert member.surname == "Kwon"
    assert member.level == 30
    assert member.class_name == "Warlock"


def test_help_member_from_row_no_professions_yields_empty_lists() -> None:
    row = _row(professions=None)
    member = help_member_from_row(row)
    assert member is not None
    assert member.professions == []
    assert member.recipe_ability_ids == []


# ---------------------------------------------------------------------------
# Professions
# ---------------------------------------------------------------------------

def test_help_member_from_row_maps_professions_and_recipe_ids() -> None:
    profs = professions_json(
        (20350, "Enchant Bracer – Minor Health"),
        (3273, "Bolt of Linen Cloth"),
    )
    row = _row(professions=profs)
    member = help_member_from_row(row)
    assert member is not None
    assert 20350 in member.recipe_ability_ids
    assert 3273 in member.recipe_ability_ids
    tailoring = next((p for p in member.professions if p.name == "Tailoring"), None)
    assert tailoring is not None
    assert tailoring.skill == 148
    assert tailoring.max_skill == 225


# ---------------------------------------------------------------------------
# Talents
# ---------------------------------------------------------------------------

def test_help_member_from_row_talents_null_when_talent_points_none() -> None:
    row = _row(talent_points=None)
    member = help_member_from_row(row)
    assert member is not None
    assert member.talents is None


def test_help_member_from_row_maps_talent_trees() -> None:
    row = _row(
        talent_points=[
            {"tree_id": 355, "points": 30},
            {"tree_id": 354, "points": 11},
        ]
    )
    member = help_member_from_row(row)
    assert member is not None
    assert member.talents is not None
    assert len(member.talents) == 2
    affliction = next((t for t in member.talents if t.tree_id == 355), None)
    assert affliction is not None
    assert affliction.points == 30


def test_help_member_from_row_filters_out_zero_point_trees() -> None:
    row = _row(
        talent_points=[
            {"tree_id": 355, "points": 30},
            {"tree_id": 354, "points": 0},
        ]
    )
    member = help_member_from_row(row)
    assert member is not None
    assert member.talents is not None
    # Zero-point tree is filtered out.
    assert all(t.points > 0 for t in member.talents)
    assert len(member.talents) == 1
