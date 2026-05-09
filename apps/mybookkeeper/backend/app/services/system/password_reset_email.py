"""Password reset email template and sender."""

import logging

from platform_shared.services.email_templates import build_password_reset_html

from app.core.branding import MBK_BRANDING
from app.core.config import settings
from app.services.system import email_service

logger = logging.getLogger(__name__)


def _build_reset_html(reset_url: str) -> str:
    return build_password_reset_html(reset_url=reset_url, branding=MBK_BRANDING)


def send_password_reset_email(recipient_email: str, token: str) -> bool:
    base_url = settings.frontend_url.rstrip("/")
    reset_url = f"{base_url}/reset-password?token={token}"
    html = _build_reset_html(reset_url)
    subject = "Reset your MyBookkeeper password"
    success = email_service.send_email([recipient_email], subject, html)
    if not success:
        logger.warning("Failed to send password reset email to %s", recipient_email)
    return success
