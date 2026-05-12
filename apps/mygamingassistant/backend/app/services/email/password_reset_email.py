"""Password-reset email template + sender for MyGamingAssistant."""
import logging

from platform_shared.services.email_templates import build_password_reset_html

from app.core.branding import MGA_BRANDING
from app.core.config import settings
from app.services.email.email_sender import send_email_or_raise

logger = logging.getLogger(__name__)


def send_password_reset_email(recipient_email: str, token: str) -> None:
    """Send the password-reset message to the operator."""
    base_url = settings.frontend_url.rstrip("/")
    reset_url = f"{base_url}/reset-password?token={token}"
    html = build_password_reset_html(reset_url=reset_url, branding=MGA_BRANDING)
    send_email_or_raise([recipient_email], "Reset your MyGamingAssistant password", html)
    logger.info("Password-reset email sent to %s", recipient_email)
