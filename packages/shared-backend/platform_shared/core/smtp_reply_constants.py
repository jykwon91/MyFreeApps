"""What smtplib's reply codes and exceptions mean, for
:mod:`platform_shared.core.smtp_replies` and
:mod:`platform_shared.services.smtp_failure`."""
from __future__ import annotations

import smtplib
import socket
import ssl
from typing import Final

# SMTP reply classes (RFC 5321 section 4.2.1): a 4xx refuses for now, so a retry
# later may succeed; a 5xx refuses for good. RFC 5321 defines no reply from 600
# up, so such a code is no clear answer.
FIRST_TRANSIENT_REPLY_CODE: Final = 400
FIRST_PERMANENT_REPLY_CODE: Final = 500
FIRST_INVALID_REPLY_CODE: Final = 600

# smtplib raises a 500 with this text itself, and closes the connection, when a
# reply line runs past its 8192-byte limit. The server never sent that 500, so
# it is read like a dropped connection. A server's reply text arrives as
# ``bytes``, never this ``str``, so a server that really replies
# "500 Line too long." is still refusing the message.
SMTPLIB_LINE_TOO_LONG: Final = "Line too long."

# Replies whose 5xx means our setup is wrong (credentials, sender, the server
# refusing to talk to us), not that this one message was refused.
CONFIG_REPLY_ERRORS: Final = (
    smtplib.SMTPAuthenticationError,
    smtplib.SMTPSenderRefused,
    smtplib.SMTPConnectError,
    smtplib.SMTPHeloError,
)

# Failures that no retry can fix: an unresolvable host, no TLS / AUTH support
# or an untrusted certificate. (No AUTH mechanism we can use raises a plain
# ``SMTPException``, which ``smtp_replies.is_bare_smtp_exception`` spots.)
CONFIG_ERRORS: Final = (
    socket.gaierror,
    smtplib.SMTPNotSupportedError,
    ssl.SSLCertVerificationError,
)
