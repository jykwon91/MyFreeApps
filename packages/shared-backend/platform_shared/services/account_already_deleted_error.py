"""The account was deleted by another request while this one waited for its lock."""


class AccountAlreadyDeletedError(Exception):
    """The user row was gone once this deletion held the lock."""
