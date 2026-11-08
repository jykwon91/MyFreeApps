"""One recorded status in the server status history response."""
from datetime import datetime

from pydantic import BaseModel

from app.core.wow_server_status import ServerStatusValue


class ServerStatusPoint(BaseModel):
    # When Blizzard reported it; holds until the next point, for at most max_gap_seconds.
    at: datetime
    status: ServerStatusValue
