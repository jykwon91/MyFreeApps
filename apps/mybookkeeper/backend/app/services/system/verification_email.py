"""Email verification template and sender."""

import logging

from platform_shared.services.email_templates import build_verification_html

from app.core.branding import MBK_BRANDING
from app.core.config import settings
from app.services.system import email_service

logger = logging.getLogger(__name__)


def _build_verification_html(verify_url: str) -> str:
    return build_verification_html(verify_url=verify_url, branding=MBK_BRANDING)


def send_verification_email(recipient_email: str, token: str) -> bool:
    base_url = settings.frontend_url.rstrip("/")
    verify_url = f"{base_url}/verify-email?token={token}"
    html = _build_verification_html(verify_url)
    subject = "Verify your MyBookkeeper email"
    success = email_service.send_email([recipient_email], subject, html)
    if not success:
        logger.warning("Failed to send verification email to %s", recipient_email)
    return success
