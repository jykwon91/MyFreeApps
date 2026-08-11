"""One recorded market observation, as returned to the client.

``is_stale`` is derived rather than stored so it cannot drift from the clock —
same reason ``renewal_status`` is computed on read. See
``_market_benchmark_compare.is_stale``.
"""
from __future__ import annotations

import datetime as _dt
import uuid
from decimal import Decimal

from pydantic import BaseModel, ConfigDict


class MarketRateBenchmarkResponse(BaseModel):
    id: uuid.UUID
    service_type: str
    # Exactly one of these is set; which one depends on the service type.
    rate_cents_per_kwh: Decimal | None = None
    monthly_cents: int | None = None
    source: str | None = None
    observed_on: _dt.date
    notes: str | None = None
    is_stale: bool
    created_at: _dt.datetime
    updated_at: _dt.datetime

    model_config = ConfigDict(from_attributes=True)
