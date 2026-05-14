"""Email verification template + sender for __APP_DISPLAY_NAME__."""
import logging

from platform_shared.services.email_templates import build_verification_html

from app.core.branding import APP_BRANDING
from app.core.config import settings
from app.services.email.email_sender import send_email_or_raise

logger = logging.getLogger(__name__)


def send_verification_email(recipient_email: str, token: str) -> None:
    """Send the email-verification message when the seed user is first created."""
    base_url = settings.frontend_url.rstrip("/")
    verify_url = f"{base_url}/verify-email?token={token}"
    html = build_verification_html(verify_url=verify_url, branding=APP_BRANDING)
    send_email_or_raise([recipient_email], "Verify your __APP_DISPLAY_NAME__ email", html)
    logger.info("Verification email sent to %s", recipient_email)
