"""Who the prices come from — the page shows this next to every price."""
from pydantic import BaseModel


class WowPriceCredit(BaseModel):
    source: str
    name: str
    url: str
