"""Email verification template + sender for MyJobHunter."""
import html as html_mod
import logging

from app.core.config import settings
from app.services.email.email_sender import send_email

logger = logging.getLogger(__name__)


def _build_verification_html(verify_url: str) -> str:
    safe_url = html_mod.escape(verify_url)

    return f"""\
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f9fafb; padding: 40px 20px;">
  <div style="max-width: 480px; margin: 0 auto; background: #ffffff; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); overflow: hidden;">

    <div style="background: #2563eb; padding: 28px 24px; text-align: center;">
      <h1 style="margin: 0; color: #ffffff; font-size: 22px; font-weight: 700; letter-spacing: -0.3px;">
        MyJobHunter
      </h1>
      <p style="margin: 6px 0 0 0; color: rgba(255,255,255,0.9); font-size: 14px;">
        Your AI-powered job search assistant
      </p>
    </div>

    <div style="padding: 28px 24px;">
      <p style="margin: 0 0 16px 0; font-size: 16px; color: #111827; line-height: 1.5;">
        Welcome to MyJobHunter!
      </p>
      <p style="margin: 0 0 20px 0; font-size: 15px; color: #374151; line-height: 1.6;">
        Please verify your email address to activate your account. Click the button below to get started.
      </p>

      <div style="text-align: center; margin: 0 0 24px 0;">
        <a href="{safe_url}" style="display: inline-block; background: #2563eb; color: #ffffff; text-decoration: none; padding: 12px 32px; border-radius: 8px; font-size: 15px; font-weight: 600; letter-spacing: 0.2px;">
          Verify my email
        </a>
      </div>

      <p style="margin: 0 0 8px 0; font-size: 14px; color: #6b7280; line-height: 1.5;">
        This link expires in 1 hour. If you didn't create this account, you can safely ignore this email.
      </p>
      <p style="margin: 0; font-size: 13px; color: #9ca3af; line-height: 1.5; word-break: break-all;">
        If the button doesn't work, copy and paste this URL into your browser:<br/>
        <a href="{safe_url}" style="color: #6b7280;">{safe_url}</a>
      </p>
    </div>

    <div style="border-top: 1px solid #e5e7eb; padding: 16px 24px; text-align: center;">
      <p style="margin: 0; font-size: 12px; color: #9ca3af;">
        Sent by MyJobHunter
      </p>
    </div>

  </div>
</div>"""


def send_verification_email(recipient_email: str, token: str) -> bool:
    base_url = settings.frontend_url.rstrip("/")
    verify_url = f"{base_url}/verify-email?token={token}"
    html = _build_verification_html(verify_url)
    subject = "Verify your MyJobHunter email"
    success = send_email([recipient_email], subject, html)
    if not success:
        logger.warning("Failed to send verification email to %s", recipient_email)
    return success
