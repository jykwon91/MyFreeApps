"""A client-supplied id names a row the caller's organization does not own.

A ``ValueError`` so callers that already answer 422 on ``ValueError`` (the
transaction routes) keep doing so; routes whose ``ValueError`` mapping is
broader catch this first so every entry point answers the same 422.
"""


class ForeignReferenceError(ValueError):
    pass
