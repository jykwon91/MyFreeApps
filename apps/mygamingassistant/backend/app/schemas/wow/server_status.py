"""WoW Forever server status schemas."""
from datetime import datetime

from pydantic import BaseModel


class ServerRuleset(BaseModel):
    name: str
    slug: str
    online: bool


class ServerStatusResponse(BaseModel):
    region: str
    checked_at: datetime
    rulesets: list[ServerRuleset]
