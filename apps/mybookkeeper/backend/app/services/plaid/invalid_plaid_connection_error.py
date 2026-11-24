"""The accounts sent to finish connecting a bank don't fit what Plaid
returned or what the person has (an unknown account, one already synced)."""


class InvalidPlaidConnectionError(ValueError):
    pass
