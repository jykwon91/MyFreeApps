"""Raised when no savings idea with that id belongs to this person."""


class SavingsIdeaNotFoundError(LookupError):
    pass
