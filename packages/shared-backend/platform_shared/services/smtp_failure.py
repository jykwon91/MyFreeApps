"""Turn smtplib failures into a typed ``EmailSendError`` that keeps the SMTP reply code."""
import email.errors
import smtplib
from collections.abc import Mapping

from platform_shared.core.smtp_replies import (
    is_config_fault,
    is_refusal,
    is_smtplib_line_too_long,
    reply_code_text,
)
from platform_shared.core.smtp_reply_constants import (
    CONFIG_REPLY_ERRORS,
    FIRST_PERMANENT_REPLY_CODE,
)
from platform_shared.services.email_failure_kind import EmailFailureKind
from platform_shared.services.email_send_error import EmailSendError
from platform_shared.services.smtp_send_stage import SmtpSendStage

SmtpFailure = smtplib.SMTPException | OSError | email.errors.MessageError | UnicodeError


def _kind_for_reply(code: int, permanent: EmailFailureKind) -> EmailFailureKind:
    if code >= FIRST_PERMANENT_REPLY_CODE:
        return permanent
    return "transient"


def _permanent_reply_kind(stage: SmtpSendStage) -> EmailFailureKind:
    """What a permanent reply outside ``CONFIG_REPLY_ERRORS`` means. While the
    session is opening it can only be the server refusing STARTTLS, which an
    operator must fix; after that, the server refused the message."""
    if stage == "opening":
        return "misconfigured"
    return "message_rejected"


def _unencodable_setting(exc: UnicodeError) -> str:
    """Which setting a ``UnicodeError`` while the session is opening points at,
    without the exception's text: for a non-ASCII password, that quotes a
    character of the password and its position."""
    if isinstance(exc, UnicodeEncodeError) and exc.encoding == "ascii":
        # smtplib sends every command as ASCII: the login, and the EHLO name.
        return (
            "smtplib couldn't send a command as ASCII. SMTP_USER and SMTP_PASSWORD "
            "must be ASCII only (so must this machine's host name, sent in EHLO)"
        )
    # Looking the host up, and checking its TLS certificate, encode it as IDNA.
    return "SMTP_HOST isn't a valid host name"


def _refused_codes(refused: Mapping[str, tuple[int, bytes]]) -> dict[str, int]:
    return {address: code for address, (code, _reply) in refused.items()}


def _sum_up_refusals(
    codes: Mapping[str, int], *, sent_to_the_rest: bool,
) -> tuple[EmailFailureKind, int | None]:
    """The ``kind`` and ``smtp_code`` for these refusals, by the rule in
    ``error_from_refused_recipients``."""
    values = list(codes.values())
    if not all(is_refusal(code) for code in values):
        return "transient", None
    temporary = [code for code in values if code < FIRST_PERMANENT_REPLY_CODE]
    permanent = [code for code in values if code >= FIRST_PERMANENT_REPLY_CODE]
    if permanent and (sent_to_the_rest or not temporary):
        return "recipient_rejected", permanent[0]
    return "transient", next(iter(temporary), None)


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

    ``kind`` and ``smtp_code`` sum the refusals up by what the caller can do
    next. A reply that isn't a clear refusal (see ``is_refusal``) makes it
    ``transient`` with no code: that recipient may have been accepted, so when
    the rest got the email, delivery is unconfirmed, and when nobody did, a
    retry can still reach them. Otherwise, when nobody got the email, a
    recipient refused only for now (a 4xx, such as a 421 that closed the
    session before the rest were tried) makes it ``transient`` with the first
    4xx: a retry can still reach them and can't duplicate the email. Otherwise
    a permanent refusal makes it ``recipient_rejected`` with the first 5xx, and
    4xx refusals alone make it ``transient`` with the first 4xx.
    """
    codes = _refused_codes(refused)
    kind, smtp_code = _sum_up_refusals(codes, sent_to_the_rest=sent_to_the_rest)
    summary = ", ".join(reply_code_text(code) for code in codes.values())
    if sent_to_the_rest:
        outcome = f"delivered to the other {recipient_count - len(codes)}"
        unclear = sum(1 for code in codes.values() if not is_refusal(code))
        if unclear:
            outcome += f", and maybe to the {unclear} whose reply wasn't a clear refusal"
    else:
        outcome = "nobody got the email"
    return EmailSendError(
        f"SMTP server refused {len(codes)} of {recipient_count} recipient(s) (reply codes: {summary}); {outcome}",
        kind=kind,
        smtp_code=smtp_code,
        refused_recipients=codes,
        failed_before_handover=not sent_to_the_rest,
    )


def error_from_smtp_exception(
    exc: SmtpFailure, *, recipient_count: int, stage: SmtpSendStage,
) -> EmailSendError:
    """Classify an exception from an SMTP send.

    ``stage`` says where the send was (see ``SmtpSendStage``). Before the
    message is handed to the server (building it, or opening the session:
    connecting, starting TLS, logging in), nobody can have it, so a timeout or
    dropped connection then is a definite failure rather than an unconfirmed
    one. ``SMTPSenderRefused`` and ``SMTPRecipientsRefused`` always count as
    before the hand-over: smtplib raises them before it sends the message.

    ``stage`` also decides ``kind`` twice. While the session is opening, a
    ``UnicodeError`` (a host or login smtplib can't encode) and a permanent
    reply outside ``CONFIG_REPLY_ERRORS`` (the server refusing STARTTLS) are
    ``misconfigured``, since nothing then depends on the message.
    """
    failed_before_handover = stage != "handing_over"
    if isinstance(exc, smtplib.SMTPRecipientsRefused):
        return error_from_refused_recipients(
            exc.recipients, recipient_count=recipient_count, sent_to_the_rest=False,
        )
    if isinstance(exc, smtplib.SMTPSenderRefused):
        failed_before_handover = True

    if isinstance(exc, UnicodeError) and stage == "opening":
        return EmailSendError(
            f"SMTP is misconfigured: {_unencodable_setting(exc)} ({type(exc).__name__}).",
            kind="misconfigured",
            failed_before_handover=failed_before_handover,
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

    if isinstance(exc, CONFIG_REPLY_ERRORS) and is_refusal(exc.smtp_code):
        return EmailSendError(
            f"SMTP server refused our connection, credentials or sender ({exc.smtp_code}): {exc}",
            kind=_kind_for_reply(exc.smtp_code, "misconfigured"),
            smtp_code=exc.smtp_code,
            failed_before_handover=failed_before_handover,
        )

    if (
        isinstance(exc, smtplib.SMTPResponseException)
        and is_refusal(exc.smtp_code)
        and not is_smtplib_line_too_long(exc)
    ):
        return EmailSendError(
            f"SMTP server replied {exc.smtp_code}: {exc}",
            kind=_kind_for_reply(exc.smtp_code, _permanent_reply_kind(stage)),
            smtp_code=exc.smtp_code,
            failed_before_handover=failed_before_handover,
        )

    if is_config_fault(exc):
        return EmailSendError(
            "SMTP is misconfigured (unknown host, untrusted certificate, or no TLS / AUTH "
            f"method we can use): {exc!r}",
            kind="misconfigured",
            failed_before_handover=failed_before_handover,
        )

    # Timeouts, refused or dropped connections, a host lookup that failed only
    # for now, replies that aren't a clear refusal (e.g. a connect greeting of
    # -1, or a code from 600 up), and smtplib's own "Line too long.".
    return EmailSendError(
        f"SMTP connection failed: {exc!r}",
        kind="transient",
        failed_before_handover=failed_before_handover,
    )
