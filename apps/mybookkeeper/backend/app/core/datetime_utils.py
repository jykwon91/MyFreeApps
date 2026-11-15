import datetime as _dt
from zoneinfo import ZoneInfo


def as_utc(moment: _dt.datetime) -> _dt.datetime:
    """Timestamps are stored UTC; some drivers hand them back naive."""
    if moment.tzinfo is None:
        return moment.replace(tzinfo=_dt.timezone.utc)
    return moment


def local_date(moment: _dt.datetime, zone: str) -> _dt.date:
    """The calendar date ``moment`` (timezone-aware) falls on in ``zone``."""
    return moment.astimezone(ZoneInfo(zone)).date()
