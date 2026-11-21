from typing import Literal

# Why an SMTP send failed, so callers can react differently:
#   "misconfigured"      — our side is wrong (bad credentials, sender not allowed,
#                          STARTTLS/AUTH unsupported, TLS certificate rejected).
#                          Retrying won't help; an operator must fix the config.
#   "recipient_rejected" — the server permanently refused one or more recipients.
#   "message_rejected"   — the server permanently refused the message itself.
#   "transient"          — timeout, dropped connection, or a 4xx reply. A retry
#                          later may succeed.
EmailFailureKind = Literal["misconfigured", "recipient_rejected", "message_rejected", "transient"]
