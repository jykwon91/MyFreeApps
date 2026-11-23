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

# smtplib raises a 500 with this text itself, and closes the connection, when a
# reply line runs past its 8192-byte limit. The server never sent that 500, so
# it is read like a dropped connection. A server's reply text arrives as
# ``bytes``, never this ``str``, so a server that really replies
# "500 Line too long." is still refusing the message.
_SMTPLIB_LINE_TOO_LONG = "Line too long."

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
    refused: Mapping[str, tuple[int, bytes]], *, recipient_count: int, sent_to_the_rest: bool,
) -> EmailSendError:
    """Build the error for recipients the server refused.

    ``refused`` is smtplib's ``{address: (code, reply)}`` shape. With
    ``sent_to_the_rest`` it is ``sendmail``'s return value: the server took the
    email for every recipient not in it. Without, it is ``SMTPRecipientsRefused
    .recipients``, which smtplib raises before sending the message, when the
    server refused every recipient, or answered 421 (it is closing the session)
    partway through them and smtplib hung up. Nobody got the email then, even
    when fewer addresses than ``recipient_count`` are listed.
    """
    codes = _refused_codes(refused)
    kind: EmailFailureKind = (
        "recipient_rejected"
        if any(code >= _FIRST_PERMANENT_CODE for code in codes.values())
        else "transient"
    )
    summary = ", ".join(str(code) for code in codes.values())
    if sent_to_the_rest:
        outcome = f"delivered to the other {recipient_count - len(codes)}"
    else:
        outcome = "nobody got the email"
    return EmailSendError(
        f"SMTP server refused {len(codes)} of {recipient_count} recipient(s) (reply codes: {summary}); {outcome}",
        kind=kind,
        smtp_code=next(iter(codes.values()), None),
        refused_recipients=codes,
        failed_before_handover=not sent_to_the_rest,
    )


def error_from_smtp_exception(
    exc: SmtpFailure, *, recipient_count: int, failed_before_handover: bool,
) -> EmailSendError:
    """Classify an exception from an SMTP send.

    ``failed_before_handover`` says the exception came before the message was
    handed to the server (connecting, starting TLS, logging in), so a timeout or
    dropped connection then is a definite failure rather than an unconfirmed one.
    ``SMTPRecipientsRefused`` always counts as before the hand-over, whatever is
    passed: smtplib raises it before it sends the message.
    """
    if isinstance(exc, smtplib.SMTPRecipientsRefused):
        return error_from_refused_recipients(
            exc.recipients, recipient_count=recipient_count, sent_to_the_rest=False,
        )

    if isinstance(exc, (email.errors.MessageError, UnicodeError)):
        # ``str``, not ``repr``: a UnicodeEncodeError's repr quotes the whole
        # string it failed on, which can be the recipient line or the message.
        return EmailSendError(
            f"The email could not be encoded for SMTP (a header or address it can't carry): "
            f"{type(exc).__name__}: {exc}",
            kind="message_rejected",
            failed_before_handover=failed_before_handover,
        )

    if isinstance(exc, _CONFIG_REPLY_ERRORS) and exc.smtp_code >= _FIRST_TRANSIENT_CODE:
        return EmailSendError(
            f"SMTP server refused our connection, credentials or sender ({exc.smtp_code}): {exc}",
            kind=_kind_for_reply(exc.smtp_code, "misconfigured"),
            smtp_code=exc.smtp_code,
            failed_before_handover=failed_before_handover,
        )

    if (
        isinstance(exc, smtplib.SMTPResponseException)
        and exc.smtp_code >= _FIRST_TRANSIENT_CODE
        and not _is_smtplib_line_too_long(exc)
    ):
        return EmailSendError(
            f"SMTP server replied {exc.smtp_code}: {exc}",
            kind=_kind_for_reply(exc.smtp_code, "message_rejected"),
            smtp_code=exc.smtp_code,
            failed_before_handover=failed_before_handover,
        )

    if isinstance(exc, _CONFIG_ERRORS) or _is_bare_smtp_exception(exc):
        return EmailSendError(
            f"SMTP is misconfigured (unknown host, or no TLS / AUTH method we can use): {exc!r}",
            kind="misconfigured",
            failed_before_handover=failed_before_handover,
        )

    # Timeouts, refused or dropped connections, replies without a usable code
    # (e.g. a connect greeting of -1), and smtplib's own "Line too long.".
    return EmailSendError(
        f"SMTP connection failed: {exc!r}",
        kind="transient",
        failed_before_handover=failed_before_handover,
    )


def _is_bare_smtp_exception(exc: SmtpFailure) -> bool:
    """smtplib raises plain ``SMTPException`` (no subclass) only for setup
    faults, e.g. "No suitable authentication method found" from ``login``."""
    return type(exc) is smtplib.SMTPException


def _is_smtplib_line_too_long(exc: smtplib.SMTPResponseException) -> bool:
    # The ``str`` check comes first: comparing a server's ``bytes`` reply with a
    # ``str`` warns, and raises under ``python -bb``.
    return isinstance(exc.smtp_error, str) and exc.smtp_error == _SMTPLIB_LINE_TOO_LONG
