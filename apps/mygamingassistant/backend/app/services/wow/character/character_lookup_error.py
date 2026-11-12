"""Blizzard couldn't give us the character (404 = no character by that name)."""
from app.services.wow.blizzard.blizzard_api_error import BlizzardApiError


class CharacterLookupError(BlizzardApiError):
    pass
