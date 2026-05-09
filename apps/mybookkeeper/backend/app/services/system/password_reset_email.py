"""Password reset email template and sender."""

import logging

from platform_shared.services.email_templates import build_password_reset_html

from app.core.branding import MBK_BRANDING
from app.core.config import settings
from app.services.system.email_service import send_email_or_raise

logger = logging.getLogger(__name__)


def _build_reset_html(reset_url: str) -> str:
    return build_password_reset_html(reset_url=reset_url, branding=MBK_BRANDING)


def send_password_reset_email(recipient_email: str, token: str) -> None:
    """Send the password-reset message to a user who initiated forgot-password.

    Critical-path transactional email — raises rather than returning a
    bool so any failure propagates to the request handler. The pre-2026-05-09
    bool-returning version silently logged a warning on failure, which
    meant POST /auth/forgot-password could return 202 to the caller while
    the reset link never reached their inbox — same bug class as the
    kennethmontgo@gmail.com verification-email gap fixed in PR #540.

    Sister fix to H6 (verification email fail-loud, #540). H7 added MJH's
    password-reset-email service in fail-loud shape (#541); this PR brings
    MBK's existing service to the same fail-loud contract so both apps
    behave identically.

    Raises:
        ValueError, EmailNotConfiguredError, EmailSendError — see
        ``send_email_or_raise`` for semantics.
    """
    base_url = settings.frontend_url.rstrip("/")
    reset_url = f"{base_url}/reset-password?token={token}"
    html = _build_reset_html(reset_url)
    subject = "Reset your MyBookkeeper password"
    send_email_or_raise([recipient_email], subject, html)
