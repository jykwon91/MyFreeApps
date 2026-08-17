"""One dwelling-line rate filing a Texas carrier made with TDI."""
from __future__ import annotations

import datetime as _dt

from pydantic import BaseModel


class InsuranceRateFiling(BaseModel):
    # SERFF tracking id — TDI's stable handle for the filing, and what the
    # operator would quote if they ever called the department about it.
    serff_id: str
    company_name: str
    # The carrier's own name for the program, e.g. "TX DWO". Two filings from
    # one company in the same month usually belong to different programs, so
    # this is what distinguishes them.
    product_name: str | None = None
    # Positive is an increase, negative a decrease. None when the filing did
    # not state one.
    percent_change: float | None = None
    filed_date: _dt.date | None = None
    # When the new rate starts applying to renewing policies. This is the date
    # that matters to an existing policyholder; the new-business date does not
    # affect them.
    effective_date_renewal: _dt.date | None = None
    # True when the filing has been reviewed and the rate is in force. False
    # while still pending, or when it was withdrawn or rejected and will never
    # apply — the distinction the UI needs to avoid announcing a phantom rise.
    is_in_force: bool = False
    # True while TDI has yet to rule on it. Shown as "proposed" rather than
    # "coming", because the commissioner can still disapprove it.
    is_pending: bool = False
