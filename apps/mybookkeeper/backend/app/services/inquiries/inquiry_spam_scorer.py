"""Claude-based spam / scam scoring for public inquiry submissions (T0).

Used by step 10 of the filter pipeline. Returns a (score, flags, reason)
tuple plus the prompt + raw response for the audit trail. PII redaction
happens here (NOT at the route layer) so the service is the single seam
that determines what reaches Claude.

# Cost envelope
Claude Haiku at ~500 input + 200 output tokens per call ≈ $0.0003 each.
1000 inquiries / month ≈ $0.30. Negligible.

# Failure mode
Anthropic API failures (status errors, connection errors/timeouts) and
unparseable responses return a ``ClaudeScoringDegraded`` outcome carrying
Anthropic's ``error.type`` and HTTP status — the caller stores
``spam_status='unscored'`` and lets the inquiry through to the operator. We
never block legitimate prospects because a third-party API was down. The
shared classifier logs every failure (ERROR for credential, not-found and
upstream faults; WARNING for rate limits and rejected input) so a dead model
id or revoked key is visible, not silently degraded. Any other exception is a
bug and propagates.
"""
from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass

import anthropic
from anthropic import Timeout
from platform_shared.extraction import (
    map_anthropic_connection_error,
    map_anthropic_status_error,
)

from app.core.config import settings

logger = logging.getLogger(__name__)

# The model is ``settings.inquiry_spam_model`` (Haiku-class: the triage task is
# simple enough that Sonnet is overkill).
CLAUDE_MAX_TOKENS = 200
CLAUDE_CONNECT_TIMEOUT_S = 5.0
PARSE_FAILED_ERROR_TYPE = "claude_parse_failed"
LOG_PREFIX = "inquiry spam scoring"

# One client for the process (one connection pool, not one per public
# submission). ``max_retries=0``: a failed call degrades to ``unscored``, so
# the SDK's default retries would only stretch an unauthenticated request.
_client = anthropic.AsyncAnthropic(
    api_key=settings.anthropic_api_key,
    max_retries=0,
    timeout=Timeout(settings.inquiry_spam_timeout_seconds, connect=CLAUDE_CONNECT_TIMEOUT_S),
)

# PII redaction patterns. Run BEFORE the prompt is sent to Claude so the
# operator's audit trail in ``inquiry_spam_assessments.details_json`` doesn't
# accumulate plaintext PII. Phone covers US 10-digit, US E.164, and most
# international formats (8-15 digits with optional separators).
#
# Both patterns open with a negative lookbehind that pins a match to the START
# of a run of candidate characters. Without it, a long run that never completes
# a match (2 000 ``%`` with no ``@``) is retried from every offset in the run,
# making redaction quadratic in the field length — a polynomial-ReDoS handle on
# an unauthenticated public-inquiry form. The lookbehind makes every non-start
# offset fail in constant time, which is linear overall (measured: 62 ms -> 0.1
# ms on a 10 000-char adversarial input) and leaves the matched set unchanged.
#
# The e-mail domain is spelled ``(?:label\.)+tld`` rather than
# ``[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}`` so the dot belongs to exactly one place in
# the grammar; the original let ``.`` match either inside the class or as the
# literal separator, which is the same backtracking amplifier one level down.
#
# Every quantifier is bounded. The lookbehind is what makes the scan linear in
# practice, but static analysis reasons about the pattern in isolation and
# cannot see it, so the bounds carry the proof: worst-case work per start
# position is a constant, not a function of input length. The limits sit far
# above anything RFC 5321/1035 permits (64-char local part, 63-char labels), so
# no address that the previous pattern redacted stops being redacted -- verified
# against a parity set before the change.
_EMAIL_RE = re.compile(
    r"(?<![a-zA-Z0-9._%+-])[a-zA-Z0-9._%+-]{1,256}"
    r"@(?:[a-zA-Z0-9-]{1,63}\.){1,16}[a-zA-Z]{2,63}"
)
_PHONE_RE = re.compile(r"(?<![\d+])(?:\+?\d[\s().-]?){8,15}")


@dataclass
class ClaudeScoringResult:
    """Successful Claude scoring outcome."""
    score: int
    reason: str
    flags: list[str]
    raw_prompt: str
    raw_response: str


@dataclass
class ClaudeScoringDegraded:
    """Claude scoring failed — caller treats this as ``spam_status='unscored'``.

    ``error_type`` is Anthropic's ``error.type`` (``not_found_error``,
    ``authentication_error``...), ``http_<status>``, ``connection_error`` or
    ``claude_parse_failed``; ``status`` is the HTTP status when there was one.
    """
    error_type: str
    status: int | None
    raw_prompt: str
    raw_response: str | None


def _redact(text: str | None) -> str:
    if not text:
        return ""
    redacted = _EMAIL_RE.sub("[redacted-email]", text)
    redacted = _PHONE_RE.sub("[redacted-phone]", redacted)
    return redacted


