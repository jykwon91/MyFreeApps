"""Platform-invite email template + sender.

Mirrors the shape of MBK's organization invite email — same outer
container, same blue/white palette MJH already uses for verification
emails — but pitched at a platform-level "you've been invited to
join MyJobHunter" instead of an org-membership scope.

The link target is ``${frontend_url}/register?invite=<token>``. The
register page reads the ``invite`` query param, fetches
``GET /invites/{token}/info`` for the preview, and pre-binds the email
field on the registration form.

Security note (2026-05-05): ``html.escape(..., quote=True)`` escapes
``"`` so the URL cannot break out of the ``href="..."`` attribute. The
current token shape (``secrets.token_urlsafe``) emits no quote chars,
so this is defense-in-depth — but the function is reusable and the
``frontend_url`` portion is operator-controlled, so a future preview-
deploy with a domain that happened to embed quote-equivalent chars
would otherwise break out of the attribute and inject markup.
"""
from __future__ import annotations

import html as html_mod
import logging

from app.core.config import settings
from app.services.email.email_sender import send_email_or_raise

logger = logging.getLogger(__name__)


def _build_invite_html(accept_url: str) -> str:
    safe_url = html_mod.escape(accept_url, quote=True)

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
        You've been invited to MyJobHunter.
      </p>
      <p style="margin: 0 0 20px 0; font-size: 15px; color: #374151; line-height: 1.6;">
        Click the button below to create your account. The invite is tied to this
        email address.
      </p>

      <div style="text-align: center; margin: 0 0 24px 0;">
        <a href="{safe_url}" style="display: inline-block; background: #2563eb; color: #ffffff; text-decoration: none; padding: 12px 32px; border-radius: 8px; font-size: 15px; font-weight: 600; letter-spacing: 0.2px;">
          Accept Invite
        </a>
      </div>

      <p style="margin: 0 0 8px 0; font-size: 14px; color: #6b7280; line-height: 1.5;">
        This invite expires in 7 days and can only be used once. If you
        didn't expect this email, you can safely ignore it.
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


def send_invite_email(recipient_email: str, token: str) -> None:
    """Send the invite email with a tokenized accept link.

    Critical-path transactional email — uses ``send_email_or_raise`` so a
    failure propagates to the calling HTTP handler. The admin will see the
    5xx and can retry; we never silently log-and-forget the way the
    pre-2026-05-05 verification email did.

    Console mode (``email_backend == "console"``) logs to stdout instead
    of sending — fine for dev/CI. The boot guard
    ``check_email_configured`` already catches the misconfigured-prod
    case at lifespan startup, so a runtime failure here means a transient
    SMTP problem, not a deployment bug.
    """
    base_url = settings.frontend_url.rstrip("/")
    accept_url = f"{base_url}/register?invite={token}"
    html = _build_invite_html(accept_url)
    subject = "You've been invited to MyJobHunter"
    send_email_or_raise([recipient_email], subject, html)
    # Log only the email domain, never the full address. The recipient
    # is by definition not yet a user, so per the auth-events policy
    # for unknown-user events we keep PII out of operator logs.
    _, _, domain = recipient_email.rpartition("@")
    logger.info(
        "Platform invite email sent domain=%s",
        (domain or "unknown").strip().lower(),
    )
