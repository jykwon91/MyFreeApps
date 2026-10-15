"""Tunables for rent reminders."""
import datetime as _dt

DEFAULT_REMINDER_TIMEZONE = "America/Chicago"
DEFAULT_REMINDER_SEND_TIME = _dt.time(18, 0)

# Days before the due date the reminder goes out, chosen when the operator
# picks a frequency (still editable). A weekly payer is nudged the evening
# before; a monthly payer gets a few days to arrange the larger transfer.
DEFAULT_SEND_DAYS_BEFORE: dict[str, int] = {"weekly": 1, "monthly": 3}
MAX_SEND_DAYS_BEFORE = 14

# Reminders are only sent between these local hours — a tick that runs late
# (or a plan saved at 11pm) must not text a tenant in the middle of the night.
# Half-open: 09:00 <= local time < 20:00.
SEND_WINDOW_START = _dt.time(9, 0)
SEND_WINDOW_END = _dt.time(20, 0)

# How often the scheduler checks for due reminders.
REMINDER_TICK_MINUTES = 60

# A text not confirmed by the phone within this long of being handed off is
# marked failed and the operator is told — the phone is off, offline, or the
# httpSMS app has been battery-optimized to sleep.
SMS_CONFIRMATION_TIMEOUT_MINUTES = 60

# How far ahead the next due date is searched for. A schedule that starts more
# than a year out simply has no "next reminder" yet.
NEXT_DUE_SEARCH_DAYS = 400

ERROR_NO_PHONE_CONFIRMATION = "no_phone_confirmation"
ERROR_SEND_INTERRUPTED = "send_interrupted"
ERROR_NO_RECIPIENT = "no_recipient"
ERROR_INVALID_PHONE = "invalid_phone"
ERROR_SMS_NOT_CONFIGURED = "sms_not_configured"
ERROR_SMS_EXPIRED = "expired"
MAX_ERROR_CODE_LENGTH = 120

# Webhook route as mounted behind the frontend origin. The httpSMS JWT's
# audience is the exact URL the operator registered, so it is rebuilt from
# ``settings.frontend_url`` + this path rather than from the request (which,
# behind two reverse proxies, arrives as plain http on an internal host).
SMS_WEBHOOK_PUBLIC_PATH = "/api/rent-reminders/sms/webhook"
