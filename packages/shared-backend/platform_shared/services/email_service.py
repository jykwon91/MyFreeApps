"""SMTP email service with configurable branding.

Usage:
    mailer = EmailService(
        smtp_host="smtp.gmail.com", smtp_port=587,
        smtp_user="user@gmail.com", smtp_password="...",
        from_name="MyApp",
        backend="smtp",   # or "console": log each send instead (dev/CI)
    )

    # Critical-path emails (verification, password reset, account
    # recovery) — caller MUST know if delivery failed:
    await mailer.send_or_raise_async(["user@example.com"], "Verify", "<h1>Hi</h1>")

    # Best-effort emails (cost alerts, demos) — caller continues on
    # failure:
    ok = await mailer.send_async(["admin@example.com"], "Cost Alert", "<h1>...</h1>")

    # With attachments (e.g. lease PDFs):
    from platform_shared.services.email_attachment import EmailAttachment
    await mailer.send_or_raise_async(
        ["tenant@example.com"], "Your lease", "<p>Attached.</p>",
        attachments=[EmailAttachment("lease.pdf", pdf_bytes, "application/pdf")],
    )

The SMTP conversation is blocking network I/O. From ``async`` code always use
the ``*_async`` methods: they run the send in a worker thread, so a slow or
stalled SMTP server can't freeze the event loop (and with it every request on
the worker, healthchecks included). The plain ``send`` / ``send_or_raise`` are
for code that is already off the loop (scripts, worker threads). Every socket
operation is capped by ``SMTP_TIMEOUT_SECONDS``.

A failed send raises ``EmailSendError`` carrying ``kind`` (misconfigured /
recipient_rejected / message_rejected / transient), the server's
``smtp_code`` and any ``refused_recipients``, and is logged with them.
Log lines name recipients by count and domain only and never carry the
subject, which often names a tenant or applicant.

The pre-2026-05-05 ``send()`` method silently returned False when
SMTP creds were empty — that pattern caused the Kenneth verification-
email outage. Use ``send_or_raise()`` for every critical-path email
where the user has no other recovery path.
"""
import asyncio
import email.errors
import logging
import smtplib
import ssl
from collections.abc import Sequence
from dataclasses import dataclass
from email.mime.application import MIMEApplication
from email.mime.base import MIMEBase
from email.mime.image import MIMEImage
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import get_args

from platform_shared.core.email_constants import SMTP_TIMEOUT_SECONDS
from platform_shared.core.email_header_utils import strip_line_breaks
from platform_shared.core.recipient_log import describe_recipients
from platform_shared.core.settings import BaseAppSettings
from platform_shared.services.email_attachment import EmailAttachment
from platform_shared.services.email_backend import EmailBackend
from platform_shared.services.email_send_error import EmailSendError
from platform_shared.services.smtp_failure import (
    error_from_refused_recipients,
    error_from_smtp_exception,
)

logger = logging.getLogger(__name__)


class EmailNotConfiguredError(RuntimeError):
    """Raised when SMTP credentials are missing.

    Use the platform_shared.core.boot_guards.check_email_configured()
    boot guard to surface this at lifespan startup so deploys fail
    loud instead of users seeing "registration succeeded but no email
    arrived".
    """


def _build_attachment_part(attachment: EmailAttachment) -> MIMEBase:
    """Build a MIME part for a single attachment, picking the right
    subclass for image / PDF / generic-binary so most clients render
    the right preview affordance.
    """
    ct = attachment.content_type.lower()
    if ct.startswith("image/"):
        # MIMEImage picks the right image subtype from the content
        # bytes when possible; we still pass the explicit subtype as
        # a hint for content_type strings like "image/jpeg".
        subtype = ct.split("/", 1)[1] if "/" in ct else None
        part: MIMEBase = MIMEImage(attachment.content, _subtype=subtype)
    else:
        # Everything else — PDF, DOCX, octet-stream, etc. — goes
        # through MIMEApplication which sets Content-Transfer-Encoding
        # to base64 automatically.
        if "/" in ct:
            _, subtype = ct.split("/", 1)
        else:
            subtype = "octet-stream"
        part = MIMEApplication(attachment.content, _subtype=subtype)

    part.add_header(
        "Content-Disposition",
        "attachment",
        filename=attachment.filename,
    )
    return part


