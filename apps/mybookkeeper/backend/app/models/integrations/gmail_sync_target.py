import uuid
from dataclasses import dataclass


@dataclass(frozen=True)
class GmailSyncTarget:
    """A Gmail connection the scheduler syncs: the org that owns it and the member who connected it."""

    organization_id: uuid.UUID
    user_id: uuid.UUID
