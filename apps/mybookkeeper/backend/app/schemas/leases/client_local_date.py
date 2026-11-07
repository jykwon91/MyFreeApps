"""The caller's local calendar date, sent by the client for ``today`` defaults.

The server runs in UTC and stores no time zone for users, so only the client
knows the host's date. Real time zones span UTC-12 to UTC+14, so a genuine
local date is never more than one day from the server's UTC date.
"""
import datetime
from typing import Annotated

from pydantic import AfterValidator

from app.core.lease_constants import CLIENT_LOCAL_DATE_MAX_SKEW_DAYS


def _within_a_day_of_utc(value: datetime.date) -> datetime.date:
    utc_today = datetime.datetime.now(datetime.timezone.utc).date()
    if abs((value - utc_today).days) > CLIENT_LOCAL_DATE_MAX_SKEW_DAYS:
        raise ValueError("today must be the caller's current local date")
    return value


ClientLocalDate = Annotated[datetime.date, AfterValidator(_within_a_day_of_utc)]
