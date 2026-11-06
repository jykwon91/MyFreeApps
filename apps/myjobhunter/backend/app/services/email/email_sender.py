"""Email delivery wrapper.

Routes to the shared EmailService, which sends via SMTP or, in console
mode (dev/CI), only logs each send. Tests patch ``send_email`` / ``send_email_or_raise``
directly.

Two send functions:

  - ``send_email()``           — best-effort. Returns bool. For non-critical
                                 emails (cost alerts, demo flows) where
                                 missed delivery is acceptable.
  - ``send_email_or_raise()``  — fail-loud. Raises on any failure. For
                                 critical-path emails (verification,
                                 password reset, organization invites)
                                 where silent loss leaves the user broken.

The boot-time check (platform_shared.core.boot_guards.check_email_configured)
already validates the configuration shape at lifespan startup; the
``_or_raise`` variant is the runtime safety net for transient SMTP
failures (network outage, auth rejection, recipient rejected).
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
