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
Subscription / Commission / Shop Order), ``timestamp``.

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
from datetime import datetime
from decimal import ROUND_HALF_UP, Decimal, InvalidOperation
from urllib.parse import parse_qs

from platform_shared.schemas.transparency import MonthBucket, TransparencyDocument
from platform_shared.services.transparency import transparency_store

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


def record_donation(
    document: TransparencyDocument,
    payload: KofiPayload,
    now: datetime,
) -> bool:
    """Add a verified donation to the current month, deduped by message_id.

    Returns ``True`` when newly recorded, ``False`` when ignored — either a
    duplicate (already-seen ``message_id``, so a Ko-fi re-delivery is a 200
    no-op) or an event with no ``message_id`` at all (refused, because it can't
    be deduped and a re-delivery would double-count). Mutates ``document`` in
    place. Only a POSITIVE amount bumps ``donations_cents`` + ``updated_at``; a
    zero/blank-amount event is still recorded for dedup but moves no money and
    leaves ``updated_at`` reflecting the last real change.
    """
    if not payload.message_id:
        # Ko-fi always sends message_id; without it we cannot dedup, so a
        # re-delivery would double-count. Refuse rather than risk that.
        logger.warning(
            "Ko-fi donation missing message_id; refusing to count (cannot dedup): "
            "type=%s amount=%r",
            payload.type,
            payload.amount_str,
        )
        return False

    bucket: MonthBucket = transparency_store.get_or_create_bucket(document, now)

    if payload.message_id in bucket.donation_message_ids:
        logger.info(
            "Ko-fi donation already recorded (dedup): message_id=%s type=%s",
            payload.message_id,
            payload.type,
        )
        return False

    # Record the id up front so any re-delivery (even of a zero/odd event) dedups.
    bucket.donation_message_ids.append(payload.message_id)

    cents = payload.amount_cents
    if cents <= 0:
        # Verified but no usable amount — deduped above, but move no money and
        # don't bump updated_at. Log so a malformed amount is visible.
        logger.warning(
            "Ko-fi donation had no positive amount: message_id=%s amount=%r currency=%s",
            payload.message_id,
            payload.amount_str,
            payload.currency,
        )
        return True

    if payload.currency and payload.currency.upper() != "USD":
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

    bucket.donations_cents += cents
    document.updated_at = now.isoformat()

    logger.info(
        "Ko-fi donation recorded: message_id=%s type=%s amount_cents=%d month=%s total_cents=%d",
        payload.message_id,
        payload.type,
        cents,
        transparency_store.month_key(now),
        bucket.donations_cents,
    )
    return True


__all__ = [
    "KofiPayload",
    "parse_kofi_form_body",
    "verify_kofi_token",
    "record_donation",
]
