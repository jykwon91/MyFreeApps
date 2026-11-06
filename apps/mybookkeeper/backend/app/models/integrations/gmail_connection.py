import uuid
from typing import Protocol


class GmailConnection(Protocol):
    """Which Gmail connection a call ran on: the row, and the refresh token it held.

    ``Integration`` satisfies this; so does a ``GmailConnectionSnapshot`` taken
    before the session that loaded the row went away.
    """

    @property
    def id(self) -> uuid.UUID: ...

    @property
    def refresh_token_encrypted(self) -> str | None: ...
