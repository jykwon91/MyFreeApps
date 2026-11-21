"""A "Refresh now" click that couldn't be handed to the scheduler (it isn't running, or isn't refreshing prices)."""


class PriceRefreshUnavailableError(RuntimeError):
    pass
