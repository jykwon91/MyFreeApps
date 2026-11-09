"""Server + faction -> Blizzard auction house, from ``PRICE_SERVER_HOUSES``.

Pure look-ups over the mapping in ``app/core/wow_prices.py``: the refresh
reads only these houses and the API serves only these.
"""
from app.core.wow_prices import PRICE_FACTIONS, PRICE_SERVER_HOUSES
from app.services.wow.prices.mapped_house import MappedHouse


def house_id_for(server: str, faction: str) -> int:
    """The house that is ``server``'s market for ``faction``. KeyError when unmapped."""
    return PRICE_SERVER_HOUSES[server][faction]


def mapped_houses() -> list[MappedHouse]:
    """Every mapped house, by server then faction (Alliance, Horde, Blackwater)."""
    return [
        MappedHouse(server=server, faction=faction, house_id=houses[faction])
        for server, houses in PRICE_SERVER_HOUSES.items()
        for faction in PRICE_FACTIONS
        if faction in houses
    ]
