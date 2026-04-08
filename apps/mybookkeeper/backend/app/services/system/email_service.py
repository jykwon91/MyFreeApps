"""Email service using Gmail SMTP."""

import html as html_mod
import logging
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from app.core.config import settings

logger = logging.getLogger(__name__)


def _smtp_configured() -> bool:
    return bool(settings.smtp_user and settings.smtp_password)


def is_configured() -> bool:
    return _smtp_configured()


def get_recipients() -> list[str]:
    raw = settings.cost_alert_recipients.strip()
    if not raw:
        return []
    return [addr.strip() for addr in raw.split(",") if addr.strip()]


def _send_via_smtp(to: list[str], subject: str, body_html: str) -> bool:
    msg = MIMEMultipart("alternative")
    msg["From"] = f"{settings.email_from_name} <{settings.smtp_user}>"
    msg["To"] = ", ".join(to)
    msg["Subject"] = subject
    msg.attach(MIMEText(body_html, "html"))

    try:
        with smtplib.SMTP(settings.smtp_host, settings.smtp_port) as server:
            server.starttls()
            server.login(settings.smtp_user, settings.smtp_password)
            server.sendmail(settings.smtp_user, to, msg.as_string())
        logger.info("Email sent via SMTP to %s: %s", to, subject)
        return True
    except Exception:
        logger.warning("Failed to send email via SMTP to %s", to, exc_info=True)
        return False


def send_email(to: list[str], subject: str, body_html: str) -> bool:
    if not to:
        return False

    if _smtp_configured():
        return _send_via_smtp(to, subject, body_html)

    logger.warning("No email service configured (set SMTP_USER and SMTP_PASSWORD)")
    return False


def send_cost_alert(severity: str, message: str, cost: float, budget: float) -> bool:
    recipients = get_recipients()
    if not recipients:
        return False

    color = "#dc2626" if severity == "critical" else "#f59e0b"
    label = "CRITICAL" if severity == "critical" else "WARNING"

    html = f"""
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 480px; margin: 0 auto;">
      <div style="background: {color}; color: white; padding: 16px 20px; border-radius: 8px 8px 0 0;">
        <h2 style="margin: 0; font-size: 18px;">Cost Alert — {label}</h2>
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

    return send_email(recipients, f"[MyBookkeeper] Cost Alert — {label}", html)


def send_test_email(to: str) -> bool:
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
    return send_email([to], "[MyBookkeeper] Email Test — Success", html)
