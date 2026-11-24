"""Read what smtplib reports: which reply codes really refuse, which
exceptions smtplib raised itself rather than relaying a server's reply, and
which failures no retry can fix."""
import smtplib

from platform_shared.core.dns_failures import is_temporary_dns_failure
from platform_shared.core.smtp_reply_constants import (
    CONFIG_ERRORS,
    FIRST_INVALID_REPLY_CODE,
    FIRST_TRANSIENT_REPLY_CODE,
    SMTPLIB_LINE_TOO_LONG,
)


def is_refusal(code: int) -> bool:
    """Whether a reply code refuses: a 4xx or 5xx (RFC 5321 section 4.2.1).

    Any other code is no clear answer: a success code such as 252, a code from
    600 up (RFC 5321 defines none), or a reply smtplib couldn't read. That
    comes as -1, or as whatever ``int()`` makes of the line's first three
    characters (" 250 ok" reads as 25, "-50 x" as -50). After a -1, smtplib
    stops reading that reply, so the lines after it are taken as the answers to
    the commands that follow.

    smtplib lists every RCPT reply but 250 and 251 as a refused recipient, so a
    listed recipient whose code isn't a refusal may have been accepted.
    """
    return FIRST_TRANSIENT_REPLY_CODE <= code < FIRST_INVALID_REPLY_CODE


def reply_code_text(code: int) -> str:
    """A reply code for a message: a negative code, from a reply smtplib
    couldn't read, shows as "unreadable"."""
    if code < 0:
        return "unreadable"
    return str(code)


def is_smtplib_line_too_long(exc: smtplib.SMTPResponseException) -> bool:
    """Whether this is smtplib's own "500 Line too long.", raised when a reply
    line runs past its limit, rather than a 500 the server sent."""
    # The ``str`` check comes first: comparing a server's ``bytes`` reply with a
    # ``str`` warns, and raises under ``python -bb``.
    return isinstance(exc.smtp_error, str) and exc.smtp_error == SMTPLIB_LINE_TOO_LONG


def is_bare_smtp_exception(exc: BaseException) -> bool:
    """smtplib raises plain ``SMTPException`` (no subclass) only for setup
    faults, e.g. "No suitable authentication method found" from ``login``."""
    return type(exc) is smtplib.SMTPException


def is_config_fault(exc: BaseException) -> bool:
    """Whether no retry can fix this failure: an SMTP host that doesn't
    resolve, no TLS / AUTH support, an untrusted certificate (``CONFIG_ERRORS``)
    or smtplib's own setup errors. A host lookup that failed only for now is a
    ``socket.gaierror`` too, but a retry may fix it."""
    if is_temporary_dns_failure(exc):
        return False
    return isinstance(exc, CONFIG_ERRORS) or is_bare_smtp_exception(exc)
