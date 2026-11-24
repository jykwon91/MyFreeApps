from typing import Literal

# Why an SMTP send failed, so callers can react differently:
#   "misconfigured"      — our side is wrong (bad credentials, sender not allowed,
#                          STARTTLS/AUTH unsupported or STARTTLS permanently
#                          refused, TLS certificate rejected, a host or login
#                          smtplib can't encode). Retrying won't help; an
#                          operator must fix the config.
#   "recipient_rejected" — the server permanently refused one or more recipients.
#                          It is "transient" instead when another recipient's
#                          reply wasn't a clear refusal (if the rest got the
#                          email, so may they; if nobody did, a retry can still
#                          reach them), or when nobody got the email and another
#                          was refused only for now (a retry can still reach
#                          them, and can't duplicate the email). When the rest
#                          got it, a retry to everyone would duplicate it, so a
#                          permanent refusal sums it up even beside a 4xx; each
#                          code is in ``refused_recipients``.
#   "message_rejected"   — the server permanently refused the message itself,
#                          or the message can't be sent as written (a header or
#                          address smtplib can't encode). Retrying the same
#                          message won't help.
#   "transient"          — timeout, dropped connection, a 4xx reply, or a reply
#                          that was unreadable or wasn't a clear refusal. A retry
#                          later may succeed, unless ``delivery_unconfirmed``
#                          says the email may already have arrived. When the
#                          server took it for the other recipients, retry only
#                          ``refused_recipients`` (see ``EmailSendError``).
EmailFailureKind = Literal["misconfigured", "recipient_rejected", "message_rejected", "transient"]
