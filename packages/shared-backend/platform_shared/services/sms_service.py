"""Twilio SMS service.

Usage:
    sms = SmsService(
        account_sid="AC...",
        auth_token="...",
        from_number="+15551234567",
    )

    # Critical-path SMS (account-recovery 2FA, order-ready alerts where
    # the customer is waiting in person) — caller MUST know if delivery
    # failed:
    sid = sms.send_or_raise("+15559876543", "Your pizza is ready!")

    # Best-effort SMS (engagement nudges, marketing) — caller continues
    # on failure:
    ok = sms.send("+15559876543", "Tomorrow's drop opens at 11am.")

Twilio's REST API returns structured error codes
(https://www.twilio.com/docs/api/errors) on failure. Per
rules/check-third-party-error-codes.md, we capture the code on every
failure and log it at WARNING with structured kwargs so Sentry/log
aggregators can group failures by reason. Common codes operators will
see:

    21211  invalid To phone number
    21408  permission to send SMS to this region not enabled
    21610  recipient has unsubscribed (STOP)
    21614  To phone is not SMS-capable
    30001  Twilio queue overflow
    30003  unreachable destination handset
    30005  unknown destination handset
    30007  carrier filtered (spam blocker)

The body of ``SmsSendError`` embeds the Twilio code + status so callers
that re-raise via HTTP can surface a useful message in their 4xx body
without needing to import the Twilio SDK exception types.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    # twilio is an optional import — apps that don't use SMS don't need
    # to install it, and platform_shared.services.sms_service stays
    # importable for type-checking on those apps. The runtime imports
    # happen inside send_or_raise() below.
    from twilio.rest import Client as _TwilioClient

logger = logging.getLogger(__name__)


class SmsNotConfiguredError(RuntimeError):
    """Raised when Twilio credentials are missing.

    Use platform_shared.core.boot_guards.check_sms_configured() at
    lifespan startup so deploys fail loud instead of operators silently
    losing every ready-text in production.
    """


class SmsSendError(RuntimeError):
    """Raised when Twilio rejects a send (invalid number, unsubscribed
    recipient, carrier filtered, etc.). Distinct from SmsNotConfiguredError —
    this is a transient or addressee-specific failure, not a deploy
    misconfiguration. The Twilio error code is embedded in the message.
    """

    def __init__(self, message: str, *, code: int | None = None, status: int | None = None) -> None:
        super().__init__(message)
        self.code = code
        self.status = status


@dataclass
class SmsService:
    account_sid: str = ""
    auth_token: str = ""
    from_number: str = ""

    def is_configured(self) -> bool:
        return bool(self.account_sid and self.auth_token and self.from_number)

    def send_or_raise(self, to: str, body: str) -> str:
        """Send the SMS, raising on any failure.

        Returns:
            Twilio message SID on success.

        Raises:
            ValueError: If ``to`` or ``body`` is empty.
            SmsNotConfiguredError: If Twilio creds are missing.
            SmsSendError: If Twilio rejects the send.
        """
        if not to:
            raise ValueError("Recipient phone number cannot be empty")
        if not body:
            raise ValueError("SMS body cannot be empty")
        if not self.is_configured():
            raise SmsNotConfiguredError(
                "Twilio credentials are not configured (TWILIO_ACCOUNT_SID / "
                "TWILIO_AUTH_TOKEN / TWILIO_FROM_NUMBER). The platform_shared."
                "core.boot_guards.check_sms_configured() guard should have caught "
                "this at lifespan startup — investigate why the runtime SmsService "
                "instance has empty creds."
            )

        # Imports happen lazily so the twilio package is only required
        # by apps that actually use SMS.
        from twilio.base.exceptions import TwilioRestException
        from twilio.rest import Client

        client: _TwilioClient = Client(self.account_sid, self.auth_token)
        try:
            msg = client.messages.create(
                to=to,
                from_=self.from_number,
                body=body,
            )
        except TwilioRestException as e:
            logger.warning(
                "Twilio send failed: code=%s status=%s to=%s body_chars=%d msg=%s",
                e.code, e.status, to, len(body), e.msg,
            )
            raise SmsSendError(
                f"Twilio rejected SMS (code={e.code} status={e.status}): {e.msg}",
                code=e.code,
                status=e.status,
            ) from e
        except Exception as e:
            # Network errors, timeouts, malformed responses — not
            # specifically Twilio-codeable but still a send failure.
            logger.warning(
                "Twilio send failed (non-Twilio exception): to=%s body_chars=%d err=%r",
                to, len(body), e,
            )
            raise SmsSendError(f"Twilio send failed: {e}") from e

        logger.info(
            "SMS sent via Twilio: sid=%s to=%s body_chars=%d",
            msg.sid, to, len(body),
        )
        return msg.sid

    def send(self, to: str, body: str) -> bool:
        """Best-effort send. Returns True on success, False on failure.

        Use for non-critical SMS where the operator has another recovery
        path. Critical-path callers (e.g. account-recovery 2FA) MUST use
        send_or_raise() so the failure propagates to the HTTP response.
        """
        try:
            self.send_or_raise(to, body)
            return True
        except (ValueError, SmsNotConfiguredError, SmsSendError):
            logger.warning(
                "Best-effort SMS send failed to %s",
                to,
                exc_info=True,
            )
            return False
