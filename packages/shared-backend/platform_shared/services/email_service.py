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

The pre-2026-05-05 ``send()`` method silently returned False when
SMTP creds were empty — that pattern caused the Kenneth verification-
email outage. Use ``send_or_raise()`` for every critical-path email
where the user has no other recovery path.
"""
import logging
import smtplib
import ssl
from dataclasses import dataclass
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

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


@dataclass
class EmailService:
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    from_name: str = ""

    def is_configured(self) -> bool:
        return bool(self.smtp_user and self.smtp_password)

    def send_or_raise(self, to: list[str], subject: str, body_html: str) -> None:
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

        msg = MIMEMultipart("alternative")
        msg["From"] = f"{self.from_name} <{self.smtp_user}>"
        msg["To"] = ", ".join(to)
        msg["Subject"] = subject
        msg.attach(MIMEText(body_html, "html"))

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

    def send(self, to: list[str], subject: str, body_html: str) -> bool:
        """Best-effort send. Returns True on success, False on failure.

        Use for non-critical emails (cost alerts, demos, marketing).
        Logs failures at warning level and continues. Critical-path
        callers MUST use send_or_raise() instead — silently swallowing
        a failed verification email leaves the user in a broken state
        with no recovery path.
        """
        try:
            self.send_or_raise(to, subject, body_html)
            return True
        except (ValueError, EmailNotConfiguredError, EmailSendError):
            logger.warning(
                "Best-effort email send failed to %s: %s",
                to,
                subject,
                exc_info=True,
            )
            return False
