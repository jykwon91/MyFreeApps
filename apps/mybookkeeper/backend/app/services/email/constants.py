"""Constants shared across the email service package."""

import datetime as _dt

GMAIL_AUTH_EXPIRED_SYNC_LOG_ERROR = "Gmail connection expired — please disconnect and reconnect"
GMAIL_AUTH_EXPIRED_API_DETAIL = "Gmail connection expired, please reconnect"


# -- Bounce / non-deliverable email detection signals --
#
# Used by app.services.email.bounce_detector. Substring matches are
# case-insensitive against the lowercased subject/header value.

BOUNCE_FROM_LOCAL_PARTS: frozenset[str] = frozenset({
    "mailer-daemon",
    "postmaster",
})

# noreply alone is too broad — only treat it as a bounce signal when paired
# with a delivery-failure subject.
BOUNCE_NOREPLY_LOCAL_PARTS: frozenset[str] = frozenset({
    "noreply",
    "no-reply",
})

BOUNCE_SUBJECT_SUBSTRINGS: tuple[str, ...] = (
    "mail delivery subsystem",
    "undeliverable",
    "delivery status notification (failure)",
    "failure notice",
    "returned mail",
    "mail delivery failed",
    "delivery has failed",
)

# RFC 3464 / vacation auto-reply headers that strongly indicate a non-invoice
# auto-generated message.
BOUNCE_HEADER_X_FAILED_RECIPIENTS = "X-Failed-Recipients"
BOUNCE_HEADER_AUTO_SUBMITTED = "Auto-Submitted"
BOUNCE_HEADER_AUTO_SUBMITTED_VALUES: frozenset[str] = frozenset({
    "auto-replied",
    "auto-generated",
})
BOUNCE_HEADER_CONTENT_TYPE = "Content-Type"
BOUNCE_HEADER_CONTENT_TYPE_DSN_MARKERS: tuple[str, ...] = (
    "multipart/report",
    "report-type=delivery-status",
)

# RFC 3464 DSN body fingerprints — only checked if no other signal matched.
# Real bounces often have a long human preamble before the machine-readable
# fields, so the scan window matches the body_preview captured upstream
# (gmail_service.BOUNCE_BODY_PREVIEW_BYTES).
BOUNCE_BODY_FINGERPRINT_PREFIX_BYTES = 2048
BOUNCE_BODY_FINGERPRINTS: tuple[str, ...] = (
    "diagnostic-code:",
    "original-recipient:",
    "action: failed",
)

# Max widths for EmailFilterLog string columns — must match the model.
EMAIL_FILTER_LOG_FROM_ADDRESS_MAX_LEN = 500
EMAIL_FILTER_LOG_SUBJECT_MAX_LEN = 500

# -- EmailFilterLog.reason values for app-sent messages --
#
# Written at send time by app.services.email.app_sent_email_service so the
# Gmail sync never re-ingests mail the app itself sent (a rent receipt matches
# the ingestion query via subject:receipt + has:attachment and would be
# re-extracted as a duplicate income transaction).
APP_SENT_RECEIPT_FILTER_REASON = "app_sent_receipt"
APP_SENT_INQUIRY_REPLY_FILTER_REASON = "app_sent_inquiry_reply"


# Socket timeout for every Gmail API request. Without it a hung request can
# block forever and still deliver long after the caller gave up.
GMAIL_HTTP_TIMEOUT_SECONDS = 60
GMAIL_MESSAGE_ID_DOMAIN = "mybookkeeper.app"
# How long a ``sending`` claim (rent receipt, inquiry reply) is left alone before
# a new attempt looks the email up in Gmail and settles the claim. Far longer
# than any single Gmail request can take (``GMAIL_HTTP_TIMEOUT_SECONDS``), so
# the attempt that took the claim is finished before anyone looks.
GMAIL_SEND_CLAIM_STALE_AFTER = _dt.timedelta(minutes=15)
GMAIL_SEND_URL = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send"
# 403 reasons that mean "slow down", not "missing permission".
GMAIL_RATE_LIMIT_REASONS = frozenset({"rateLimitExceeded", "userRateLimitExceeded", "dailyLimitExceeded"})

# Finish Gmail's reconnect messages: "Reconnect Gmail to send receipts."
GMAIL_PURPOSE_SEND_RECEIPTS = "send receipts"
GMAIL_PURPOSE_SEND_REPLIES = "send replies"
