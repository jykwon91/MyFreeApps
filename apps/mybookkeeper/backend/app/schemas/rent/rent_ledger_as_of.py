"""The date a rent ledger is evaluated as of, sent by the client.

The server runs in UTC and stores no time zone for users, so only the client
knows the host's date. Past dates are allowed (the ledger as it stood), but a
date later than any real local date is rejected: charges are generated up to
``as_of``, so a future date would write rent for periods that have not begun.
"""
import datetime
from typing import Annotated

from pydantic import AfterValidator

from app.core.client_date_constants import CLIENT_LOCAL_DATE_MAX_SKEW_DAYS


def _not_after_any_local_today(value: datetime.date) -> datetime.date:
    utc_today = datetime.datetime.now(datetime.timezone.utc).date()
    if (value - utc_today).days > CLIENT_LOCAL_DATE_MAX_SKEW_DAYS:
        raise ValueError("as_of must not be later than the caller's current local date")
    return value


RentLedgerAsOf = Annotated[datetime.date, AfterValidator(_not_after_any_local_today)]
