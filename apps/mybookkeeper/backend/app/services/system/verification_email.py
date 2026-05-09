"""Email verification template and sender."""

import logging

from platform_shared.services.email_templates import build_verification_html

from app.core.branding import MBK_BRANDING
from app.core.config import settings
from app.services.system.email_service import send_email_or_raise

logger = logging.getLogger(__name__)


def _build_verification_html(verify_url: str) -> str:
    return build_verification_html(verify_url=verify_url, branding=MBK_BRANDING)


def send_verification_email(recipient_email: str, token: str) -> None:
    """Send the email-verification message to a newly registered user.

    Critical-path transactional email — raises rather than returning a
    bool so any failure propagates to the request handler. The pre-2026-05-09
    bool-returning version silently logged a warning on failure, which
    is how kennethmontgo@gmail.com ended up with a registered-but-unverified
    account and no recovery path. MJH was migrated to fail-loud post-PR
    #205; MBK was the last remaining silent-fail path on this email per
    the 2026-05-09 parity audit (H6).

    Raises:
        ValueError, EmailNotConfiguredError, EmailSendError — see
        ``send_email_or_raise`` for semantics.
    """
    base_url = settings.frontend_url.rstrip("/")
    verify_url = f"{base_url}/verify-email?token={token}"
    html = _build_verification_html(verify_url)
    subject = "Verify your MyBookkeeper email"
    send_email_or_raise([recipient_email], subject, html)
