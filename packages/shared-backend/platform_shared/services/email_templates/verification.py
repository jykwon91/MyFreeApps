"""Shared verification-email HTML builder."""
import html as html_mod

from .branding import Branding


def build_verification_html(*, verify_url: str, branding: Branding) -> str:
    """Build the email-verification HTML body branded for the given app.

    The structure (greeting → CTA button → expiry notice → fallback URL →
    footer) is fixed across apps. Only colour, brand name, tagline, and
    footer text vary, all sourced from ``branding``.

    ``verify_url`` is HTML-escaped before substitution; callers may pass
    unescaped URLs.
    """
    safe_url = html_mod.escape(verify_url)
    safe_name = html_mod.escape(branding.app_name)
    safe_tagline = html_mod.escape(branding.tagline)
    safe_footer = _build_footer(branding)

    return f"""\
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f9fafb; padding: 40px 20px;">
  <div style="max-width: 480px; margin: 0 auto; background: #ffffff; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); overflow: hidden;">

    <div style="background: {branding.accent_color}; padding: 28px 24px; text-align: center;">
      <h1 style="margin: 0; color: #ffffff; font-size: 22px; font-weight: 700; letter-spacing: -0.3px;">
        {branding.header_prefix_html}{safe_name}
      </h1>
      <p style="margin: 6px 0 0 0; color: rgba(255,255,255,0.9); font-size: 14px;">
        {safe_tagline}
      </p>
    </div>

    <div style="padding: 28px 24px;">
      <p style="margin: 0 0 16px 0; font-size: 16px; color: #111827; line-height: 1.5;">
        Welcome to {safe_name}!
      </p>
      <p style="margin: 0 0 20px 0; font-size: 15px; color: #374151; line-height: 1.6;">
        Please verify your email address to activate your account. Click the button below to get started.
      </p>

      <div style="text-align: center; margin: 0 0 24px 0;">
        <a href="{safe_url}" style="display: inline-block; background: {branding.accent_color}; color: #ffffff; text-decoration: none; padding: 12px 32px; border-radius: 8px; font-size: 15px; font-weight: 600; letter-spacing: 0.2px;">
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
        Sent by {safe_footer}
      </p>
    </div>

  </div>
</div>"""


def _build_footer(branding: Branding) -> str:
    name = html_mod.escape(branding.app_name)
    if branding.footer_suffix:
        return f"{name} &bull; {html_mod.escape(branding.footer_suffix)}"
    return name
