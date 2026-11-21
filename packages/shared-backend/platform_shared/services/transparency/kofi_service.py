"""Ko-fi donation webhook: verify, parse, and record.

Ko-fi delivers a webhook as an ``application/x-www-form-urlencoded`` POST
with a SINGLE field named ``data`` whose value is a JSON string. Verified
against Ko-fi's documented contract (help.ko-fi.com "Does Ko-fi have an API
or webhook"): authentication is a STATIC ``verification_token`` embedded in
that JSON — the operator copies it from their Ko-fi webhook settings and we
compare for equality. There is NO HMAC signature header (unlike Stripe /
GitHub); the token IS the shared secret. We compare it in constant time
regardless.

Payload fields we use (others ignored): ``verification_token`` (auth),
``message_id`` (idempotency key — Ko-fi may re-deliver), ``amount`` (decimal
string in the creator's currency), ``currency``, ``type`` (Donation /
Subscription / Commission / Shop Order), ``timestamp`` (when the supporter
paid; decides the month a donation counts toward, so a re-delivery lands on
the same record whenever it arrives).

We count ALL monetary event types toward the break-even total — the
operator's goal is "did supporters cover hosting", so a subscription
payment or shop order counts the same as a one-off donation. The widget
labels the figure "Donations" generically.

Fee note: Ko-fi's webhook reports the GROSS ``amount`` the supporter paid;
it does NOT report the payment-processor (PayPal/Stripe) fee, so there is no
"net" field available to honor. We sum gross ``amount`` and document that —
fabricating a fee deduction would be a made-up number. Ko-fi's own platform
fee is 0% on the free tier.
"""
from __future__ import annotations

import hmac
import json
import logging
from datetime import datetime, timezone
from decimal import ROUND_HALF_UP, Decimal, InvalidOperation
from urllib.parse import parse_qs

from platform_shared.schemas.transparency_donation_record import DonationRecord
from platform_shared.services.transparency import donation_store, transparency_store
from platform_shared.services.transparency.donation_outcome import DonationOutcome
from platform_shared.services.transparency.transparency_store import SharedStorageSettings

logger = logging.getLogger(__name__)


class KofiPayload:
    """Parsed, normalised view of a Ko-fi webhook payload.

    Holds only the fields the transparency feature needs; ``raw`` keeps the
    full decoded dict for logging context without re-parsing.
    """

    def __init__(self, raw: dict) -> None:
        self.raw = raw
        self.verification_token: str = str(raw.get("verification_token") or "")
        self.message_id: str = str(raw.get("message_id") or "")
        self.amount_str: str = str(raw.get("amount") or "")
        self.currency: str = str(raw.get("currency") or "")
        self.type: str = str(raw.get("type") or "")
        self.timestamp: str = str(raw.get("timestamp") or "")

    @property
    def donation_month(self) -> str | None:
        """``"YYYY-MM"`` (UTC) of Ko-fi's ``timestamp``, or ``None`` if absent/unparseable.

        A timestamp without a zone is read as UTC, the zone Ko-fi sends.
        """
        try:
            paid_at = datetime.fromisoformat(self.timestamp)
        except ValueError:
            return None
        if paid_at.tzinfo is None:
            paid_at = paid_at.replace(tzinfo=timezone.utc)
        return transparency_store.month_key(paid_at.astimezone(timezone.utc))

    @property
    def amount_cents(self) -> int:
        """Gross amount in integer cents, or 0 if unparseable / non-positive.

        Ko-fi sends ``amount`` as a decimal string ("5.00", "3", "12.50").
        A blank or malformed value yields 0 (and is logged by the caller) —
        we never raise on a bad amount, so one odd payload can't break the
        webhook for the rest.
        """
        try:
            value = Decimal(self.amount_str)
        except (InvalidOperation, ValueError):
            return 0
        if value <= 0:
            return 0
        # Explicit ROUND_HALF_UP (Decimal defaults to banker's rounding) so cents
        # round the intuitive way and match anthropic_cost_service's rounding.
        return int((value * 100).to_integral_value(rounding=ROUND_HALF_UP))


def parse_kofi_form_body(raw_body: bytes) -> dict | None:
    """Decode a Ko-fi webhook body into its JSON payload dict.

    Ko-fi posts ``data=<url-encoded-json>``. We parse the form body by hand
    (``urllib.parse.parse_qs``) rather than via FastAPI ``Form(...)`` so the
    shared package carries no ``python-multipart`` dependency. Returns
    ``None`` when the body has no ``data`` field or the JSON is invalid.
    """
    try:
        text = raw_body.decode("utf-8")
    except UnicodeDecodeError:
        logger.warning("Ko-fi webhook body was not valid UTF-8")
        return None

    fields = parse_qs(text)
    data_values = fields.get("data")
    if not data_values:
        logger.warning("Ko-fi webhook body missing 'data' field")
        return None

    try:
        payload = json.loads(data_values[0])
    except (json.JSONDecodeError, ValueError):
        logger.warning("Ko-fi webhook 'data' field was not valid JSON")
        return None

    if not isinstance(payload, dict):
        logger.warning("Ko-fi webhook 'data' decoded to a non-object")
        return None
    return payload


