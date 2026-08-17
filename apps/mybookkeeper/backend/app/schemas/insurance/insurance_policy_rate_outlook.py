"""What the dwelling filings say about one policy's next renewal."""
from __future__ import annotations

import datetime as _dt
import uuid

from pydantic import BaseModel

from app.schemas.insurance.insurance_rate_filing import InsuranceRateFiling


class InsurancePolicyRateOutlook(BaseModel):
    policy_id: uuid.UUID
    policy_name: str
    property_name: str | None = None
    carrier: str | None = None
    expiration_date: _dt.date | None = None
    current_premium_cents: int | None = None
    # Filings matched to this policy's carrier that take effect on or before
    # its renewal, newest first.
    filings: list[InsuranceRateFiling] = []
    # Compounded effect of the in-force filings above, as a percentage. None
    # when nothing in force applies — which is different from 0.0%, meaning a
    # carrier that filed and held its rates flat.
    projected_change_pct: float | None = None
    # ``current_premium_cents`` moved by ``projected_change_pct``. An estimate
    # of the renewal premium, not a quote: a filing is a statewide average and
    # an individual property's change depends on its own rating factors.
    projected_premium_cents: int | None = None
    # Set when no outlook could be produced — no carrier recorded on the
    # policy, or no filing found under that carrier's name. Shown instead of an
    # empty list so "we found nothing" never reads as "nothing is coming".
    unavailable_reason: str | None = None