@dataclass
class EmailService:
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    from_name: str = ""
    backend: EmailBackend = "smtp"

    @classmethod
    def from_settings(cls, settings: BaseAppSettings) -> "EmailService":
        return cls(
            smtp_host=settings.smtp_host,
            smtp_port=settings.smtp_port,
            smtp_user=settings.smtp_user,
            smtp_password=settings.smtp_password,
            from_name=settings.email_from_name,
            backend=settings.email_backend,
        )

    def __post_init__(self) -> None:
        if self.backend not in get_args(EmailBackend):
            raise ValueError(f"Unknown email backend {self.backend!r}; use one of {get_args(EmailBackend)}")

    def is_configured(self) -> bool:
        """Whether a send can go through: always in console mode, else when SMTP creds are set."""
        return self.backend == "console" or bool(self.smtp_user and self.smtp_password)

    def send_or_raise(
        self,
        to: list[str],
        subject: str,
        body_html: str,
        *,
        attachments: Sequence[EmailAttachment] | None = None,
        reply_to: str | None = None,
    ) -> None:
        """Send the email, raising on any failure.

        Use for critical-path emails: verification, password reset,
        organization invites. Caller is expected to either propagate
        the exception (so the HTTP request fails 5xx and the user
        retries) or handle it explicitly.

        ``reply_to`` (optional) sets the ``Reply-To`` header so replies
        route to a different address than the sending mailbox — e.g. a
        host sending a guest welcome guide wants the guest's reply to
        land in the host's own inbox, not the system SMTP account.

        Raises:
            ValueError: If ``to`` is empty.
            EmailNotConfiguredError: If SMTP creds are missing.
            EmailSendError: If SMTP send fails for any other reason
                (network, timeout, auth, recipient rejected). Its ``kind``,
                ``smtp_code`` and ``refused_recipients`` say which.
        """
        if not to:
            raise ValueError("Recipients list cannot be empty")
        if self.backend == "console":
            logger.info(
                "[email:console] to=%s body_chars=%d attachments=%d",
                describe_recipients(to), len(body_html), len(attachments or ()),
            )
            return
        if not self.is_configured():
            raise EmailNotConfiguredError(
                "SMTP credentials are not configured (smtp_user / smtp_password "
                "are empty). The platform_shared.core.boot_guards."
                "check_email_configured() guard should have caught this at "
                "lifespan startup — investigate why the runtime EmailService "
                "instance has empty creds."
            )

        to = [strip_line_breaks(address) for address in to]
        subject = strip_line_breaks(subject)
        sender = strip_line_breaks(self.smtp_user)

        if attachments:
            # ``mixed`` so the body+alternative is the first part and
            # each attachment is a sibling part; matches RFC 2046 §5.1.
            msg: MIMEMultipart = MIMEMultipart("mixed")
            body_container = MIMEMultipart("alternative")
            body_container.attach(MIMEText(body_html, "html"))
            msg.attach(body_container)
            for attachment in attachments:
                msg.attach(_build_attachment_part(attachment))
        else:
            msg = MIMEMultipart("alternative")
            msg.attach(MIMEText(body_html, "html"))

        msg["From"] = f"{strip_line_breaks(self.from_name)} <{sender}>"
        msg["To"] = ", ".join(to)
        msg["Subject"] = subject
        if reply_to:
            msg["Reply-To"] = strip_line_breaks(reply_to)

        try:
            refused = self._deliver(sender, to, msg.as_string())
        except (smtplib.SMTPException, OSError, email.errors.MessageError, UnicodeError) as e:
            error = error_from_smtp_exception(e, recipient_count=len(to))
            _log_send_failure(error, to)
            # Not chained: the smtplib exception's text quotes the recipient, and
            # a cause is printed in full in the ERROR traceback Sentry receives.
            raise error from None
        if refused:
            error = error_from_refused_recipients(refused, recipient_count=len(to))
            _log_send_failure(error, to)
            raise error

        logger.info("Email sent via SMTP to %s", describe_recipients(to))

    def _deliver(self, sender: str, to: list[str], payload: str) -> dict[str, tuple[int, bytes]]:
        """Run one SMTP conversation; return the recipients the server refused.

        Raises ``smtplib.SMTPException`` / ``OSError`` / ``UnicodeError`` (a
        non-ASCII address, which smtplib encodes as ASCII) only for failures
        before the server accepted the message. Once ``sendmail`` returns the email is
        out, so a failing QUIT afterwards is logged, not raised: reporting it
        as a failed send would invite a resend and a duplicate email.
        """
        server = smtplib.SMTP(self.smtp_host, self.smtp_port, timeout=SMTP_TIMEOUT_SECONDS)
        try:
            server.starttls(context=ssl.create_default_context())
            server.login(self.smtp_user, self.smtp_password)
            refused = server.sendmail(sender, to, payload)
        except BaseException:
            server.close()
            raise
        try:
            server.quit()
        except (smtplib.SMTPException, OSError) as e:
            logger.warning(
                "SMTP server accepted the email but closing the session failed; "
                "treating the send as delivered: %r", e,
            )
            server.close()
        return refused

    async def send_or_raise_async(
        self,
        to: list[str],
        subject: str,
        body_html: str,
        *,
        attachments: Sequence[EmailAttachment] | None = None,
        reply_to: str | None = None,
    ) -> None:
        """``send_or_raise`` run in a worker thread, for ``async`` callers. Same errors."""
        await asyncio.to_thread(
            self.send_or_raise, to, subject, body_html,
            attachments=attachments, reply_to=reply_to,
        )

    def send(
        self,
        to: list[str],
        subject: str,
        body_html: str,
        *,
        attachments: Sequence[EmailAttachment] | None = None,
        reply_to: str | None = None,
    ) -> bool:
        """Best-effort send. Returns True on success, False on failure.

        Use for non-critical emails (cost alerts, demos, marketing).
        Logs failures at warning level and continues. Critical-path
        callers MUST use send_or_raise() instead — silently swallowing
        a failed verification email leaves the user in a broken state
        with no recovery path.

        ``reply_to`` (optional) is threaded to ``send_or_raise`` to set
        the ``Reply-To`` header — see that method's docstring.
        """
        try:
            self.send_or_raise(
                to, subject, body_html,
                attachments=attachments, reply_to=reply_to,
            )
            return True
        except (ValueError, EmailNotConfiguredError, EmailSendError) as exc:
            # No traceback: this is a best-effort send, and the message already
            # carries the masked reason.
            logger.warning(
                "Best-effort email send failed to %s (%s: %s)",
                describe_recipients(to),
                type(exc).__name__,
                exc,
            )
            return False

    async def send_async(
        self,
        to: list[str],
        subject: str,
        body_html: str,
        *,
        attachments: Sequence[EmailAttachment] | None = None,
        reply_to: str | None = None,
    ) -> bool:
        """``send`` run in a worker thread, for ``async`` callers."""
        return await asyncio.to_thread(
            self.send, to, subject, body_html,
            attachments=attachments, reply_to=reply_to,
        )


def _log_send_failure(error: EmailSendError, to: list[str]) -> None:
    """Log a failed send with its SMTP code. Config faults log at ERROR: an
    operator has to act, and every later send will fail the same way."""
    level = logging.ERROR if error.kind == "misconfigured" else logging.WARNING
    logger.log(
        level,
        "SMTP send failed: kind=%s smtp_code=%s refused=%d to=%s: %s",
        error.kind, error.smtp_code, len(error.refused_recipients), describe_recipients(to), error,
    )
