"""Service layer for the calendar booking review queue.

Orchestration only — the service loads data, enforces business rules, and
delegates all DB writes to the repository layer. No SQLAlchemy primitives here.

Business rules:
  - Only ``pending`` items may be resolved, ignored, or soft-deleted.
  - Resolve: verify the target listing belongs to this organisation before
    creating the booking (prevents IDOR on listing_id).
    Both the queue-item update and the listing_blackout insert happen in the
    SAME transaction — if either write fails, both roll back atomically.
    Idempotency: if the same email_message_id has already been resolved for
    this (listing, source_channel) pair, the second call is a no-op and returns
    the existing blackout (uses ``upsert_by_uid`` under the hood).
  - Ignore: upserts a blocklist entry for (user, channel, source_listing_id).
  - Soft-delete: sets deleted_at; the item disappears from the queue UI.
"""
from __future__ import annotations

import uuid
from datetime import date, datetime, timezone

from app.db.session import AsyncSessionLocal
from app.repositories.calendar import blocklist_repo, review_queue_repo
from app.repositories.listings import listing_blackout_repo, listing_repo
from app.schemas.calendar.resolve_queue_item_response import (
    BlackoutSummary,
    ResolveQueueItemResponse,
)
from app.schemas.calendar.review_queue_response import ReviewQueueItemResponse


class QueueItemNotFound(ValueError):
    """Raised when an item doesn't exist or doesn't belong to the caller's org."""


class QueueItemNotPending(ValueError):
    """Raised when an action requires the item to be in ``pending`` status."""


class ListingNotFound(ValueError):
    """Raised when the supplied listing_id doesn't exist in this org."""


class MissingPayloadFieldsError(ValueError):
    """Raised when parsed_payload is missing required date fields (check_in/check_out)."""


async def list_pending_items(
    organization_id: uuid.UUID,
) -> list[ReviewQueueItemResponse]:
    """Return all pending (non-deleted) queue items for an organisation."""
    async with AsyncSessionLocal() as db:
        items = await review_queue_repo.list_pending(
            db, organization_id=organization_id,
        )
    return [ReviewQueueItemResponse.model_validate(item) for item in items]


async def count_pending_items(organization_id: uuid.UUID) -> int:
    """Return the count of pending items — used for the badge in the UI."""
    async with AsyncSessionLocal() as db:
        return await review_queue_repo.count_pending(
            db, organization_id=organization_id,
        )


async def resolve_item(
    item_id: uuid.UUID,
    organization_id: uuid.UUID,
    user_id: uuid.UUID,
    *,
    listing_id: uuid.UUID,
) -> ResolveQueueItemResponse:
    """Mark an item as resolved and create a listing_blackout for the booking.

    Validates that:
      1. The queue item exists and belongs to this org.
      2. The item is still ``pending`` (or already resolved for same listing —
         idempotent second call returns the existing blackout).
      3. The target listing belongs to this org (IDOR guard).
      4. ``parsed_payload`` contains ``check_in`` and ``check_out`` dates.

    Both writes (queue-item → resolved, listing_blackout → inserted) happen
    inside a single transaction. If the blackout insert fails, the queue row
    stays pending (rolls back atomically).

    Idempotency: if ``email_message_id`` was already resolved for this
    (listing, source_channel) pair, ``upsert_by_uid`` in the repo is a no-op
    and returns the existing row — the caller gets a 200 with the existing
    blackout. This handles accidental double-clicks gracefully.

    Raises:
        QueueItemNotFound: item doesn't exist / wrong org.
        QueueItemNotPending: item is not in ``pending`` status.
        ListingNotFound: listing_id not found in this org.
        MissingPayloadFieldsError: parsed_payload lacks check_in or check_out.
    """
    now = datetime.now(timezone.utc)

    async with AsyncSessionLocal() as db:
        item = await review_queue_repo.get_by_id_scoped(
            db, item_id, organization_id,
        )
        if item is None:
            raise QueueItemNotFound(f"Queue item {item_id} not found")

        if item.status != "pending":
            raise QueueItemNotPending(
                f"Queue item {item_id} is already {item.status!r}"
            )

        # IDOR guard: the requested listing must belong to this org.
        listing = await listing_repo.get_by_id(
            db, listing_id, organization_id,
        )
        if listing is None:
            raise ListingNotFound(f"Listing {listing_id} not found in this org")

        # Extract required date fields from the parsed payload.
        payload = item.parsed_payload
        check_in_raw = payload.get("check_in")
        check_out_raw = payload.get("check_out")
        if not check_in_raw or not check_out_raw:
            raise MissingPayloadFieldsError(
                "parsed_payload is missing check_in or check_out — "
                "cannot create a blackout without date bounds"
            )

        try:
            starts_on = date.fromisoformat(check_in_raw)
            ends_on = date.fromisoformat(check_out_raw)
        except ValueError as exc:
            raise MissingPayloadFieldsError(
                f"parsed_payload has invalid date format: {exc}"
            ) from exc

        # Use email_message_id as the upsert key so re-resolving the same
        # email is idempotent (returns the existing blackout row).
        blackout = await listing_blackout_repo.upsert_by_uid(
            db,
            listing_id=listing_id,
            source=item.source_channel,
            source_event_id=item.email_message_id,
            starts_on=starts_on,
            ends_on=ends_on,
        )

        await review_queue_repo.mark_resolved(db, item, resolved_at=now)
        # Both writes committed atomically. If either flush fails above,
        # the context-manager rolls back and neither change is persisted.
        await db.commit()
        await db.refresh(blackout)

    return ResolveQueueItemResponse(
        queue_item_id=item_id,
        blackout=BlackoutSummary.model_validate(blackout),
    )


async def ignore_item(
    item_id: uuid.UUID,
    organization_id: uuid.UUID,
    user_id: uuid.UUID,
    *,
    source_listing_id: str,
    reason: str | None,
) -> ReviewQueueItemResponse:
    """Mark an item as ignored and add the listing to the blocklist.

    Raises:
        QueueItemNotFound: item doesn't exist / wrong org.
        QueueItemNotPending: item is not in ``pending`` status.
    """
    now = datetime.now(timezone.utc)

    async with AsyncSessionLocal() as db:
        item = await review_queue_repo.get_by_id_scoped(
            db, item_id, organization_id,
        )
        if item is None:
            raise QueueItemNotFound(f"Queue item {item_id} not found")

        if item.status != "pending":
            raise QueueItemNotPending(
                f"Queue item {item_id} is already {item.status!r}"
            )

        # Add to blocklist — idempotent via ON CONFLICT DO NOTHING.
        await blocklist_repo.insert_if_not_exists(
            db,
            user_id=user_id,
            organization_id=organization_id,
            source_channel=item.source_channel,
            source_listing_id=source_listing_id,
            reason=reason,
        )

        await review_queue_repo.mark_ignored(db, item, resolved_at=now)
        await db.commit()
        await db.refresh(item)

    return ReviewQueueItemResponse.model_validate(item)


async def dismiss_item(
    item_id: uuid.UUID,
    organization_id: uuid.UUID,
) -> None:
    """Soft-delete a queue item (user dismisses without acting).

    Raises:
        QueueItemNotFound: item doesn't exist / wrong org.
    """
    now = datetime.now(timezone.utc)

    async with AsyncSessionLocal() as db:
        item = await review_queue_repo.get_by_id_scoped(
            db, item_id, organization_id,
        )
        if item is None:
            raise QueueItemNotFound(f"Queue item {item_id} not found")

        await review_queue_repo.soft_delete(db, item, deleted_at=now)
        await db.commit()
