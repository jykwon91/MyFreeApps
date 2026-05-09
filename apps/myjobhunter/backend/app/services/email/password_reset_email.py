"""Password-reset email template + sender for MyJobHunter."""
import logging

from platform_shared.services.email_templates import build_password_reset_html

from app.core.branding import MJH_BRANDING
from app.core.config import settings
from app.services.email.email_sender import send_email_or_raise

logger = logging.getLogger(__name__)


def _build_reset_html(reset_url: str) -> str:
    return build_password_reset_html(reset_url=reset_url, branding=MJH_BRANDING)


def send_password_reset_email(recipient_email: str, token: str) -> None:
    """Send the password-reset message to a user who initiated forgot-password.

    Critical-path transactional email — raises rather than returning a
    bool so any failure propagates to the request handler. Without this
    wired, MJH's POST /auth/forgot-password endpoint issues a token via
    fastapi-users but never delivers it (silent gap pre-2026-05-09).

    Mirrors apps/myjobhunter/backend/app/services/email/verification_email.py
    in fail-loud shape.

    Raises:
        ValueError, EmailNotConfiguredError, EmailSendError — see
        ``send_email_or_raise`` for semantics.
    """
    base_url = settings.frontend_url.rstrip("/")
    reset_url = f"{base_url}/reset-password?token={token}"
    html = _build_reset_html(reset_url)
    subject = "Reset your MyJobHunter password"
    send_email_or_raise([recipient_email], subject, html)
