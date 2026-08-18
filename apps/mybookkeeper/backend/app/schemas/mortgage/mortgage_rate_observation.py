"""One weekly reading from Freddie Mac's survey."""
from __future__ import annotations

import datetime as _dt
from decimal import Decimal

from pydantic import BaseModel


class MortgageRateObservation(BaseModel):
    """The average rate for one term, and the week it was measured.

    The date travels with the rate rather than beside it. The two series are
    read independently — the export leaves cells empty when a series did not
    publish — so they can legitimately land on different weeks, and a single
    shared date would be wrong for one of them.
    """

    series_id: str
    term_months: int
    rate_pct: Decimal
    observed_on: _dt.date
