"""The server's UTC date, which ``ClientLocalDate`` checks a client's date against."""
import datetime


def utc_today() -> datetime.date:
    return datetime.datetime.now(datetime.timezone.utc).date()


def utc_today_params() -> dict[str, str]:
    """Query params for an endpoint that takes the caller's ``today``."""
    return {"today": utc_today().isoformat()}
