"""A hand-entered holding that would leave things inconsistent: on an account
that isn't an investment account, on one synced from a bank, or with nothing
to say what it is."""


class InvalidHoldingError(ValueError):
    pass
