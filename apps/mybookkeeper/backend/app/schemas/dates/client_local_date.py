"""The caller's local calendar date, sent by the client wherever "today" matters.

It fills ``today`` placeholders and computed dates in leases, dates rent
receipts, and sets how far ahead rent charges are generated when a schedule is
saved.

The server runs in UTC and stores no time zone for users, so only the client
knows the host's date. Real time zones span UTC-12 to UTC+14, so a genuine
local date is never more than one day from the server's UTC date.
"""
import datetime
from typing import Annotated

from pydantic import AfterValidator

from app.core.client_date_constants import CLIENT_LOCAL_DATE_MAX_SKEW_DAYS


def _within_a_day_of_utc(value: datetime.date) -> datetime.date:
    utc_today = datetime.datetime.now(datetime.timezone.utc).date()
    if abs((value - utc_today).days) > CLIENT_LOCAL_DATE_MAX_SKEW_DAYS:
        raise ValueError("today must be the caller's current local date")
    return value


ClientLocalDate = Annotated[datetime.date, AfterValidator(_within_a_day_of_utc)]
