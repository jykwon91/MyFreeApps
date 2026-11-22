"""Turn smtplib failures into a typed ``EmailSendError`` that keeps the SMTP reply code."""
import email.errors
import smtplib
import socket
import ssl
from collections.abc import Mapping

from platform_shared.services.email_failure_kind import EmailFailureKind
from platform_shared.services.email_send_error import EmailSendError

_FIRST_PERMANENT_CODE = 500
_FIRST_TRANSIENT_CODE = 400

# Replies whose 5xx means our setup is wrong (credentials, sender, the server
# refusing to talk to us), not that this one message was refused.
_CONFIG_REPLY_ERRORS = (
    smtplib.SMTPAuthenticationError,
    smtplib.SMTPSenderRefused,
    smtplib.SMTPConnectError,
    smtplib.SMTPHeloError,
)

# Failures that no retry can fix: an unresolvable host, no TLS / AUTH support
# or an untrusted certificate, no AUTH mechanism we can use.
_CONFIG_ERRORS = (
    socket.gaierror,
    smtplib.SMTPNotSupportedError,
    ssl.SSLCertVerificationError,
)

SmtpFailure = smtplib.SMTPException | OSError | email.errors.MessageError | UnicodeError


def _kind_for_reply(code: int, permanent: EmailFailureKind) -> EmailFailureKind:
    if code >= _FIRST_PERMANENT_CODE:
        return permanent
    return "transient"


def _refused_codes(refused: Mapping[str, tuple[int, bytes]]) -> dict[str, int]:
    return {address: code for address, (code, _reply) in refused.items()}


def error_from_refused_recipients(
    refused: Mapping[str, tuple[int, bytes]], *, recipient_count: int,
) -> EmailSendError:
    """Build the error for recipients the server refused.

    ``refused`` is smtplib's ``{address: (code, reply)}`` shape: the return
    value of ``sendmail`` for a partial refusal, or ``SMTPRecipientsRefused
    .recipients`` when every recipient was refused.
    """
    codes = _refused_codes(refused)
    kind: EmailFailureKind = (
        "recipient_rejected"
        if any(code >= _FIRST_PERMANENT_CODE for code in codes.values())
        else "transient"
    )
    delivered = recipient_count - len(codes)
    summary = ", ".join(str(code) for code in codes.values())
    message = f"SMTP server refused {len(codes)} of {recipient_count} recipient(s) (reply codes: {summary})"
    if delivered > 0:
        message += f"; delivered to the other {delivered}"
    return EmailSendError(
        message,
        kind=kind,
        smtp_code=next(iter(codes.values()), None),
        refused_recipients=codes,
    )


def error_from_smtp_exception(exc: SmtpFailure, *, recipient_count: int) -> EmailSendError:
    """Classify an exception raised before the server accepted the message."""
    if isinstance(exc, smtplib.SMTPRecipientsRefused):
        return error_from_refused_recipients(exc.recipients, recipient_count=recipient_count)

    if isinstance(exc, (email.errors.MessageError, UnicodeError)):
        return EmailSendError(
            f"The email could not be encoded for SMTP (a header or address it can't carry): {exc!r}",
            kind="message_rejected",
        )

    if isinstance(exc, _CONFIG_REPLY_ERRORS) and exc.smtp_code >= _FIRST_TRANSIENT_CODE:
        return EmailSendError(
            f"SMTP server refused our connection, credentials or sender ({exc.smtp_code}): {exc}",
            kind=_kind_for_reply(exc.smtp_code, "misconfigured"),
            smtp_code=exc.smtp_code,
        )

    if isinstance(exc, smtplib.SMTPResponseException) and exc.smtp_code >= _FIRST_TRANSIENT_CODE:
        return EmailSendError(
            f"SMTP server replied {exc.smtp_code}: {exc}",
            kind=_kind_for_reply(exc.smtp_code, "message_rejected"),
            smtp_code=exc.smtp_code,
        )

    if isinstance(exc, _CONFIG_ERRORS) or _is_bare_smtp_exception(exc):
        return EmailSendError(
            f"SMTP is misconfigured (unknown host, or no TLS / AUTH method we can use): {exc!r}",
            kind="misconfigured",
        )

    # Timeouts, refused or dropped connections, and replies without a usable
    # code (e.g. a connect greeting of -1).
    return EmailSendError(f"SMTP connection failed: {exc!r}", kind="transient")


def _is_bare_smtp_exception(exc: SmtpFailure) -> bool:
    """smtplib raises plain ``SMTPException`` (no subclass) only for setup
    faults, e.g. "No suitable authentication method found" from ``login``."""
    return type(exc) is smtplib.SMTPException
