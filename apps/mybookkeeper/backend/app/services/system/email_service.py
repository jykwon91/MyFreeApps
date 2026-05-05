"""MyBookkeeper email service.

Thin wrapper around ``platform_shared.services.email_service.EmailService``.
The actual SMTP transport, STARTTLS hardening, and fail-loud /
best-effort split live in the shared layer. This module:

  - Constructs the EmailService from MBK Settings
  - Exposes module-level functions matching the historical API
    (send_email, send_email_or_raise, is_configured, get_recipients,
    send_cost_alert, send_test_email) so existing callers don't change
  - Owns the MBK-specific cost alert + test email HTML templates
  - Routes the cost-alert recipients list (an MBK-specific feature)
"""

import html as html_mod
import logging
from functools import lru_cache

from platform_shared.services.email_service import (
    EmailNotConfiguredError,
    EmailSendError,
    EmailService,
)

from app.core.config import settings

logger = logging.getLogger(__name__)


@lru_cache(maxsize=1)
def _get_email_service() -> EmailService:
    """Build the shared EmailService from MBK Settings.

    Cached so we construct one instance per process. Tests can clear
    the cache via ``_get_email_service.cache_clear()`` if they need
    to swap settings mid-run.
    """
    return EmailService(
        smtp_host=settings.smtp_host,
        smtp_port=settings.smtp_port,
        smtp_user=settings.smtp_user,
        smtp_password=settings.smtp_password,
        from_name=settings.email_from_name,
    )


def is_configured() -> bool:
    return _get_email_service().is_configured()


def get_recipients() -> list[str]:
    """Cost-alert recipient list, parsed from a comma-separated env var."""
    raw = settings.cost_alert_recipients.strip()
    if not raw:
        return []
    return [addr.strip() for addr in raw.split(",") if addr.strip()]


def send_email(to: list[str], subject: str, body_html: str) -> bool:
    """Best-effort send. Returns True on success, False on failure.

    Use for non-critical emails (cost alerts, demos, inquiry
    notifications). Critical-path callers (verification, password
    reset, organization invites) MUST use ``send_email_or_raise``.
    """
    if not to:
        return False
    return _get_email_service().send(to, subject, body_html)


def send_email_or_raise(to: list[str], subject: str, body_html: str) -> None:
    """Fail-loud send. Raises on any failure.

    Raises:
        ValueError: If ``to`` is empty.
        EmailNotConfiguredError: If SMTP creds are missing.
        EmailSendError: If SMTP send fails (network, auth, recipient
            rejected).
    """
    _get_email_service().send_or_raise(to, subject, body_html)


def send_cost_alert(severity: str, message: str, cost: float, budget: float) -> bool:
    """Best-effort cost-alert email — operator-facing, OK to drop on failure."""
    recipients = get_recipients()
    if not recipients:
        return False

    color = "#dc2626" if severity == "critical" else "#f59e0b"
    label = "CRITICAL" if severity == "critical" else "WARNING"

    html = f"""
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 480px; margin: 0 auto;">
      <div style="background: {color}; color: white; padding: 16px 20px; border-radius: 8px 8px 0 0;">
        <h2 style="margin: 0; font-size: 18px;">Cost Alert &mdash; {label}</h2>
      </div>
      <div style="border: 1px solid #e5e7eb; border-top: none; padding: 20px; border-radius: 0 0 8px 8px;">
        <p style="margin: 0 0 16px 0; font-size: 15px; color: #374151;">{html_mod.escape(message)}</p>
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Current Cost</td>
            <td style="padding: 8px 0; text-align: right; font-weight: 600; font-size: 14px;">${cost:.2f}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Budget</td>
            <td style="padding: 8px 0; text-align: right; font-weight: 600; font-size: 14px;">${budget:.2f}</td>
          </tr>
        </table>
        <p style="margin: 16px 0 0 0; font-size: 13px; color: #9ca3af;">
          This alert was sent by MyBookkeeper's cost monitoring system.
        </p>
      </div>
    </div>
    """

    return send_email(recipients, f"[MyBookkeeper] Cost Alert &mdash; {label}", html)


def send_test_email(to: str) -> bool:
    """Best-effort test email — used by the operator-only POST /admin/test-email
    endpoint to verify SMTP wiring. Reasonable to swallow the failure (the
    HTTP response surfaces it via the False return)."""
    html = """
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 480px; margin: 0 auto;">
      <div style="background: #22c55e; color: white; padding: 16px 20px; border-radius: 8px 8px 0 0;">
        <h2 style="margin: 0; font-size: 18px;">Email Test Successful</h2>
      </div>
      <div style="border: 1px solid #e5e7eb; border-top: none; padding: 20px; border-radius: 0 0 8px 8px;">
        <p style="margin: 0; font-size: 15px; color: #374151;">
          Your email configuration is working correctly. Alert emails will be delivered to this address.
        </p>
      </div>
    </div>
    """
    return send_email([to], "[MyBookkeeper] Email Test &mdash; Success", html)


__all__ = [
    "EmailNotConfiguredError",
    "EmailSendError",
    "is_configured",
    "get_recipients",
    "send_email",
    "send_email_or_raise",
    "send_cost_alert",
    "send_test_email",
]
