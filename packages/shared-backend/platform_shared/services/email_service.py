"""SMTP email service with configurable branding.

Usage:
    mailer = EmailService(
        smtp_host="smtp.gmail.com", smtp_port=587,
        smtp_user="user@gmail.com", smtp_password="...",
        from_name="MyApp",
    )
    mailer.send(["admin@example.com"], "Subject", "<h1>Body</h1>")
"""
import logging
import smtplib
import ssl
from dataclasses import dataclass
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

logger = logging.getLogger(__name__)


@dataclass
class EmailService:
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    from_name: str = ""

    def is_configured(self) -> bool:
        return bool(self.smtp_user and self.smtp_password)

    def send(self, to: list[str], subject: str, body_html: str) -> bool:
        if not to or not self.is_configured():
            return False

        msg = MIMEMultipart("alternative")
        msg["From"] = f"{self.from_name} <{self.smtp_user}>"
        msg["To"] = ", ".join(to)
        msg["Subject"] = subject
        msg.attach(MIMEText(body_html, "html"))

        try:
            with smtplib.SMTP(self.smtp_host, self.smtp_port) as server:
                server.starttls(context=ssl.create_default_context())
                server.login(self.smtp_user, self.smtp_password)
                server.sendmail(self.smtp_user, to, msg.as_string())
            logger.info("Email sent via SMTP to %s: %s", to, subject)
            return True
        except Exception:
            logger.warning("Failed to send email via SMTP to %s", to, exc_info=True)
            return False
