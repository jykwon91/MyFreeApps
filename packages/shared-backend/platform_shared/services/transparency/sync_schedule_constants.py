"""When the transparency primary's daily cost sync falls due.

The slot sits just after midnight UTC so a new month's costs appear within
minutes of rollover instead of waiting up to a day.
"""

DAILY_SYNC_HOUR_UTC = 0
DAILY_SYNC_MINUTE_UTC = 15
