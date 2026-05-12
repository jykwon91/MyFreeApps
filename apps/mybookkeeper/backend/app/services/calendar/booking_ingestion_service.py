"""Booking ingestion service — route a parsed booking email to the right outcome.

Decision matrix (see project memory: project_mbk_calendar_email_review_queue.md):

  1. Not a booking email (parse result is_booking=False)
       → action="not_a_booking". Caller continues to Claude invoice path.

  2. Booking detected but channel / listing ID can't be extracted
       → action="unparseable". Log WARNING for visibility. Caller may still
         try Claude, but the parse failure is surfaced in Sentry.

  3. Listing is on the blocklist for this user
       → action="blocked". Drop silently (DEBUG log). Do not call Claude.

  4. Matching channel_listing found in this org
       → Create (or idempotently update) a listing_blackout with the parsed
         dates + a host_notes summary. Return action="auto_matched".

  5. No matching channel_listing
       → Insert into the review queue (idempotent on email_message_id).
         Return action="queued_for_review".

This service does NOT swallow exceptions. Any unexpected failure is logged
with exc_info=True and re-raised so the email extraction service can mark
the queue item as failed and move on.
"""
from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass
from typing import Literal

from app.core.context import RequestContext
from app.db.session import unit_of_work
from app.repositories.calendar import blocklist_repo, review_queue_repo
from app.repositories.listings import channel_listing_repo, listing_blackout_repo
from app.services.email.booking_parser import BookingParseResult, parse_booking_email

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Result type
# ---------------------------------------------------------------------------

IngestionAction = Literal[
    "not_a_booking",
    "unparseable",
    "blocked",
    "auto_matched",
    "queued_for_review",
]


@dataclass(frozen=True, slots=True)
class IngestionResult:
    """Outcome of processing one candidate booking email."""

    action: IngestionAction
    listing_id: uuid.UUID | None = None
    blackout_id: uuid.UUID | None = None
    queue_item_id: uuid.UUID | None = None


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


async def ingest_booking_email(
    *,
    ctx: RequestContext,
    email_message_id: str,
    from_address: str | None,
    subject: str,
    body: str,
) -> IngestionResult:
    """Attempt to classify and route one email as a booking confirmation.

    The caller should check ``result.action`` to decide what to do next:
    - ``not_a_booking`` / ``unparseable`` → fall through to Claude invoice path
    - ``blocked`` / ``auto_matched`` / ``queued_for_review`` → skip Claude

    Raises:
        Any unexpected exception from the DB layer — logged with exc_info=True
        and re-raised so the caller can mark the queue item as failed.
    """
    parse_result = parse_booking_email(
        from_address=from_address,
        subject=subject,
        body=body,
    )

    if not parse_result.is_booking:
        return IngestionResult(action="not_a_booking")

    if parse_result.source_channel is None or parse_result.source_listing_id is None:
        logger.warning(
            "Booking-looking email could not be fully parsed: "
            "email_message_id=%r source_channel=%r source_listing_id=%r subject=%r",
            email_message_id,
            parse_result.source_channel,
            parse_result.source_listing_id,
            subject,
        )
        return IngestionResult(action="unparseable")

    try:
        return await _route_parsed_booking(
            ctx=ctx,
            email_message_id=email_message_id,
            parse_result=parse_result,
        )
    except Exception:
        logger.warning(
            "Failed to ingest booking email: email_message_id=%r "
            "channel=%r listing_id=%r",
            email_message_id,
            parse_result.source_channel,
            parse_result.source_listing_id,
            exc_info=True,
        )
        raise


# ---------------------------------------------------------------------------
# Internal routing
# ---------------------------------------------------------------------------


async def _route_parsed_booking(
    *,
    ctx: RequestContext,
    email_message_id: str,
    parse_result: BookingParseResult,
) -> IngestionResult:
    """Apply the decision matrix to a fully-parsed booking email."""
    source_channel: str = parse_result.source_channel  # type: ignore[assignment]  # already checked non-None
    source_listing_id: str = parse_result.source_listing_id  # type: ignore[assignment]

    async with unit_of_work() as db:
        # Step 1: blocklist check
        blocked = await blocklist_repo.is_blocked(
            db,
            user_id=ctx.user_id,
            source_channel=source_channel,
            source_listing_id=source_listing_id,
        )
        if blocked:
            logger.debug(
                "Booking email blocked: email_message_id=%r channel=%r listing_id=%r",
                email_message_id,
                source_channel,
                source_listing_id,
            )
            return IngestionResult(action="blocked")

        # Step 2: channel_listing match
        channel_listing = await channel_listing_repo.get_by_org_channel_external_id(
            db,
            organization_id=ctx.organization_id,
            channel_id=source_channel,
            external_id=source_listing_id,
        )

        if channel_listing is not None:
            # Auto-match path: create/update a listing_blackout.
            blackout = await listing_blackout_repo.upsert_by_uid(
                db,
                listing_id=channel_listing.listing_id,
                source=source_channel,
                source_event_id=email_message_id,
                starts_on=parse_result.check_in,
                ends_on=parse_result.check_out,
            )
            # Write host_notes only on INSERT (source_event_id was just set),
            # so we don't stomp over any existing annotation from a prior match.
            if blackout.host_notes is None:
                blackout.host_notes = _build_host_notes(parse_result)
            await db.commit()
            await db.refresh(blackout)
            logger.debug(
                "Booking auto-matched: email_message_id=%r listing_id=%s blackout_id=%s",
                email_message_id,
                channel_listing.listing_id,
                blackout.id,
            )
            return IngestionResult(
                action="auto_matched",
                listing_id=channel_listing.listing_id,
                blackout_id=blackout.id,
            )

        # Step 3: no match — enqueue for human review
        queue_item = await review_queue_repo.insert_if_not_exists(
            db,
            user_id=ctx.user_id,
            organization_id=ctx.organization_id,
            email_message_id=email_message_id,
            source_channel=source_channel,
            parsed_payload=parse_result.to_payload(),
        )
        await db.commit()

        queue_item_id: uuid.UUID | None = queue_item.id if queue_item is not None else None
        logger.debug(
            "Booking queued for review: email_message_id=%r channel=%r "
            "source_listing_id=%r queue_item_id=%s (None=idempotent skip)",
            email_message_id,
            source_channel,
            source_listing_id,
            queue_item_id,
        )
        return IngestionResult(
            action="queued_for_review",
            queue_item_id=queue_item_id,
        )


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _build_host_notes(parse_result: BookingParseResult) -> str:
    """Summarise a parse result into a short host_notes annotation."""
    parts: list[str] = []
    if parse_result.guest_name:
        parts.append(f"Guest: {parse_result.guest_name}")
    if parse_result.total_price:
        parts.append(f"Total: {parse_result.total_price}")
    booking_ref = parse_result.extra.get("booking_reference")
    if booking_ref:
        parts.append(f"Ref: {booking_ref}")
    parts.append(f"[auto-imported from {parse_result.source_channel}]")
    return " | ".join(parts)
