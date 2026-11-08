"""One ruleset's recorded history in the server status history response."""
from datetime import datetime

from pydantic import BaseModel

from app.schemas.wow.server_status_point import ServerStatusPoint


class RulesetHistory(BaseModel):
    slug: str
    name: str
    # Start of the current status, as far as the stored rows show; null with no rows.
    since: datetime | None
    # False when no other status is on record — "since" is only the oldest row we kept.
    since_exact: bool
    # Oldest first. The first point may be before window_start: it is the
    # status the window opens with.
    points: list[ServerStatusPoint]
