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

A failure whose outcome is unknown (Twilio answered 5xx, or the connection
broke or timed out after the request may have reached Twilio) is raised with
``outcome_unknown=True``: the text may still have gone out, so the caller must
not resend it without checking Twilio's message log first. Only a failure to
connect at all (DNS, connection refused, connect timeout) is a definite
"not sent". Twilio has no idempotency key for message creation, so there is no
safe automatic retry.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import TYPE_CHECKING

from urllib3.exceptions import ConnectTimeoutError, MaxRetryError

from platform_shared.core.mask_phone_numbers import mask_phone_numbers
from platform_shared.core.sms_constants import (
    SMS_PROVIDER_CODE_NETWORK_ERROR,
    SMS_PROVIDER_CODE_OUTCOME_UNKNOWN,
    TWILIO_HTTP_TIMEOUT_SECONDS,
)
from platform_shared.services.sms_not_configured_error import SmsNotConfiguredError

if TYPE_CHECKING:
    # twilio is an optional import — apps that don't use SMS don't need
    # to install it, and platform_shared.services.sms_service stays
    # importable for type-checking on those apps. The runtime imports
    # happen inside send_or_raise() below.
    from twilio.rest import Client as _TwilioClient

logger = logging.getLogger(__name__)


class SmsSendError(RuntimeError):
    """Raised when an SMS provider rejects a send (invalid number, unsubscribed
    recipient, carrier filtered, etc.). Distinct from SmsNotConfiguredError —
    this is a transient or addressee-specific failure, not a deploy
    misconfiguration. The provider error code is embedded in the message.

    ``code`` is Twilio's numeric error code; ``provider_code`` is the string
    form used by providers whose codes are not numeric (httpSMS reports
    ``http_<status>`` for API rejections). Every sender sets ``status`` to the
    provider's HTTP status when one exists.

    ``outcome_unknown`` is True when the provider may have accepted the text
    even though the send failed (a provider 5xx, a timeout or broken
    connection after the request went out, an accepted request with an
    unreadable reply). The customer may already have it, so callers must never
    resend it automatically, and must tell the operator to check the
    provider's message log before sending it again by hand.
    """

    def __init__(
        self,
        message: str,
        *,
        code: int | None = None,
        status: int | None = None,
        provider_code: str | None = None,
        outcome_unknown: bool = False,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.status = status
        self.provider_code = provider_code
        self.outcome_unknown = outcome_unknown


def _never_reached_twilio(exc: Exception) -> bool:
    """True only when the request provably never left this machine.

    ``requests`` (which the Twilio SDK uses) wraps a failure to open the
    connection as ``ConnectionError`` / ``ConnectTimeout`` around a urllib3
    ``MaxRetryError`` whose reason is a ``ConnectTimeoutError`` (DNS failure
    and connection refused are its subclasses ``NameResolutionError`` and
    ``NewConnectionError``). Only those count as never sent. Anything else,
    including a TLS error (which urllib3 also raises for a connection broken
    after the handshake), stays unknown: wrongly calling it unsent could text
    the tenant twice, while wrongly calling it unknown only asks the operator
    to check first.
    """
    cause = exc.args[0] if exc.args else None
    return isinstance(cause, MaxRetryError) and isinstance(cause.reason, ConnectTimeoutError)


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
            SmsSendError: If the send fails. ``outcome_unknown`` is set when
                Twilio may have accepted the message anyway.
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
        from twilio.http.http_client import TwilioHttpClient
        from twilio.rest import Client

        client: _TwilioClient = Client(
            self.account_sid,
            self.auth_token,
            http_client=TwilioHttpClient(timeout=TWILIO_HTTP_TIMEOUT_SECONDS),
        )
        try:
            msg = client.messages.create(
                to=to,
                from_=self.from_number,
                body=body,
            )
        except TwilioRestException as e:
            # A 5xx means Twilio failed while handling the request, possibly
            # after creating the message; a 4xx is a definite rejection.
            outcome_unknown = (e.status or 0) >= 500
            # Twilio's ``msg`` can quote the recipient ("Invalid 'To' Phone
            # Number: +1..."), so it is never logged and is masked in the
            # error, which callers log and show. The Twilio exception isn't
            # chained (``from None``): a traceback or Sentry event would print
            # its unmasked text and URI. Its code and status are kept here.
            logger.warning(
                "Twilio send failed: code=%s status=%s outcome_unknown=%s body_chars=%d",
                e.code, e.status, outcome_unknown, len(body),
            )
            raise SmsSendError(
                f"Twilio rejected SMS (code={e.code} status={e.status}): "
                f"{mask_phone_numbers(e.msg or '')}",
                code=e.code,
                status=e.status,
                outcome_unknown=outcome_unknown,
            ) from None
        except Exception as e:
            # Network errors, timeouts, malformed responses — not
            # specifically Twilio-codeable but still a send failure. Only a
            # failure to connect is a definite "not sent"; anything after the
            # request may have reached Twilio is an unknown outcome.
            outcome_unknown = not _never_reached_twilio(e)
            logger.warning(
                "Twilio send failed (non-Twilio exception): outcome_unknown=%s "
                "body_chars=%d err_type=%s err=%r",
                outcome_unknown, len(body), type(e).__name__, e,
            )
            if outcome_unknown:
                raise SmsSendError(
                    f"Twilio may have sent the SMS, but did not confirm it: {e}",
                    provider_code=SMS_PROVIDER_CODE_OUTCOME_UNKNOWN,
                    outcome_unknown=True,
                ) from e
            raise SmsSendError(
                f"Twilio unreachable, SMS not sent: {e}",
                provider_code=SMS_PROVIDER_CODE_NETWORK_ERROR,
            ) from e

        logger.info(
            "SMS sent via Twilio: sid=%s body_chars=%d",
            msg.sid, len(body),
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
            logger.warning("Best-effort SMS send failed", exc_info=True)
            return False
