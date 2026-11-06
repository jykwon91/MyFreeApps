import uuid
from dataclasses import dataclass

from app.models.integrations.gmail_connection import GmailConnection


@dataclass(frozen=True)
class GmailConnectionSnapshot:
    """A ``GmailConnection`` copied out of a row, usable after its session rolls back."""

    id: uuid.UUID
    refresh_token_encrypted: str | None

    @classmethod
    def of(cls, connection: GmailConnection) -> "GmailConnectionSnapshot":
        return cls(id=connection.id, refresh_token_encrypted=connection.refresh_token_encrypted)
