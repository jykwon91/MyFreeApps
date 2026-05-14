"""Email delivery wrapper for __APP_DISPLAY_NAME__.

Mirrors apps/myjobhunter/backend/app/services/email/email_sender.py exactly
(name swap only).
"""
import logging

from platform_shared.services.email_service import (
    EmailNotConfiguredError,
    EmailSendError,
    EmailService,
)

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


def _log_console_send(to: list[str], subject: str, body_html: str) -> None:
    logger.info(
        "[email:console] to=%s subject=%r body_chars=%d",
        to,
        subject,
        len(body_html),
    )


def send_email(to: list[str], subject: str, body_html: str) -> bool:
    if not to:
        return False
    if settings.email_backend == "smtp":
        return _smtp_service().send(to, subject, body_html)
    _log_console_send(to, subject, body_html)
    return True


def send_email_or_raise(to: list[str], subject: str, body_html: str) -> None:
    if not to:
        raise ValueError("Recipients list cannot be empty")
    if settings.email_backend == "smtp":
        _smtp_service().send_or_raise(to, subject, body_html)
        return
    _log_console_send(to, subject, body_html)


__all__ = [
    "send_email",
    "send_email_or_raise",
    "EmailNotConfiguredError",
    "EmailSendError",
]
