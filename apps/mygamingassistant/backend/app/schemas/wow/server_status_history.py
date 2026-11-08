"""GET /wow/server-status/history — the recorded status of each Forever ruleset."""
from datetime import datetime

from pydantic import BaseModel

from app.schemas.wow.ruleset_history import RulesetHistory


class ServerStatusHistoryResponse(BaseModel):
    region: str
    generated_at: datetime
    window_start: datetime
    # How often the recorder asks Blizzard.
    check_interval_seconds: int
    # A point counts for this long; after it, with no newer point, the status is unknown.
    max_gap_seconds: int
    rulesets: list[RulesetHistory]
