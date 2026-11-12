"""A ``CharacterResponse`` to and from ``wow_character.sheet`` JSON."""
from __future__ import annotations

import logging
from typing import Any

from pydantic import ValidationError

from app.core.wow_character import CHARACTER_SHEET_VERSION
from app.schemas.wow.character.character_response import CharacterResponse

logger = logging.getLogger(__name__)


def to_sheet_json(sheet: CharacterResponse) -> dict[str, Any]:
    return sheet.model_dump(mode="json")


def read_sheet(sheet: dict[str, Any], version: int) -> CharacterResponse | None:
    """The stored sheet, or None when it was written by another version or no longer validates."""
    if version != CHARACTER_SHEET_VERSION:
        return None
    try:
        return CharacterResponse.model_validate(sheet)
    except ValidationError as exc:
        # The version wasn't bumped with a schema change: the next fetch overwrites it.
        logger.warning("Stored character sheet no longer validates (version %d): %s", version, exc)
        return None
