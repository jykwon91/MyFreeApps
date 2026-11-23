"""A demo account was requested with an email that already has a user — HTTP 409."""
from __future__ import annotations


class DemoEmailTakenError(ValueError):
    """The email the operator chose already belongs to a user.

    Its message is the reply's ``detail``. The route catches this type, not
    ``ValueError``, so a library's ``ValueError`` (pydantic re-checking the
    credentials, say) is never echoed back as if it were this.
    """
