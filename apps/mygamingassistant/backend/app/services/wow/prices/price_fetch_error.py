"""Blizzard couldn't give us prices. The stored ones stay."""
from app.services.wow.blizzard.blizzard_api_error import BlizzardApiError


class PriceFetchError(BlizzardApiError):
    pass
