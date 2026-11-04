import datetime as _dt


def as_utc(moment: _dt.datetime) -> _dt.datetime:
    """Timestamps are stored UTC; some drivers hand them back naive."""
    if moment.tzinfo is None:
        return moment.replace(tzinfo=_dt.timezone.utc)
    return moment
