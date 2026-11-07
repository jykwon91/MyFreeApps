"""The server's UTC date, which ``ClientLocalDate`` checks a client's date against."""
import datetime


def utc_today() -> datetime.date:
    return datetime.datetime.now(datetime.timezone.utc).date()
