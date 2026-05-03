"""Service layer for the calendar booking review queue.

Orchestration only — the service loads data, enforces business rules, and
delegates all DB writes to the repository layer. No SQLAlchemy primitives here.

Business rules:
  - Only ``pending`` items may be resolved, ignored, or soft-deleted.
  - Resolve: verify the target listing belongs to this organisation before
    creating the booking (prevents IDOR on listing_id).
  - Ignore: upserts a blocklist entry for (user, channel, source_listing_id).
  - Soft-delete: sets deleted_at; the item disappears from the queue UI.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from app.db.session import AsyncSessionLocal
from app.repositories.calendar import blocklist_repo, review_queue_repo
from app.repositories.listings import listing_repo
from app.schemas.calendar.review_queue_response import ReviewQueueItemResponse


class QueueItemNotFound(ValueError):
    """Raised when an item doesn't exist or doesn't belong to the caller's org."""


class QueueItemNotPending(ValueError):
    """Raised when an action requires the item to be in ``pending`` status."""


class ListingNotFound(ValueError):
    """Raised when the supplied listing_id doesn't exist in this org."""


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
) -> ReviewQueueItemResponse:
    """Mark an item as resolved, creating a listing_blackout for the booking.

    Validates that:
      1. The queue item exists and belongs to this org.
      2. The item is still ``pending``.
      3. The target listing belongs to this org.

    The booking creation (listing_blackout row) is deferred to Phase 2b
    when the email parser is integrated; for now, the resolve step marks
    the queue item as resolved so the UI reflects the change immediately.

    Raises:
        QueueItemNotFound: item doesn't exist / wrong org.
        QueueItemNotPending: item is not in ``pending`` status.
        ListingNotFound: listing_id not found in this org.
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

        await review_queue_repo.mark_resolved(db, item, resolved_at=now)
        await db.commit()
        await db.refresh(item)

    return ReviewQueueItemResponse.model_validate(item)


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
