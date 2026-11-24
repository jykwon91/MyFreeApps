"""No holding (or account to hold it) with that id for this person."""


class HoldingNotFoundError(LookupError):
    pass
