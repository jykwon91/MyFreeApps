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

# Appended to every text (not the email). Carriers expect opt-out wording in
# texts from a toll-free number, and the verification sample shows it. Twilio
# handles the STOP reply itself. Plain ASCII keeps the text in GSM-7.
# The reminder ends on the sign-off ("- Jason, your landlord"), so the suffix
# starts with the full stop that closes it.
SMS_OPT_OUT_SUFFIX = ". Reply STOP to opt out."

# How often the scheduler checks for due reminders.
REMINDER_TICK_MINUTES = 60

# A text Twilio hasn't confirmed within this long of accepting it is marked
# failed and the operator is told. Twilio normally reports ``sent`` within
# seconds, so an hour of silence means its status callbacks aren't reaching
# us (or Twilio is stuck); the text may still have gone out.
SMS_CONFIRMATION_TIMEOUT_MINUTES = 60

# How far ahead the next due date is searched for. A schedule that starts more
# than a year out simply has no "next reminder" yet.
NEXT_DUE_SEARCH_DAYS = 400

ERROR_NO_SMS_CONFIRMATION = "no_sms_confirmation"
ERROR_SEND_INTERRUPTED = "send_interrupted"
ERROR_NO_RECIPIENT = "no_recipient"
ERROR_INVALID_PHONE = "invalid_phone"
ERROR_SMS_NOT_CONFIGURED = "sms_not_configured"
# The plan's owner may not send texts (``rent_reminder_sms_permission``).
# Only the text is held back; the email still goes.
ERROR_SMS_NOT_ALLOWED = "sms_not_allowed"
# A text Twilio refused when it was sent is stored as ``sms_<code>``
# (``sms_21211``). A few ``sms_`` codes have a fixed spelling below, with words
# of their own.
SMS_REFUSED_CODE_PREFIX = "sms_"
# The server couldn't reach Twilio at all, so the text was not sent.
ERROR_SMS_NETWORK = f"{SMS_REFUSED_CODE_PREFIX}{SMS_PROVIDER_CODE_NETWORK_ERROR}"
# Twilio may have taken the text but never confirmed it (a timeout or broken
# connection after the request went out, a 5xx). It may already be on its
# way, so it is never retried automatically.
ERROR_SMS_OUTCOME_UNKNOWN = "sms_outcome_unknown"
ERROR_EMAIL_NOT_CONFIGURED = "email_not_configured"
ERROR_EMAIL_SEND_FAILED = "email_send_failed"
# The send failed, but the email may already be in the tenant's inbox (see
# ``EmailSendError.delivery_unconfirmed``). A send that definitely failed is
# ``email_send_failed``. Never retried automatically.
ERROR_EMAIL_OUTCOME_UNKNOWN = "email_outcome_unknown"
ERROR_UNEXPECTED = "unexpected_error"
# Codes with a fixed spelling, each of which the apps describe in words
# (api-client ``rentReminderError.ts``). The others are prefixed: ``sms_<code>``
# when Twilio refused the send (``sms_21211``), and ``sms_failed: <code>`` when
# Twilio reported afterwards that it couldn't deliver it (``sms_failed: 30007``).
REMINDER_ERROR_CODES: frozenset[str] = frozenset({
    ERROR_NO_SMS_CONFIRMATION,
    ERROR_SEND_INTERRUPTED,
    ERROR_NO_RECIPIENT,
    ERROR_INVALID_PHONE,
    ERROR_SMS_NOT_CONFIGURED,
    ERROR_SMS_NOT_ALLOWED,
    ERROR_SMS_NETWORK,
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
    ERROR_NO_SMS_CONFIRMATION,
    ERROR_SEND_INTERRUPTED,
    ERROR_SMS_OUTCOME_UNKNOWN,
    ERROR_EMAIL_OUTCOME_UNKNOWN,
})
# Twilio refused the text because the tenant had replied STOP (error 21610).
ERROR_SMS_OPTED_OUT = "sms_21610"
# Failed texts a tenant's reply can still be matched to: ones that may have
# arrived, and ones Twilio blocked after a STOP. A blocked text never reached
# the tenant, so it only decides whose reply it is when no other text does and
# every blocked one is from the same account: then that tenant's START (the
# reply that matters most) still reaches their landlord.
REPLY_MATCH_FAILED_ERRORS: frozenset[str] = MAY_STILL_ARRIVE_ERRORS | {ERROR_SMS_OPTED_OUT}
# Send now's 409 when the last attempt may have gone out and the operator
# didn't confirm sending again. It covers texts and emails, so it doesn't say
# where to check: the card's warning does, for each channel.
REMINDER_MAY_HAVE_BEEN_SENT_CODE = "REMINDER_MAY_HAVE_BEEN_SENT"
REMINDER_MAY_HAVE_BEEN_SENT_MESSAGE = (
    "The last try may already have reached the tenant, so nothing was sent. "
    "Check first, then confirm to send it again."
)
MAX_ERROR_CODE_LENGTH = 120
# Room for a Twilio Message SID (34 characters today).
MAX_PROVIDER_MESSAGE_ID_LENGTH = 64
# A phone-number lookup code: SHA-256 as hex.
PHONE_LOOKUP_HASH_LENGTH = 64

