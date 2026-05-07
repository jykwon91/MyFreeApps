"""SMTP email service with configurable branding.

Usage:
    mailer = EmailService(
        smtp_host="smtp.gmail.com", smtp_port=587,
        smtp_user="user@gmail.com", smtp_password="...",
        from_name="MyApp",
    )

    # Critical-path emails (verification, password reset, account
    # recovery) — caller MUST know if delivery failed:
    mailer.send_or_raise(["user@example.com"], "Verify", "<h1>Hi</h1>")

    # Best-effort emails (cost alerts, demos) — caller continues on
    # failure:
    ok = mailer.send(["admin@example.com"], "Cost Alert", "<h1>...</h1>")

    # With attachments (e.g. lease PDFs):
    from platform_shared.services.email_attachment import EmailAttachment
    mailer.send_or_raise(
        ["tenant@example.com"], "Your lease", "<p>Attached.</p>",
        attachments=[EmailAttachment("lease.pdf", pdf_bytes, "application/pdf")],
    )

The pre-2026-05-05 ``send()`` method silently returned False when
SMTP creds were empty — that pattern caused the Kenneth verification-
email outage. Use ``send_or_raise()`` for every critical-path email
where the user has no other recovery path.
"""
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

from platform_shared.services.email_attachment import EmailAttachment

logger = logging.getLogger(__name__)


class EmailNotConfiguredError(RuntimeError):
    """Raised when SMTP credentials are missing.

    Use the platform_shared.core.boot_guards.check_email_configured()
    boot guard to surface this at lifespan startup so deploys fail
    loud instead of users seeing "registration succeeded but no email
    arrived".
    """


class EmailSendError(RuntimeError):
    """Raised when SMTP send fails (network outage, auth rejection,
    recipient rejected, etc.). Distinct from EmailNotConfiguredError —
    this is a transient or addressee-specific failure, not a deploy
    misconfiguration.
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

    def is_configured(self) -> bool:
        return bool(self.smtp_user and self.smtp_password)

    def send_or_raise(
        self,
        to: list[str],
        subject: str,
        body_html: str,
        *,
        attachments: Sequence[EmailAttachment] | None = None,
    ) -> None:
        """Send the email, raising on any failure.

        Use for critical-path emails: verification, password reset,
        organization invites. Caller is expected to either propagate
        the exception (so the HTTP request fails 5xx and the user
        retries) or handle it explicitly.

        Raises:
            ValueError: If ``to`` is empty.
            EmailNotConfiguredError: If SMTP creds are missing.
            EmailSendError: If SMTP send fails for any other reason
                (network, auth, recipient rejected).
        """
        if not to:
            raise ValueError("Recipients list cannot be empty")
        if not self.is_configured():
            raise EmailNotConfiguredError(
                "SMTP credentials are not configured (smtp_user / smtp_password "
                "are empty). The platform_shared.core.boot_guards."
                "check_email_configured() guard should have caught this at "
                "lifespan startup — investigate why the runtime EmailService "
                "instance has empty creds."
            )

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

        msg["From"] = f"{self.from_name} <{self.smtp_user}>"
        msg["To"] = ", ".join(to)
        msg["Subject"] = subject

        try:
            with smtplib.SMTP(self.smtp_host, self.smtp_port) as server:
                server.starttls(context=ssl.create_default_context())
                server.login(self.smtp_user, self.smtp_password)
                server.sendmail(self.smtp_user, to, msg.as_string())
        except Exception as e:
            raise EmailSendError(
                f"SMTP send to {to} failed: {e}"
            ) from e

        logger.info("Email sent via SMTP to %s: %s", to, subject)

    def send(
        self,
        to: list[str],
        subject: str,
        body_html: str,
        *,
        attachments: Sequence[EmailAttachment] | None = None,
    ) -> bool:
        """Best-effort send. Returns True on success, False on failure.

        Use for non-critical emails (cost alerts, demos, marketing).
        Logs failures at warning level and continues. Critical-path
        callers MUST use send_or_raise() instead — silently swallowing
        a failed verification email leaves the user in a broken state
        with no recovery path.
        """
        try:
            self.send_or_raise(to, subject, body_html, attachments=attachments)
            return True
        except (ValueError, EmailNotConfiguredError, EmailSendError):
            logger.warning(
                "Best-effort email send failed to %s: %s",
                to,
                subject,
                exc_info=True,
            )
            return False
