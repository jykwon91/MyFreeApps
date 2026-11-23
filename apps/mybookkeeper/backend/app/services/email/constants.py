"""Constants shared across the email service package."""

import datetime as _dt

from app.core.document_constants import EXTRACTION_CLAIM_LIFETIME_SECONDS
from app.models.extraction.extraction_failure_kind import ExtractionFailureKind

GMAIL_AUTH_EXPIRED_SYNC_LOG_ERROR = "Gmail connection expired — please disconnect and reconnect"
GMAIL_AUTH_EXPIRED_API_DETAIL = "Gmail connection expired, please reconnect"
# 424 Failed Dependency, never 401: the app session is fine, Gmail is what failed, and
# clients treat any 401 as "sign in again".
GMAIL_AUTH_EXPIRED_API_STATUS = 424
GMAIL_SCOPE_MISSING_SYNC_LOG_ERROR = (
    "Gmail didn't allow reading your mail — please disconnect and reconnect, and allow access to read email"
)
GMAIL_TEMPORARILY_UNAVAILABLE_SYNC_LOG_ERROR = "Gmail is temporarily unavailable — will retry automatically"
GMAIL_TEMPORARILY_UNAVAILABLE_API_DETAIL = "Gmail is temporarily unavailable, please try again shortly"
GMAIL_TEMPORARILY_UNAVAILABLE_API_STATUS = 503
GMAIL_MESSAGE_GONE_ERROR = "This email no longer exists in Gmail"
# A queue item whose download failed for a reason with no message of its own.
# The error itself (Google's or a library's text) is logged, not stored.
GMAIL_FETCH_FAILED_ERROR = "I couldn't download this email from Gmail. Retry it when you're ready."
# OAuth ``error`` values from Google's token endpoint that mean the grant is gone
# (revoked, expired, password changed) and only a new consent can fix it.
GOOGLE_REVOKED_GRANT_OAUTH_ERRORS = frozenset({"invalid_grant"})
GMAIL_LABEL_NOT_FOUND_MESSAGE = (
    "I couldn't find a Gmail label called \"{label}\", so I didn't sync anything. "
    "Check the spelling, or clear the label to sync every email."
)
UNREADABLE_EMAIL_PHOTO_ERROR = "Couldn't read this photo, so I didn't save it"

# -- Claude extraction retries for a fetched email --
#
# A retryable failure (Claude rate limited, overloaded or unreachable, the read
# timing out, or an unreadable reply) puts the row back in the queue,
# waiting out the delay in app/services/extraction/claude_retry_policy.py. The
# drain waits for these retries, so all attempts run inside one sync. Every
# claim counts as an attempt, so an email whose read keeps killing the worker
# is bounded too. A reply cut off at the output limit fails at once: the same
# email is cut off the same way every time.
EMAIL_EXTRACTION_MAX_ATTEMPTS = 4
# While the drain waits (for a retry, or out an Anthropic rate limit), it checks
# this often whether the sync was cancelled, and marks the sync as still going.
EMAIL_EXTRACTION_WAIT_CHECK_SECONDS = 5

# A running sync touches its last_progress_at for every email it fetches or
# reads and every few seconds while it waits, so the longest it goes quiet
# while alive is one email's read (EXTRACTION_TIMEOUT_SECONDS). Quiet for
# longer than that plus a margin, it died, and discovery marks it "Timed out".
# Its unfinished claims are taken back by the next drain's claim query.
SYNC_STALE_AFTER_SECONDS = EXTRACTION_CLAIM_LIFETIME_SECONDS

# What the Sync Sessions panel says about an email whose read failed. The
# details (exception, Anthropic error type) are logged, not shown.
EMAIL_EXTRACTION_FAILURE_MESSAGES: dict[ExtractionFailureKind, str] = {
    ExtractionFailureKind.BUSY: "The AI reader was busy, so I couldn't read this email.",
    ExtractionFailureKind.TIMED_OUT: "Reading this email took too long.",
    ExtractionFailureKind.UNREADABLE: "I couldn't make sense of what I read in this email.",
    ExtractionFailureKind.CUT_OFF: (
        "This email has more in it than I can read in one go, so trying again won't help. "
        "If it has a long attachment, upload that in smaller parts instead."
    ),
    ExtractionFailureKind.MISCONFIGURED: (
        "The AI reader isn't connected properly, so I couldn't read this email. "
        "Contact support if this keeps happening."
    ),
    ExtractionFailureKind.REJECTED: "The AI reader couldn't take this email's content, so I couldn't read it.",
    ExtractionFailureKind.OTHER: "Something went wrong while reading this email.",
}
EMAIL_EXTRACTION_INTERRUPTED_ERROR = "Reading this email kept stopping partway through."
EMAIL_EXTRACTION_WILL_RETRY_SUFFIX = " I'll try again shortly."
EMAIL_EXTRACTION_GAVE_UP_SUFFIX = " I tried {attempts} times. Retry it when you're ready."
EMAIL_EXTRACTION_FAILED_SUFFIX = " Retry it when you're ready."
# Failures a retry can't fix; their message says what to do instead.
EMAIL_EXTRACTION_NO_RETRY_HINT_KINDS: frozenset[ExtractionFailureKind] = frozenset({ExtractionFailureKind.CUT_OFF})
EMAIL_NO_CONTENT_ERROR = "No raw content to extract"
# A sync log closed because the scheduler stopped (a deploy) mid-sync.
EMAIL_SYNC_INTERRUPTED_ERROR = "Interrupted by restart"


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
