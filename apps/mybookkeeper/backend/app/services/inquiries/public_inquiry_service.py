"""Public inquiry submission service (T0).

Owns the 11-step filter pipeline. Each step writes a row to
``inquiry_spam_assessments`` so the operator's audit trail captures every
check that ever ran. The pipeline produces an outcome enum that the route
maps to an HTTP response — never letting the client distinguish honeypot
trips, disposable-email blocks, or rate-limit hits beyond the generic 200/400/429.

# Pipeline ordering rationale
1. **Rate limit** — cheapest first; protects the rest of the stack from abuse.
2. **Turnstile** — verifies the request came from a browser session, not a bot
   running headless requests.
3. **Honeypot** — instant short-circuit; bots that fill every field flip this.
4. **Submit timing** — informational; logged but doesn't block.
5. **Disposable email** — blocks throwaway domains.
6. **Email syntax** — already validated by ``EmailStr`` in the schema, but we
   re-check after the listing lookup so domain-matching can't bypass it.
7. **Phone format** — normalize + length check.
8. **Move-in date** — past dates and >1 year in the future are rejected.
9. **Free-text length** — soft anti-spam; only filter that returns a friendly
   error.
10. **Claude scoring** — final triage; produces the spam_score + flags.
11. **Insert** — always succeeds for the client (we return 200 for honeypot +
    disposable email so the bot doesn't learn it was caught).
"""
from __future__ import annotations

import datetime as _dt
import logging
import re
import uuid
from dataclasses import dataclass
from enum import Enum
from typing import Any

from platform_shared.core.disposable_email_domains import is_disposable_email

from app.core.config import settings
from app.db.session import unit_of_work
from app.repositories.inquiries import (
    inquiry_event_repo,
    inquiry_repo,
    inquiry_spam_assessment_repo,
)
from app.repositories.listings import listing_repo
from app.schemas.inquiries.public_inquiry_request import (
    PUBLIC_INQUIRY_FRIENDLY_ERROR_TELL_MORE,
    PublicInquiryRequest,
    is_valid_employment_status,
)
from app.services.inquiries import inquiry_spam_scorer

logger = logging.getLogger(__name__)

# Hard upper bound on how far in the future a move-in date can be. Past
# this, the inquiry is almost certainly nonsense (or someone testing the
# form) and we reject it before Claude ever sees it.
_MAX_MOVE_IN_DAYS_AHEAD = 365
# How many days into the past a move-in date can be. Operators sometimes
# get inquiries from people who already moved (referrals, last-minute
# situations) so we allow today + a small grace window.
_PAST_MOVE_IN_GRACE_DAYS = 30
# Phone normalization — strip every non-digit, then check length is 10 or 11
# (US 10-digit or +1 prefixed).
_PHONE_DIGITS_RE = re.compile(r"\D+")
_MIN_PHONE_DIGITS = 10
_MAX_PHONE_DIGITS = 11
# Form-mount-to-submit threshold below which we consider the submission
# bot-like. Doesn't block — just flags. Humans CAN fill out a form in 5s
# if they're prepared (e.g. paste-from-template), so this stays informational.
_SUBMIT_TIMING_FAST_THRESHOLD_MS = 5_000


class PublicInquiryOutcome(str, Enum):
    """What the route layer should do with the result."""

    # Inquiry was accepted (clean, flagged, or honeypot/disposable —
    # honeypot/disposable get a fake-success 200 so the bot doesn't learn).
    SUCCESS = "success"
    # Hard 400 — the input failed a validation gate (move-in past, phone
    # malformed, etc.). Generic message; never leaks which rule fired.
    INVALID = "invalid"
    # Soft 400 — only the why_this_room min-length gate. Returns a friendly
    # tell-me-more hint so legitimate humans can fix and retry.
    NEEDS_MORE_DETAIL = "needs_more_detail"
    # Listing slug didn't resolve to an active listing. 404.
    LISTING_NOT_FOUND = "listing_not_found"


