from collections.abc import Callable, Mapping

from platform_shared.core.mask_email_addresses import mask_email_addresses
from platform_shared.services.email_failure_kind import EmailFailureKind


class EmailSendError(RuntimeError):
    """Raised when an SMTP send fails (network outage, auth rejection,
    recipient rejected, etc.). Distinct from EmailNotConfiguredError —
    that one is a deploy misconfiguration caught before any connection.

    ``kind`` says what went wrong (see ``EmailFailureKind``). ``smtp_code`` is
    the server's reply code (e.g. 535, 550, 421) when the server sent one,
    ``None`` for timeouts, dropped connections and reply lines too long for
    smtplib to read. ``failed_before_handover`` is True when the send failed
    before the message was handed to the server (connecting, starting TLS,
    logging in, or the server turning the recipients away), so nobody can have
    received it.

    ``refused_recipients`` maps each address the server refused to its reply
    code, and is empty when it refused none. When it is non-empty and
    ``failed_before_handover`` is False, the server took the email for every
    other recipient. When it is non-empty and ``failed_before_handover`` is
    True, nobody got it: the server refused every recipient, or answered 421
    partway through them, so some may not be listed.

    The message never carries an email address: SMTP replies often quote the
    refused address, and the message is logged and sent to Sentry, so every
    address in it is cut down to its domain. ``refused_recipients`` keeps the
    full addresses for callers that must act on them.
    """

    def __init__(
        self,
        message: str,
        *,
        kind: EmailFailureKind,
        smtp_code: int | None = None,
        refused_recipients: Mapping[str, int] | None = None,
        failed_before_handover: bool = False,
    ) -> None:
        super().__init__(mask_email_addresses(message))
        self.kind: EmailFailureKind = kind
        self.smtp_code = smtp_code
        self.refused_recipients: dict[str, int] = dict(refused_recipients or {})
        self.failed_before_handover = failed_before_handover

    @property
    def delivery_unconfirmed(self) -> bool:
        """True when the email may have been delivered anyway.

        A timeout, a dropped connection or a reply smtplib couldn't read
        (``transient`` with no SMTP reply code) while the message was being
        handed over can strike after the server accepted it, so the recipient
        may have it. A reply code means the server answered, and a failure
        before the hand-over means the server never had the message, so either
        failure is definite. An error that doesn't say where it failed counts as
        unconfirmed: telling a caller it definitely failed would invite a resend
        and a duplicate email.
        """
        return self.kind == "transient" and self.smtp_code is None and not self.failed_before_handover

    def __reduce__(
        self,
    ) -> tuple[
        Callable[[str, EmailFailureKind, int | None, Mapping[str, int], bool], "EmailSendError"],
        tuple[str, EmailFailureKind, int | None, dict[str, int], bool],
    ]:
        # The keyword-only fields aren't in ``args``, so the default pickling
        # (``cls(*args)``) would fail; rebuild through a positional factory.
        return (
            _rebuild,
            (str(self), self.kind, self.smtp_code, self.refused_recipients, self.failed_before_handover),
        )


def _rebuild(
    message: str,
    kind: EmailFailureKind,
    smtp_code: int | None,
    refused_recipients: Mapping[str, int],
    # Defaulted so an error pickled before this field existed still loads.
    failed_before_handover: bool = False,
) -> EmailSendError:
    return EmailSendError(
        message,
        kind=kind,
        smtp_code=smtp_code,
        refused_recipients=refused_recipients,
        failed_before_handover=failed_before_handover,
    )