# Prefix of the code for a text Twilio reported it couldn't deliver, followed
# by Twilio's ``ErrorCode`` (``sms_failed: 30007``), or ``unknown`` without one.
SMS_FAILED_CODE_PREFIX = "sms_failed: "
# Where the operator checks whether a text went out (Twilio console →
# Monitor → Logs → Messaging), linked from the alert emails. The apps name the
# page in words rather than linking it.
TWILIO_MESSAGE_LOG_URL = "https://console.twilio.com/us1/monitor/logs/sms"
SMS_FAILED_UNKNOWN_DETAIL = "unknown"

# Status-callback route as mounted behind the frontend origin. Twilio signs the
# exact URL it was given, so it is rebuilt from ``settings.frontend_url`` + this
# path rather than from the request (which, behind two reverse proxies, arrives
# as plain http on an internal host).
SMS_WEBHOOK_PUBLIC_PATH = "/api/rent-reminders/sms/webhook"
# The query parameter on each text's status-callback URL naming the send row
# and try (``<send id>:<attempt>``, ``rent_reminder_request_id``).
SMS_WEBHOOK_REQUEST_ID_PARAM = "request_id"

# Where Twilio posts the texts tenants send to the reminder number (the number's
# "A message comes in" webhook), rebuilt the same way for its signature. Twilio
# only retries this when it can't connect at all, so a reply is never emailed
# twice; adding Twilio's ``#rp=`` retry options to the URL would need a record
# of handled MessageSids first.
SMS_INBOUND_PUBLIC_PATH = "/api/rent-reminders/sms/inbound"

# Requests per client IP for each Twilio webhook. Twilio posts from a shared
# pool of addresses, so each route has its own bucket: a burst of status
# callbacks after the evening run must not turn a tenant's reply away.
SMS_WEBHOOK_RATE_LIMIT = 120
SMS_WEBHOOK_RATE_WINDOW_SECONDS = 60
# Manual "send now" requests per signed-in user.
SEND_NOW_RATE_LIMIT = 20
SEND_NOW_RATE_WINDOW_SECONDS = 3600

# A reply is only matched to reminder texts sent within this many days: enough
# for monthly reminders and some slack, short enough that a phone number given
# up and passed to someone new soon stops reaching the old landlord.
REPLY_MATCH_WINDOW_DAYS = 120
# Two different landlords texted the number within this many hours of each
# other: the reply could be for either, so neither is sent it.
REPLY_AMBIGUITY_HOURS = 24
# Most replies from one phone number emailed on per hour. Each one is an email
# from the shared mail account, so a number texting in a loop must not use up
# what sign-up and password-reset emails need. Counted in each API worker
# process, like every ``RateLimiter``, so the real ceiling is this times the
# worker count (``--workers`` in docker/backend.Dockerfile; two today).
REPLY_FORWARD_LIMIT = 20
REPLY_FORWARD_WINDOW_SECONDS = 3600
