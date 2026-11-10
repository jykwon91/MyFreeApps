"""Boot guard for the Blizzard API credentials the auction-house prices need."""
import logging

from app.core.blizzard_prices_not_configured_error import BlizzardPricesNotConfiguredError
from app.core.config import settings

logger = logging.getLogger("app")


def check_blizzard_prices_configured() -> None:
    """Fail loud in production if prices refresh but the Blizzard client isn't set.

    A no-op when ``WOW_PRICE_REFRESH_ENABLED=false``. In development a missing
    pair logs a WARNING; each refresh then fails with the same reason and the
    stored prices stay.
    """
    if not settings.wow_price_refresh_enabled:
        return
    if settings.blizzard_client_id and settings.blizzard_client_secret:
        return
    msg = (
        "WOW_PRICE_REFRESH_ENABLED=true but BLIZZARD_CLIENT_ID / BLIZZARD_CLIENT_SECRET "
        "are not both set, so auction-house prices can't refresh. Set both in "
        "apps/mygamingassistant/backend/.env.docker (develop.battle.net -> API Access), "
        "or set WOW_PRICE_REFRESH_ENABLED=false to turn prices off."
    )
    if settings.environment == "production":
        raise BlizzardPricesNotConfiguredError(msg)
    logger.warning("scheduler boot: %s (non-production — continuing)", msg)
