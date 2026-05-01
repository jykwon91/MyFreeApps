"""Email delivery wrapper.

Routes to the shared SMTP EmailService when configured, or prints to stdout
in console mode for dev/CI. Tests patch `send_email` directly.
"""
import logging

from platform_shared.services.email_service import EmailService

from app.core.config import settings

logger = logging.getLogger(__name__)


def _smtp_service() -> EmailService:
    return EmailService(
        smtp_host=settings.smtp_host,
        smtp_port=settings.smtp_port,
        smtp_user=settings.smtp_user,
        smtp_password=settings.smtp_password,
        from_name=settings.email_from_name,
    )


def send_email(to: list[str], subject: str, body_html: str) -> bool:
    """Send an email via the configured backend.

    Console backend logs the subject + recipients + body length to stdout —
    intentional for dev / CI so SMTP credentials are never required to test
    flows that emit transactional email.
    """
    if not to:
        return False

    if settings.email_backend == "smtp":
        return _smtp_service().send(to, subject, body_html)

    # Default: console backend
    logger.info(
        "[email:console] to=%s subject=%r body_chars=%d",
        to,
        subject,
        len(body_html),
    )
    return True
