"""One Ko-fi donation, stored as its own object in the shared bucket."""
from __future__ import annotations

from pydantic import BaseModel


class DonationRecord(BaseModel):
    """A counted Ko-fi donation, stored at ``donation_store.donation_key``.

    Every field comes from the Ko-fi payload (or, for migrated records, from
    the old ``report.json``), never from when it arrived, so writing the same
    donation twice produces the same bytes under the same key.

    ``month`` is the ``"YYYY-MM"`` the donation counts toward. For a live
    donation that is the month of Ko-fi's own ``timestamp``.

    ``migrated_from_report`` marks records written by the one-time move out
    of ``report.json``. That file kept only a total per month, not each
    donation's amount, so the first id of each month (sorted) carries the
    month's whole total and the others carry 0: the month adds up exactly,
    and every id still blocks a re-delivery.
    """

    message_id: str
    month: str
    amount_cents: int
    currency: str = ""
    type: str = ""
    migrated_from_report: bool = False
