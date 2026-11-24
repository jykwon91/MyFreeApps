"""Tunables for rent reminders."""
import datetime as _dt

from platform_shared.core.sms_constants import SMS_PROVIDER_CODE_NETWORK_ERROR

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
# A text httpSMS answered with an error is stored as ``sms_<provider code>``
# (e.g. ``sms_http_422``), and the phone's own error as
# ``phone_failed: <its words>``. A few ``sms_`` codes have a fixed spelling
# below, with words of their own.
SMS_RELAY_CODE_PREFIX = "sms_"
PHONE_FAILED_CODE_PREFIX = "phone_failed: "
# The server couldn't reach httpSMS at all, so the text was not sent.
ERROR_SMS_NETWORK = f"{SMS_RELAY_CODE_PREFIX}{SMS_PROVIDER_CODE_NETWORK_ERROR}"
# httpSMS answered 401: it didn't accept the server's API key, so every text
# fails the same way until the key on the server is fixed.
ERROR_SMS_KEY_REJECTED = f"{SMS_RELAY_CODE_PREFIX}http_401"
# httpSMS may have taken the text but never confirmed it (a timeout or broken
# connection after the request went out, a 5xx, an unreadable reply). It may
# already be on its way, so it is never retried automatically.
ERROR_SMS_OUTCOME_UNKNOWN = "sms_outcome_unknown"
ERROR_EMAIL_NOT_CONFIGURED = "email_not_configured"
ERROR_EMAIL_SEND_FAILED = "email_send_failed"
# The send failed, but the email may already be in the tenant's inbox (see
# ``EmailSendError.delivery_unconfirmed``). A send that definitely failed is
# ``email_send_failed``. Never retried automatically.
ERROR_EMAIL_OUTCOME_UNKNOWN = "email_outcome_unknown"
ERROR_UNEXPECTED = "unexpected_error"
# Codes with a fixed spelling, each of which the apps describe in words
# (api-client ``rentReminderError.ts``). The others carry one of the two
# prefixes above.
REMINDER_ERROR_CODES: frozenset[str] = frozenset({
    ERROR_NO_PHONE_CONFIRMATION,
    ERROR_SEND_INTERRUPTED,
    ERROR_NO_RECIPIENT,
    ERROR_INVALID_PHONE,
    ERROR_SMS_NOT_CONFIGURED,
    ERROR_SMS_EXPIRED,
    ERROR_SMS_NETWORK,
    ERROR_SMS_KEY_REJECTED,
    ERROR_SMS_OUTCOME_UNKNOWN,
    ERROR_EMAIL_NOT_CONFIGURED,
    ERROR_EMAIL_SEND_FAILED,
    ERROR_EMAIL_OUTCOME_UNKNOWN,
    ERROR_UNEXPECTED,
})
# Sending may have got further than we know, so a retry can double up. These
# are never retried automatically, the operator is told to check first, and
# Send now asks them to confirm (api-client ``rentReminderErrorCodes.ts``).
MAY_STILL_ARRIVE_ERRORS: frozenset[str] = frozenset({
    ERROR_NO_PHONE_CONFIRMATION,
    ERROR_SEND_INTERRUPTED,
    ERROR_SMS_OUTCOME_UNKNOWN,
    ERROR_EMAIL_OUTCOME_UNKNOWN,
})
# Send now's 409 when the last attempt may have gone out and the operator
# didn't confirm sending again. It covers texts and emails, so it doesn't say
# where to check: the card's warning does, for each channel.
REMINDER_MAY_HAVE_BEEN_SENT_CODE = "REMINDER_MAY_HAVE_BEEN_SENT"
REMINDER_MAY_HAVE_BEEN_SENT_MESSAGE = (
    "The last try may already have reached the tenant, so nothing was sent. "
    "Check first, then confirm to send it again."
)
MAX_ERROR_CODE_LENGTH = 120

# Webhook route as mounted behind the frontend origin. The httpSMS JWT's
# audience is the exact URL the operator registered, so it is rebuilt from
# ``settings.frontend_url`` + this path rather than from the request (which,
# behind two reverse proxies, arrives as plain http on an internal host).
SMS_WEBHOOK_PUBLIC_PATH = "/api/rent-reminders/sms/webhook"
