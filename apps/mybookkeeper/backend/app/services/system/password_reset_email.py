"""Password reset email template and sender."""

import html as html_mod
import logging

from app.core.config import settings
from app.services.system import email_service

logger = logging.getLogger(__name__)


def _build_reset_html(reset_url: str) -> str:
    safe_url = html_mod.escape(reset_url)

    return f"""\
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f9fafb; padding: 40px 20px;">
  <div style="max-width: 480px; margin: 0 auto; background: #ffffff; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); overflow: hidden;">

    <div style="background: #22c55e; padding: 28px 24px; text-align: center;">
      <h1 style="margin: 0; color: #ffffff; font-size: 22px; font-weight: 700; letter-spacing: -0.3px;">
        &#x1F4D2; MyBookkeeper
      </h1>
      <p style="margin: 6px 0 0 0; color: rgba(255,255,255,0.9); font-size: 14px;">
        Your AI-powered bookkeeping assistant
      </p>
    </div>

    <div style="padding: 28px 24px;">
      <p style="margin: 0 0 16px 0; font-size: 16px; color: #111827; line-height: 1.5;">
        Password reset requested
      </p>
      <p style="margin: 0 0 20px 0; font-size: 15px; color: #374151; line-height: 1.6;">
        We received a request to reset your password. Click the button below to choose a new password.
      </p>

      <div style="text-align: center; margin: 0 0 24px 0;">
        <a href="{safe_url}" style="display: inline-block; background: #22c55e; color: #ffffff; text-decoration: none; padding: 12px 32px; border-radius: 8px; font-size: 15px; font-weight: 600; letter-spacing: 0.2px;">
          Reset Password
        </a>
      </div>

      <p style="margin: 0 0 8px 0; font-size: 14px; color: #6b7280; line-height: 1.5;">
        This link expires in 1 hour. If you didn't request a password reset, you can safely ignore this email &mdash; your password won't be changed.
      </p>
      <p style="margin: 0; font-size: 13px; color: #9ca3af; line-height: 1.5; word-break: break-all;">
        If the button doesn't work, copy and paste this URL into your browser:<br/>
        <a href="{safe_url}" style="color: #6b7280;">{safe_url}</a>
      </p>
    </div>

    <div style="border-top: 1px solid #e5e7eb; padding: 16px 24px; text-align: center;">
      <p style="margin: 0; font-size: 12px; color: #9ca3af;">
        Sent by MyBookkeeper &bull; AI-powered bookkeeping
      </p>
    </div>

  </div>
</div>"""


def send_password_reset_email(recipient_email: str, token: str) -> bool:
    base_url = settings.frontend_url.rstrip("/")
    reset_url = f"{base_url}/reset-password?token={token}"
    html = _build_reset_html(reset_url)
    subject = "Reset your MyBookkeeper password"
    success = email_service.send_email([recipient_email], subject, html)
    if not success:
        logger.warning("Failed to send password reset email to %s", recipient_email)
    return success
