class BlizzardPricesNotConfiguredError(RuntimeError):
    """Raised at startup in production when WOW_PRICE_REFRESH_ENABLED=true but
    BLIZZARD_CLIENT_ID / BLIZZARD_CLIENT_SECRET are missing.

    Without them every price refresh fails, and the auction-house prices go
    stale (then empty after a reset) while /health stays green.
    """
