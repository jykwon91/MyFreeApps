"""SMS delivery wrapper for MyPizzaTracker.

Mirrors ``app.services.email.email_sender`` shape — routes through
``platform_shared.services.sms_service.SmsService`` for the live Twilio
backend, or logs to stdout in console mode.

Console mode exists so dev/CI runs don't need a Twilio account; the
operator can still see the rendered SMS body in logs while testing
service-dashboard transitions. The boot guard
(``platform_shared.core.boot_guards.check_sms_configured``) blocks
console mode in production.
"""
import logging

from platform_shared.services.sms_service import (
    SmsNotConfiguredError,
    SmsSendError,
    SmsService,
)

from app.core.config import settings

logger = logging.getLogger(__name__)


def _twilio_service() -> SmsService:
    return SmsService(
        account_sid=settings.twilio_account_sid,
        auth_token=settings.twilio_auth_token,
        from_number=settings.twilio_from_number,
    )


def _log_console_send(to: str, body: str) -> None:
    logger.info(
        "[sms:console] to=%s body_chars=%d body=%r",
        to,
        len(body),
        body,
    )


def send_sms(to: str, body: str) -> bool:
    """Best-effort SMS send. Returns True on success, False on failure.

    Used for the order-ready notification: the order status transition
    is the authoritative record; the SMS is a courtesy. On failure the
    caller logs / surfaces a warning so the operator can text the
    customer manually.
    """
    if not to or not body:
        return False
    if settings.sms_backend == "twilio":
        return _twilio_service().send(to, body)
    _log_console_send(to, body)
    return True


def send_sms_or_raise(to: str, body: str) -> str | None:
    """Fail-loud SMS send. Returns the Twilio SID on success (or None in
    console mode). Raises on any failure.

    Reserved for paths where the SMS is itself the security artifact
    (2FA codes, account-recovery links) — for ready-text alerts use
    ``send_sms`` so a Twilio outage doesn't block the order transition.
    """
    if not to:
        raise ValueError("Recipient phone number cannot be empty")
    if not body:
        raise ValueError("SMS body cannot be empty")
    if settings.sms_backend == "twilio":
        return _twilio_service().send_or_raise(to, body)
    _log_console_send(to, body)
    return None


__all__ = [
    "send_sms",
    "send_sms_or_raise",
    "SmsNotConfiguredError",
    "SmsSendError",
]
