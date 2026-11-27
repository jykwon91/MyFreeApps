"""One researched savings idea, as the Savings page shows it."""
import datetime as _dt
import uuid

from pydantic import BaseModel

from app.schemas.savings.savings_card_details_response import SavingsCardDetailsResponse


class SavingsIdeaResponse(BaseModel):
    id: uuid.UUID
    category: str
    title: str
    savings_low_cents: int
    savings_high_cents: int
    effort: str
    why_it_fits: str
    steps: list[str]
    source_urls: list[str]
    card_details: SavingsCardDetailsResponse | None
    expires_on: _dt.date | None
    status: str
    last_confirmed_at: _dt.datetime