def _build_prompt(
    *,
    name: str,
    email: str,
    phone: str,
    current_city: str,
    current_country: str,
    current_region: str,
    employment_status: str,
    move_in_date: str,
    move_out_date: str,
    occupant_count: int,
    has_pets: bool,
    pets_description: str | None,
    vehicle_count: int,
    why_this_room: str,
    additional_notes: str | None,
    listing_address: str,
    listing_monthly_rent: str,
    listing_type: str,
) -> str:
    """Assemble the user-facing prompt. PII redacted for the audit trail."""
    pets_line = (
        f"yes — {_redact(pets_description) or '(no description)'}"
        if has_pets else "no"
    )
    notes_line = _redact(additional_notes) if additional_notes else "(none)"
    return (
        "You are filtering rental inquiries for a residential landlord. "
        "Given the inquiry text, return ONLY a JSON object (no other text) "
        "with this shape:\n\n"
        "{\n"
        '  "score": <integer 0-100 where 100 is most legitimate, 0 is most likely spam/scam>,\n'
        '  "reason": "<one-sentence explanation>",\n'
        '  "flags": ["..."]  // subset of: ["very_short_message", "no_specifics", '
        '"scam_phrasing", "automated_template", "international_relay", '
        '"non_english_with_translate", "unrealistic_offer", "pressure_tactics", '
        '"vague_movein", "fake_employment", "duplicate_template"]\n'
        "}\n\n"
        f"Listing context:\n"
        f"- Address: {listing_address}\n"
        f"- Monthly rent: ${listing_monthly_rent}\n"
        f"- Listing type: {listing_type}\n\n"
        f"Inquiry:\n"
        f"- Name: [redacted-name]\n"
        f"- Email: [redacted-email]\n"
        f"- Phone: [redacted-phone]\n"
        f"- Current location: {current_city}, {current_region}, {current_country}\n"
        f"- Employment: {employment_status}\n"
        f"- Move-in: {move_in_date}\n"
        f"- Move-out: {move_out_date}\n"
        f"- Occupants: {occupant_count}\n"
        f"- Pets: {pets_line}\n"
        f"- Vehicles: {vehicle_count}\n"
        f"- Why this room: {_redact(why_this_room)}\n"
        f"- Additional notes: {notes_line}\n"
    )
    # Note: ``name``, ``email``, ``phone`` are accepted as parameters so the
    # caller can pre-redact and store them under ``EncryptedString``, but the
    # prompt itself never sees them (placeholders are hard-coded).
    _ = (name, email, phone)


def _parse_response(raw: str) -> tuple[int, str, list[str]]:
    """Strict-parse the Claude JSON response. Raises ValueError on bad shape."""
    text = raw.strip()
    # Tolerate the same ```json … ``` fencing the existing extractor handles.
    if "```" in text:
        for chunk in text.split("```")[1::2]:
            inner = chunk.strip()
            if inner.startswith("json"):
                inner = inner[4:].strip()
            if inner.startswith("{"):
                text = inner
                break
    parsed = json.loads(text)
    score_raw = parsed["score"]
    score = int(score_raw)
    if not 0 <= score <= 100:
        raise ValueError(f"score out of range: {score}")
    reason_value = parsed.get("reason", "")
    reason = str(reason_value)[:500]
    flags_value = parsed.get("flags", [])
    if not isinstance(flags_value, list):
        flags_value = []
    flags = [str(f) for f in flags_value][:20]
    return score, reason, flags


async def score_inquiry(
    *,
    name: str,
    email: str,
    phone: str,
    current_city: str,
    current_country: str,
    current_region: str,
    employment_status: str,
    move_in_date: str,
    move_out_date: str,
    occupant_count: int,
    has_pets: bool,
    pets_description: str | None,
    vehicle_count: int,
    why_this_room: str,
    additional_notes: str | None,
    listing_address: str,
    listing_monthly_rent: str,
    listing_type: str,
    client: anthropic.AsyncAnthropic | None = None,
) -> ClaudeScoringResult | ClaudeScoringDegraded:
    """Run Claude triage. Returns a degraded outcome for API/parse failures."""
    prompt = _build_prompt(
        name=name,
        email=email,
        phone=phone,
        current_city=current_city,
        current_country=current_country,
        current_region=current_region,
        employment_status=employment_status,
        move_in_date=move_in_date,
        move_out_date=move_out_date,
        occupant_count=occupant_count,
        has_pets=has_pets,
        pets_description=pets_description,
        vehicle_count=vehicle_count,
        why_this_room=why_this_room,
        additional_notes=additional_notes,
        listing_address=listing_address,
        listing_monthly_rent=listing_monthly_rent,
        listing_type=listing_type,
    )

    api_client = client or _client

    raw_response: str | None = None
    try:
        message = await api_client.messages.create(
            model=settings.inquiry_spam_model,
            max_tokens=CLAUDE_MAX_TOKENS,
            messages=[{"role": "user", "content": prompt}],
        )
        raw_response = message.content[0].text if message.content else ""
        score, reason, flags = _parse_response(raw_response)
    except anthropic.APIStatusError as exc:
        failure = map_anthropic_status_error(exc, log_prefix=LOG_PREFIX, logger=logger)
        return ClaudeScoringDegraded(
            error_type=failure.error_type,
            status=failure.status,
            raw_prompt=prompt,
            raw_response=None,
        )
    except anthropic.APIConnectionError as exc:
        failure = map_anthropic_connection_error(exc, log_prefix=LOG_PREFIX, logger=logger)
        return ClaudeScoringDegraded(
            error_type=failure.error_type,
            status=None,
            raw_prompt=prompt,
            raw_response=None,
        )
    except (ValueError, KeyError, TypeError) as exc:
        logger.warning(
            "%s: response not parseable: %s", LOG_PREFIX, type(exc).__name__,
        )
        return ClaudeScoringDegraded(
            error_type=PARSE_FAILED_ERROR_TYPE,
            status=None,
            raw_prompt=prompt,
            raw_response=raw_response,
        )
    return ClaudeScoringResult(
        score=score,
        reason=reason,
        flags=flags,
        raw_prompt=prompt,
        raw_response=raw_response,
    )
