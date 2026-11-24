"""No bank connection with that id for this person."""


class PlaidItemNotFoundError(LookupError):
    pass
