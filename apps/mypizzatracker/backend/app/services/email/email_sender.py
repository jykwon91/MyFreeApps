"""Email delivery wrapper for MyPizzaTracker.

Mirrors apps/myjobhunter/backend/app/services/email/email_sender.py exactly
(name swap only).
"""
from platform_shared.services.email_service import (
    EmailNotConfiguredError,
    EmailSendError,
    EmailService,
)

from app.core.config import settings


def send_email(to: list[str], subject: str, body_html: str) -> bool:
    return EmailService.from_settings(settings).send(to, subject, body_html)


def send_email_or_raise(to: list[str], subject: str, body_html: str) -> None:
    EmailService.from_settings(settings).send_or_raise(to, subject, body_html)


__all__ = [
    "send_email",
    "send_email_or_raise",
    "EmailNotConfiguredError",
    "EmailSendError",
]
