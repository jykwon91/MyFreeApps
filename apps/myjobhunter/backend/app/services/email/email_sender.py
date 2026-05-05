"""Email delivery wrapper.

Routes to the shared SMTP EmailService when configured, or prints to stdout
in console mode for dev/CI. Tests patch ``send_email`` / ``send_email_or_raise``
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
    """Console-mode "send" — for dev/CI flows that exercise the email
    path without configuring SMTP."""
    logger.info(
        "[email:console] to=%s subject=%r body_chars=%d",
        to,
        subject,
        len(body_html),
    )


def send_email(to: list[str], subject: str, body_html: str) -> bool:
    """Best-effort send. Returns True on success, False on failure.

    Console backend logs the subject + recipients + body length to stdout —
    intentional for dev/CI so SMTP credentials are never required to test
    flows that emit transactional email.

    Use for non-critical emails. For critical-path emails (verification,
    password reset), use ``send_email_or_raise`` so failures propagate
    to the request handler instead of leaving the user in a half-broken
    state.
    """
    if not to:
        return False

    if settings.email_backend == "smtp":
        return _smtp_service().send(to, subject, body_html)

    _log_console_send(to, subject, body_html)
    return True


def send_email_or_raise(to: list[str], subject: str, body_html: str) -> None:
    """Fail-loud send. Raises on any failure.

    Use for critical-path transactional emails — verification,
    password reset, organization invites. The caller is expected to
    propagate any exception so the HTTP request fails 5xx and the
    user retries.

    Raises:
        ValueError: If ``to`` is empty.
        EmailNotConfiguredError: If SMTP creds are missing while in
            ``smtp`` mode (the boot guard should have caught this).
        EmailSendError: If SMTP send fails (network, auth, recipient
            rejected).

    In ``console`` mode this never raises — useful for dev/CI flows
    that exercise the email path without configuring SMTP.
    """
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