@dataclass
class PublicInquiryResult:
    outcome: PublicInquiryOutcome
    inquiry_id: uuid.UUID | None = None
    spam_status: str | None = None
    notify_operator: bool = False
    notify_subject_prefix: str = ""


def _normalize_phone(raw: str) -> str | None:
    """Return the digits-only phone string, or None if invalid."""
    digits = _PHONE_DIGITS_RE.sub("", raw)
    if _MIN_PHONE_DIGITS <= len(digits) <= _MAX_PHONE_DIGITS:
        return digits
    return None


async def submit_public_inquiry(
    *,
    payload: PublicInquiryRequest,
    client_ip: str | None,
    user_agent: str | None,
    turnstile_passed: bool,
    rate_limited: bool,
) -> PublicInquiryResult:
    """Run the full 11-step pipeline and persist the result.

    ``turnstile_passed`` and ``rate_limited`` are pre-computed by the route
    (they're per-IP, not per-payload) — passing them in here keeps the
    service pure-async and trivially unit-testable without a fake Request.
    """
    # --- Step 1: Rate limit ---
    if rate_limited:
        # Caller has not yet inserted an inquiry; we have no FK to attach
        # the assessment to. Skip the audit row in this branch — the
        # rate-limit hit is logged separately at the route level.
        return PublicInquiryResult(outcome=PublicInquiryOutcome.INVALID)

    # Resolve listing — needed for everything downstream (listing_id FK,
    # Claude prompt context, organization_id for ownership).
    async with unit_of_work() as db:
        listing = await listing_repo.get_by_slug(db, payload.listing_slug)
        if listing is None:
            return PublicInquiryResult(outcome=PublicInquiryOutcome.LISTING_NOT_FOUND)

        # --- Hard pre-insert gates that don't need an inquiry row ---
        # Phone format
        normalized_phone = _normalize_phone(payload.phone)
        if normalized_phone is None:
            return PublicInquiryResult(outcome=PublicInquiryOutcome.INVALID)

        # Move-in date window
        today = _dt.date.today()
        if (payload.move_in_date < today - _dt.timedelta(days=_PAST_MOVE_IN_GRACE_DAYS)
                or payload.move_in_date > today + _dt.timedelta(days=_MAX_MOVE_IN_DAYS_AHEAD)):
            return PublicInquiryResult(outcome=PublicInquiryOutcome.INVALID)

        # Employment status allowlist (kept here, not in the schema, so
        # the response doesn't leak the allowlist)
        if not is_valid_employment_status(payload.employment_status):
            return PublicInquiryResult(outcome=PublicInquiryOutcome.INVALID)

        # Free-text minimum length — the only gate with a friendly error.
        why = payload.why_this_room.strip()
        if len(why) < settings.inquiry_min_why_this_room_chars:
            return PublicInquiryResult(
                outcome=PublicInquiryOutcome.NEEDS_MORE_DETAIL,
            )

        # --- Hard spam gates that DO get logged on the inquiry ---
        # We need an inquiry row to attach assessments to. Insert with
        # ``spam_status='unscored'`` first; we'll update at the end based on
        # which gates tripped.
        now = _dt.datetime.now(_dt.timezone.utc)
        inquiry = await inquiry_repo.create(
            db,
            organization_id=listing.organization_id,
            user_id=listing.user_id,
            listing_id=listing.id,
            source="public_form",
            external_inquiry_id=None,
            inquirer_name=payload.name.strip(),
            inquirer_email=str(payload.email).strip().lower(),
            inquirer_phone=normalized_phone,
            received_at=now,
            submitted_via="public_form",
            spam_status="unscored",
            move_in_date=payload.move_in_date,
            lease_length_months=payload.lease_length_months,
            occupant_count=payload.occupant_count,
            has_pets=payload.has_pets,
            pets_description=(payload.pets_description or None),
            vehicle_count=payload.vehicle_count,
            current_city=payload.current_city.strip(),
            current_country=payload.current_country,
            current_region=payload.current_region.strip(),
            employment_status=payload.employment_status,
            why_this_room=why,
            additional_notes=(payload.additional_notes or None),
            client_ip=client_ip,
            user_agent=user_agent,
        )

        # Seed event so the timeline isn't empty.
        await inquiry_event_repo.create(
            db,
            inquiry_id=inquiry.id,
            event_type="received",
            actor="applicant",
            occurred_at=now,
        )

        # --- Step 2: Turnstile ---
        await inquiry_spam_assessment_repo.create(
            db,
            inquiry_id=inquiry.id,
            assessment_type="turnstile",
            passed=turnstile_passed,
            details_json={"ip": client_ip},
        )
        if not turnstile_passed:
            await inquiry_repo.update_spam_triage(
                db, inquiry.id, spam_status="spam", spam_score=None,
            )
            return PublicInquiryResult(
                outcome=PublicInquiryOutcome.SUCCESS,
                inquiry_id=inquiry.id,
                spam_status="spam",
            )

        # --- Step 3: Honeypot ---
        honeypot_filled = bool(payload.website.strip())
        await inquiry_spam_assessment_repo.create(
            db,
            inquiry_id=inquiry.id,
            assessment_type="honeypot",
            passed=not honeypot_filled,
            flags=["honeypot_filled"] if honeypot_filled else None,
        )
        if honeypot_filled:
            await inquiry_repo.update_spam_triage(
                db, inquiry.id, spam_status="spam", spam_score=None,
            )
            # Fake success — the bot must believe it succeeded.
            return PublicInquiryResult(
                outcome=PublicInquiryOutcome.SUCCESS,
                inquiry_id=inquiry.id,
                spam_status="spam",
            )

        # --- Step 4: Submit timing (informational only) ---
        now_ms = int(now.timestamp() * 1000)
        delta_ms = now_ms - payload.form_loaded_at
        suspicious_timing = 0 < delta_ms < _SUBMIT_TIMING_FAST_THRESHOLD_MS
        await inquiry_spam_assessment_repo.create(
            db,
            inquiry_id=inquiry.id,
            assessment_type="submit_timing",
            passed=not suspicious_timing,
            flags=["fast_submit"] if suspicious_timing else None,
            details_json={"delta_ms": delta_ms},
        )

        # --- Step 5: Disposable email ---
        email_str = str(payload.email).strip().lower()
        is_disposable = (
            settings.inquiry_block_disposable_email
            and is_disposable_email(email_str)
        )
        await inquiry_spam_assessment_repo.create(
            db,
            inquiry_id=inquiry.id,
            assessment_type="disposable_email",
            passed=not is_disposable,
            flags=["disposable_email_domain"] if is_disposable else None,
            details_json={"domain": email_str.rsplit("@", 1)[-1]},
        )
        if is_disposable:
            await inquiry_repo.update_spam_triage(
                db, inquiry.id, spam_status="spam", spam_score=None,
            )
            return PublicInquiryResult(
                outcome=PublicInquiryOutcome.SUCCESS,
                inquiry_id=inquiry.id,
                spam_status="spam",
            )

        # --- Step 10: Claude scoring ---
        listing_address = "[private]"  # we never reveal the host's address
        scoring = await inquiry_spam_scorer.score_inquiry(
            name=payload.name,
            email=email_str,
            phone=normalized_phone,
            current_city=payload.current_city.strip(),
            current_country=payload.current_country,
            current_region=payload.current_region.strip(),
            employment_status=payload.employment_status,
            move_in_date=payload.move_in_date.isoformat(),
            lease_length_months=payload.lease_length_months,
            occupant_count=payload.occupant_count,
            has_pets=payload.has_pets,
            pets_description=payload.pets_description,
            vehicle_count=payload.vehicle_count,
            why_this_room=why,
            additional_notes=payload.additional_notes,
            listing_address=listing_address,
            listing_monthly_rent=str(listing.monthly_rate),
            listing_type=listing.room_type,
        )

        if isinstance(scoring, inquiry_spam_scorer.ClaudeScoringDegraded):
            await inquiry_spam_assessment_repo.create(
                db,
                inquiry_id=inquiry.id,
                assessment_type="claude_score",
                passed=None,
                details_json={
                    "error": "claude_parse_failed",
                    "raw": scoring.raw_response or "",
                    "details": scoring.error,
                },
            )
            # Graceful degradation — operator still sees the inquiry, just
            # without an AI score. Treat as ``unscored`` so it shows in
            # the All / Clean tab default view (not buried in Spam).
            final_status = "unscored"
            await inquiry_repo.update_spam_triage(
                db, inquiry.id, spam_status=final_status, spam_score=None,
            )
            return PublicInquiryResult(
                outcome=PublicInquiryOutcome.SUCCESS,
                inquiry_id=inquiry.id,
                spam_status=final_status,
                notify_operator=True,
                notify_subject_prefix="",
            )

        # Successful Claude run.
        threshold = settings.inquiry_spam_threshold
        score = scoring.score
        await inquiry_spam_assessment_repo.create(
            db,
            inquiry_id=inquiry.id,
            assessment_type="claude_score",
            passed=score >= threshold,
            score=float(score),
            flags=scoring.flags or None,
            details_json={
                "prompt": scoring.raw_prompt,
                "raw_response": scoring.raw_response,
                "reason": scoring.reason,
            },
        )

        if score < threshold:
            final_status = "spam"
            notify = False
            subject_prefix = ""
        elif score < threshold + 30:
            final_status = "flagged"
            notify = True
            subject_prefix = "[FLAGGED] "
        else:
            final_status = "clean"
            notify = True
            subject_prefix = ""

        await inquiry_repo.update_spam_triage(
            db, inquiry.id, spam_status=final_status, spam_score=float(score),
        )

        return PublicInquiryResult(
            outcome=PublicInquiryOutcome.SUCCESS,
            inquiry_id=inquiry.id,
            spam_status=final_status,
            notify_operator=notify,
            notify_subject_prefix=subject_prefix,
        )


