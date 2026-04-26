"""Organization invite email template and sender."""

import html as html_mod
import logging

from app.core.config import settings
from app.services.system import email_service

logger = logging.getLogger(__name__)


def _build_invite_html(
    org_name: str,
    org_role: str,
    inviter_name: str,
    accept_url: str,
) -> str:
    safe_org = html_mod.escape(org_name)
    safe_role = html_mod.escape(org_role.capitalize())
    safe_inviter = html_mod.escape(inviter_name)
    safe_url = html_mod.escape(accept_url)

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
        You've been invited! &#x1F389;
      </p>
      <p style="margin: 0 0 20px 0; font-size: 15px; color: #374151; line-height: 1.6;">
        <strong>{safe_inviter}</strong> has invited you to join
        <strong>{safe_org}</strong> on MyBookkeeper as a <strong>{safe_role}</strong>.
      </p>

      <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 20px; margin: 0 0 24px 0;">
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="padding: 8px 12px 8px 0; font-size: 14px; color: #6b7280; width: 110px; vertical-align: top;">
              Organization
            </td>
            <td style="padding: 8px 0; font-size: 14px; color: #111827; font-weight: 500;">
              {safe_org}
            </td>
          </tr>
          <tr>
            <td style="padding: 8px 12px 8px 0; font-size: 14px; color: #6b7280; vertical-align: top;">
              Your Role
            </td>
            <td style="padding: 8px 0; font-size: 14px; color: #111827; font-weight: 500;">
              {safe_role}
            </td>
          </tr>
          <tr>
            <td style="padding: 8px 12px 8px 0; font-size: 14px; color: #6b7280; vertical-align: top;">
              Invited by
            </td>
            <td style="padding: 8px 0; font-size: 14px; color: #111827; font-weight: 500;">
              {safe_inviter}
            </td>
          </tr>
        </table>
      </div>

      <div style="text-align: center; margin: 0 0 24px 0;">
        <a href="{safe_url}" style="display: inline-block; background: #22c55e; color: #ffffff; text-decoration: none; padding: 12px 32px; border-radius: 8px; font-size: 15px; font-weight: 600; letter-spacing: 0.2px;">
          Accept Invite
        </a>
      </div>

      <p style="margin: 0 0 8px 0; font-size: 14px; color: #6b7280; line-height: 1.5;">
        Don't have an account yet? No worries &mdash; you'll be able to create one after clicking the link above.
      </p>
      <p style="margin: 0; font-size: 13px; color: #9ca3af; line-height: 1.5;">
        This invite expires in 7 days. If you didn't expect this, you can safely ignore this email.
      </p>
    </div>

    <div style="border-top: 1px solid #e5e7eb; padding: 16px 24px; text-align: center;">
      <p style="margin: 0; font-size: 12px; color: #9ca3af;">
        Sent by MyBookkeeper &bull; AI-powered bookkeeping
      </p>
    </div>

  </div>
</div>"""


def send_invite_email(
    recipient_email: str,
    org_name: str,
    org_role: str,
    inviter_name: str,
    invite_token: str,
) -> bool:
    base_url = settings.frontend_url.rstrip("/")
    accept_url = f"{base_url}/invite/{invite_token}"
    html = _build_invite_html(org_name, org_role, inviter_name, accept_url)
    subject = f"You've been invited to join {org_name} on MyBookkeeper"
    success = email_service.send_email([recipient_email], subject, html)
    if success:
        logger.info(
            "Organization invite email sent to %s for org %s",
            recipient_email, org_name,
        )
    else:
        logger.warning(
            "Failed to send organization invite email to %s for org %s",
            recipient_email, org_name,
        )
    return success
