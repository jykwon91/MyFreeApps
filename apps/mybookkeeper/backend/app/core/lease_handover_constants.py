"""Tunables for handing a lease over to its successor."""
import datetime as _dt

from app.core.rent_reminder_constants import DEFAULT_REMINDER_TIMEZONE

# No real time zone is more than 14 hours ahead of UTC, so no host's local
# date can be later than the UTC date this far ahead.
LATEST_UTC_OFFSET = _dt.timedelta(hours=14)

# MBK stores a host time zone only on rent reminder plans. A lease whose
# tenants have no plan hands over on this zone's date — the zone every new
# reminder plan starts with.
DEFAULT_HANDOVER_TIMEZONE = DEFAULT_REMINDER_TIMEZONE