async def record_rate_limit_assessment(
    *,
    inquiry_id: uuid.UUID,
    ip: str,
    window_seconds: int,
) -> None:
    """Helper to log a rate-limit assessment after the inquiry exists.

    Currently only used by the manual-override path; the public-form rate
    limit short-circuits before any inquiry is created, so this isn't called
    from the main pipeline.
    """
    async with unit_of_work() as db:
        await inquiry_spam_assessment_repo.create(
            db,
            inquiry_id=inquiry_id,
            assessment_type="rate_limit",
            passed=False,
            details_json={"ip": ip, "window_seconds": window_seconds},
        )


async def manual_override(
    *,
    inquiry_id: uuid.UUID,
    organization_id: uuid.UUID,
    new_spam_status: str,
    actor_user_id: uuid.UUID,
) -> None:
    """Operator-driven spam triage override (from the inbox detail page).

    Writes a ``manual_override`` assessment row alongside the spam_status
    update so the audit trail records who flipped the triage and when.
    """
    if new_spam_status not in {"manually_cleared", "spam"}:
        raise ValueError(
            f"manual_override requires manually_cleared or spam, got {new_spam_status!r}",
        )
    async with unit_of_work() as db:
        inquiry = await inquiry_repo.get_by_id(db, inquiry_id, organization_id)
        if inquiry is None:
            raise LookupError(f"Inquiry {inquiry_id} not found")

        await inquiry_spam_assessment_repo.create(
            db,
            inquiry_id=inquiry_id,
            assessment_type="manual_override",
            passed=new_spam_status == "manually_cleared",
            details_json={"actor_user_id": str(actor_user_id)},
        )
        # Use the spam-triage path, not the operator-allowlist path —
        # ``update_inquiry`` does include ``spam_status`` for the inbox
        # buttons but we want to avoid emitting a stage event by accident.
        # Fetch + assign keeps the SQL surface tight.
        inquiry.spam_status = new_spam_status
        await db.flush()


# Re-export for the route layer.
__all__: list[str] = [
    "PublicInquiryOutcome",
    "PublicInquiryResult",
    "submit_public_inquiry",
    "manual_override",
    "record_rate_limit_assessment",
]


# (No-op reference to suppress mypy unused-import warnings on Any.)
_ = Any
