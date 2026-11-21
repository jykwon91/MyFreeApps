from collections.abc import Callable, Mapping

from platform_shared.services.email_failure_kind import EmailFailureKind


class EmailSendError(RuntimeError):
    """Raised when an SMTP send fails (network outage, auth rejection,
    recipient rejected, etc.). Distinct from EmailNotConfiguredError —
    that one is a deploy misconfiguration caught before any connection.

    ``kind`` says what went wrong (see ``EmailFailureKind``). ``smtp_code`` is
    the server's reply code (e.g. 535, 550, 421) when the server sent one,
    ``None`` for timeouts and dropped connections. ``refused_recipients`` maps
    each address the server refused to its reply code; when it is non-empty but
    shorter than the recipient list, the other recipients DID get the email.
    """

    def __init__(
        self,
        message: str,
        *,
        kind: EmailFailureKind,
        smtp_code: int | None = None,
        refused_recipients: Mapping[str, int] | None = None,
    ) -> None:
        super().__init__(message)
        self.kind: EmailFailureKind = kind
        self.smtp_code = smtp_code
        self.refused_recipients: dict[str, int] = dict(refused_recipients or {})

    @property
    def delivery_unconfirmed(self) -> bool:
        """True when the email may have been delivered anyway.

        A timeout or dropped connection (``transient`` with no SMTP reply code)
        can strike after the server accepted the message, so the recipient may
        have it. A reply code means the server answered, so the failure is definite.
        """
        return self.kind == "transient" and self.smtp_code is None

    def __reduce__(
        self,
    ) -> tuple[
        Callable[[str, EmailFailureKind, int | None, Mapping[str, int]], "EmailSendError"],
        tuple[str, EmailFailureKind, int | None, dict[str, int]],
    ]:
        # The keyword-only fields aren't in ``args``, so the default pickling
        # (``cls(*args)``) would fail; rebuild through a positional factory.
        return (_rebuild, (str(self), self.kind, self.smtp_code, self.refused_recipients))


def _rebuild(
    message: str,
    kind: EmailFailureKind,
    smtp_code: int | None,
    refused_recipients: Mapping[str, int],
) -> EmailSendError:
    return EmailSendError(
        message, kind=kind, smtp_code=smtp_code, refused_recipients=refused_recipients,
    )
