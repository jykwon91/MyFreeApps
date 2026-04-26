"""Demo invite email template and sender."""

import html as html_mod
import logging

from app.services.system import email_service

logger = logging.getLogger(__name__)


def _build_invite_html(
    display_name: str,
    login_email: str,
    password: str,
    app_url: str,
) -> str:
    safe_name = html_mod.escape(display_name) if display_name else ""
    greeting = f"Hey {safe_name}!" if safe_name else "Hey there!"
    safe_email = html_mod.escape(login_email).replace("@", "&#64;")
    safe_password = html_mod.escape(password)
    safe_url = html_mod.escape(app_url)

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
        {greeting} &#x1F44B;
      </p>
      <p style="margin: 0 0 20px 0; font-size: 15px; color: #374151; line-height: 1.6;">
        We set up a sandbox account just for you to explore MyBookkeeper &mdash;
        your AI-powered bookkeeping assistant.
      </p>

      <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 20px; margin: 0 0 24px 0;">
        <p style="margin: 0 0 14px 0; font-size: 13px; font-weight: 600; color: #166534; text-transform: uppercase; letter-spacing: 0.5px;">
          Your Login Credentials
        </p>
        <div style="margin: 0 0 10px 0; font-size: 14px; color: #6b7280;">
          &#x1F310; <a href="{safe_url}" style="color: #16a34a; text-decoration: underline;">{safe_url}</a>
        </div>
        <p style="margin: 0 0 6px 0; font-size: 12px; color: #6b7280;">Email</p>
        <p style="margin: 0 0 14px 0; padding: 10px 14px; background: #f3f4f6; border-radius: 6px; font-family: 'Courier New', Courier, monospace; font-size: 14px; color: #111827; user-select: all; -webkit-user-select: all;">{safe_email}</p>
        <p style="margin: 0 0 6px 0; font-size: 12px; color: #6b7280;">Password</p>
        <p style="margin: 0; padding: 10px 14px; background: #f3f4f6; border-radius: 6px; font-family: 'Courier New', Courier, monospace; font-size: 14px; color: #111827; user-select: all; -webkit-user-select: all;">{safe_password}</p>
      </div>

      <div style="text-align: center; margin: 0 0 24px 0;">
        <a href="{safe_url}" style="display: inline-block; background: #22c55e; color: #ffffff; text-decoration: none; padding: 12px 32px; border-radius: 8px; font-size: 15px; font-weight: 600; letter-spacing: 0.2px;">
          Log In Now
        </a>
      </div>

      <p style="margin: 0; font-size: 14px; color: #6b7280; line-height: 1.5;">
        This is a demo account with sample data to play around with. Have fun exploring!
        Questions? Just reply to this email.
      </p>
    </div>

    <div style="border-top: 1px solid #e5e7eb; padding: 16px 24px; text-align: center;">
      <p style="margin: 0; font-size: 12px; color: #9ca3af;">
        Sent by MyBookkeeper &bull; AI-powered bookkeeping
      </p>
    </div>

  </div>
</div>"""


def send_demo_invite(
    recipient_email: str,
    display_name: str,
    login_email: str,
    password: str,
    app_url: str,
) -> bool:
    html = _build_invite_html(display_name, login_email, password, app_url)
    subject = "You're invited to try MyBookkeeper! \U0001f389"
    success = email_service.send_email([recipient_email], subject, html)
    if success:
        logger.info("Demo invite sent to %s for account %s", recipient_email, login_email)
    else:
        logger.warning("Failed to send demo invite to %s", recipient_email)
    return success
