"""Email verification template + sender for MyJobHunter."""
import logging

from platform_shared.services.email_templates import build_verification_html

from app.core.branding import MJH_BRANDING
from app.core.config import settings
from app.services.email.email_sender import send_email_or_raise

logger = logging.getLogger(__name__)


def _build_verification_html(verify_url: str) -> str:
    return build_verification_html(verify_url=verify_url, branding=MJH_BRANDING)


def send_verification_email(recipient_email: str, token: str) -> None:
    """Send the email-verification message to a newly registered user.

    Critical-path transactional email — raises rather than returning a
    bool so any failure propagates to the request handler. The pre-2026-05-05
    bool-returning version silently logged a warning on failure, which
    is how kennethmontgo@gmail.com ended up with a registered-but-unverified
    account and no recovery path.

    Raises:
        ValueError, EmailNotConfiguredError, EmailSendError — see
        ``send_email_or_raise`` for semantics.
    """
    base_url = settings.frontend_url.rstrip("/")
    verify_url = f"{base_url}/verify-email?token={token}"
    html = _build_verification_html(verify_url)
    subject = "Verify your MyJobHunter email"
    send_email_or_raise([recipient_email], subject, html)