def verify_kofi_token(payload: KofiPayload, *, expected_token: str) -> bool:
    """Whether the payload's verification_token matches the configured one.

    Constant-time comparison. An empty ``expected_token`` always fails — an
    app that hasn't been configured as the transparency writer must never
    accept a webhook (the boot guard prevents a production primary app from
    booting with an empty token, so this only rejects on misrouted traffic).
    """
    if not expected_token:
        return False
    return hmac.compare_digest(payload.verification_token, expected_token)


def _already_counted(settings: SharedStorageSettings, month: str, message_id: str) -> bool:
    """Whether this donation was already counted, old-style or as a record.

    ``report.json`` is checked BEFORE the records. The migration writes the
    records first and empties ``report.json`` after, so in this order a
    migration running between the two checks is always seen by one of them.
    The next month is checked too: migrated records are filed by arrival
    month, which can be one month after Ko-fi's timestamp.
    """
    if transparency_store.legacy_report_has_donation(
        transparency_store.load_document(settings), message_id,
    ):
        return True
    return donation_store.donation_exists(settings, month, message_id) or (
        donation_store.donation_exists(settings, donation_store.next_month(month), message_id)
    )


def record_donation(settings: SharedStorageSettings, payload: KofiPayload) -> DonationOutcome:
    """Store a verified donation as its own object, unless already counted.

    - ``RECORDED``: stored.
    - ``DUPLICATE``: already counted (see ``_already_counted``), so a Ko-fi
      re-delivery is a no-op in any month.
    - ``REFUSED``: no ``message_id`` matching ``KOFI_MESSAGE_ID_PATTERN``, or
      no usable ``timestamp``. The record's key needs both; without them a
      re-delivery could not be recognised and would count twice. Logged at
      ERROR, because a real payment is going uncounted.

    A zero/blank-amount event is still stored (it moves no money) so a
    re-delivery of it dedups too. Storage errors propagate, so the webhook
    answers non-2xx and Ko-fi delivers again.
    """
    if not donation_store.is_valid_message_id(payload.message_id):
        logger.error(
            "Ko-fi payment refused, not counted: message_id missing or malformed "
            "(cannot dedup): message_id=%r type=%s amount=%r",
            payload.message_id,
            payload.type,
            payload.amount_str,
        )
        return DonationOutcome.REFUSED

    month = payload.donation_month
    if month is None:
        logger.error(
            "Ko-fi payment refused, not counted: no usable timestamp (cannot dedup): "
            "message_id=%s timestamp=%r amount=%r",
            payload.message_id,
            payload.timestamp,
            payload.amount_str,
        )
        return DonationOutcome.REFUSED

    if _already_counted(settings, month, payload.message_id):
        logger.info(
            "Ko-fi donation already recorded (dedup): message_id=%s type=%s month=%s",
            payload.message_id,
            payload.type,
            month,
        )
        return DonationOutcome.DUPLICATE

    cents = payload.amount_cents
    if cents <= 0:
        logger.warning(
            "Ko-fi donation had no positive amount: message_id=%s amount=%r currency=%s",
            payload.message_id,
            payload.amount_str,
            payload.currency,
        )
    elif payload.currency and payload.currency.upper() != "USD":
        # Costs are tracked in USD cents. A non-USD donation is summed at face
        # value (no FX conversion available) — log it so the operator can spot
        # currency drift rather than silently mixing units.
        logger.warning(
            "Ko-fi donation in non-USD currency summed as USD cents: "
            "message_id=%s amount=%s currency=%s",
            payload.message_id,
            payload.amount_str,
            payload.currency,
        )

    donation_store.write_donation(
        settings,
        DonationRecord(
            message_id=payload.message_id,
            month=month,
            amount_cents=cents,
            currency=payload.currency,
            type=payload.type,
        ),
    )
    logger.info(
        "Ko-fi donation recorded: message_id=%s type=%s amount_cents=%d month=%s",
        payload.message_id,
        payload.type,
        cents,
        month,
    )
    return DonationOutcome.RECORDED


__all__ = [
    "KofiPayload",
    "parse_kofi_form_body",
    "verify_kofi_token",
    "record_donation",
]
