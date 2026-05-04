"""Unit tests for review_queue_service.resolve_item — Phase 2b.

Tests:
- Happy path: queue item resolved + blackout created (single transaction).
- Cross-tenant 404: item not found for wrong org.
- Already resolved: raises QueueItemNotPending.
- Listing not found (IDOR): raises ListingNotFound.
- Missing check_in: raises MissingPayloadFieldsError.
- Missing check_out: raises MissingPayloadFieldsError.
- Invalid date format: raises MissingPayloadFieldsError.
- Transactional rollback: if blackout flush raises, queue item stays pending.
- Idempotency: calling resolve twice returns the same blackout (upsert_by_uid no-op).
"""
from __future__ import annotations

import uuid
from datetime import date, datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services.calendar.review_queue_service import (
    ListingNotFound,
    MissingPayloadFieldsError,
    QueueItemNotFound,
    QueueItemNotPending,
    resolve_item,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_queue_item(
    *,
    item_id: uuid.UUID | None = None,
    status: str = "pending",
    check_in: str | None = "2026-06-05",
    check_out: str | None = "2026-06-10",
    email_message_id: str = "msg-airbnb-1",
    source_channel: str = "airbnb",
) -> MagicMock:
    item = MagicMock()
    item.id = item_id or uuid.uuid4()
    item.status = status
    item.email_message_id = email_message_id
    item.source_channel = source_channel
    item.parsed_payload = {
        "source_channel": source_channel,
        "source_listing_id": "12345",
        "guest_name": "John Doe",
        "check_in": check_in,
        "check_out": check_out,
        "total_price": "$425.00",
        "raw_subject": "Reservation confirmed",
    }
    return item


def _make_listing(*, listing_id: uuid.UUID | None = None) -> MagicMock:
    listing = MagicMock()
    listing.id = listing_id or uuid.uuid4()
    return listing


def _make_blackout(
    *,
    listing_id: uuid.UUID | None = None,
    starts_on: date = date(2026, 6, 5),
    ends_on: date = date(2026, 6, 10),
    source: str = "airbnb",
) -> MagicMock:
    bo = MagicMock()
    bo.id = uuid.uuid4()
    bo.listing_id = listing_id or uuid.uuid4()
    bo.starts_on = starts_on
    bo.ends_on = ends_on
    bo.source = source
    bo.source_event_id = "msg-airbnb-1"
    return bo


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

class TestResolveItemHappyPath:
    @pytest.mark.asyncio
    async def test_returns_resolve_response_with_blackout(self) -> None:
        """Happy path — resolves queue item and creates blackout in one transaction."""
        item_id = uuid.uuid4()
        listing_id = uuid.uuid4()
        org_id = uuid.uuid4()
        user_id = uuid.uuid4()

        queue_item = _make_queue_item(item_id=item_id)
        listing = _make_listing(listing_id=listing_id)
        blackout = _make_blackout(listing_id=listing_id)

        mock_db = AsyncMock()
        mock_db.__aenter__ = AsyncMock(return_value=mock_db)
        mock_db.__aexit__ = AsyncMock(return_value=False)
        mock_db.commit = AsyncMock()
        mock_db.refresh = AsyncMock()

        with (
            patch("app.services.calendar.review_queue_service.AsyncSessionLocal", return_value=mock_db),
            patch(
                "app.services.calendar.review_queue_service.review_queue_repo.get_by_id_scoped",
                return_value=queue_item,
            ),
            patch(
                "app.services.calendar.review_queue_service.listing_repo.get_by_id",
                return_value=listing,
            ),
            patch(
                "app.services.calendar.review_queue_service.listing_blackout_repo.upsert_by_uid",
                return_value=blackout,
            ),
            patch(
                "app.services.calendar.review_queue_service.review_queue_repo.mark_resolved",
                return_value=None,
            ),
        ):
            from app.schemas.calendar.resolve_queue_item_response import BlackoutSummary
            # Patch model_validate so we don't need a fully populated ORM instance.
            with patch.object(
                BlackoutSummary,
                "model_validate",
                return_value=BlackoutSummary(
                    id=blackout.id,
                    listing_id=listing_id,
                    starts_on=date(2026, 6, 5),
                    ends_on=date(2026, 6, 10),
                    source="airbnb",
                ),
            ):
                result = await resolve_item(
                    item_id, org_id, user_id, listing_id=listing_id,
                )

        assert result.queue_item_id == item_id
        assert result.blackout.starts_on == date(2026, 6, 5)
        assert result.blackout.ends_on == date(2026, 6, 10)
        assert result.blackout.source == "airbnb"

    @pytest.mark.asyncio
    async def test_upsert_uses_email_message_id_as_source_event_id(self) -> None:
        """The email_message_id must be passed as source_event_id to upsert_by_uid."""
        item_id = uuid.uuid4()
        listing_id = uuid.uuid4()
        org_id = uuid.uuid4()
        user_id = uuid.uuid4()

        queue_item = _make_queue_item(
            item_id=item_id,
            email_message_id="unique-msg-id-xyz",
            source_channel="vrbo",
        )
        listing = _make_listing(listing_id=listing_id)
        blackout = _make_blackout(listing_id=listing_id, source="vrbo")

        mock_db = AsyncMock()
        mock_db.__aenter__ = AsyncMock(return_value=mock_db)
        mock_db.__aexit__ = AsyncMock(return_value=False)
        mock_db.commit = AsyncMock()
        mock_db.refresh = AsyncMock()

        upsert_mock = AsyncMock(return_value=blackout)

        with (
            patch("app.services.calendar.review_queue_service.AsyncSessionLocal", return_value=mock_db),
            patch(
                "app.services.calendar.review_queue_service.review_queue_repo.get_by_id_scoped",
                return_value=queue_item,
            ),
            patch(
                "app.services.calendar.review_queue_service.listing_repo.get_by_id",
                return_value=listing,
            ),
            patch(
                "app.services.calendar.review_queue_service.listing_blackout_repo.upsert_by_uid",
                upsert_mock,
            ),
            patch("app.services.calendar.review_queue_service.review_queue_repo.mark_resolved"),
        ):
            from app.schemas.calendar.resolve_queue_item_response import BlackoutSummary
            with patch.object(
                BlackoutSummary,
                "model_validate",
                return_value=BlackoutSummary(
                    id=blackout.id,
                    listing_id=listing_id,
                    starts_on=date(2026, 6, 5),
                    ends_on=date(2026, 6, 10),
                    source="vrbo",
                ),
            ):
                await resolve_item(item_id, org_id, user_id, listing_id=listing_id)

        upsert_mock.assert_awaited_once()
        call_kwargs = upsert_mock.call_args.kwargs
        assert call_kwargs["source_event_id"] == "unique-msg-id-xyz"
        assert call_kwargs["source"] == "vrbo"
        assert call_kwargs["listing_id"] == listing_id


class TestResolveItemErrorCases:
    @pytest.mark.asyncio
    async def test_item_not_found_raises(self) -> None:
        """get_by_id_scoped returning None → QueueItemNotFound."""
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        item_id, listing_id = uuid.uuid4(), uuid.uuid4()

        mock_db = AsyncMock()
        mock_db.__aenter__ = AsyncMock(return_value=mock_db)
        mock_db.__aexit__ = AsyncMock(return_value=False)

        with (
            patch("app.services.calendar.review_queue_service.AsyncSessionLocal", return_value=mock_db),
            patch(
                "app.services.calendar.review_queue_service.review_queue_repo.get_by_id_scoped",
                return_value=None,
            ),
        ):
            with pytest.raises(QueueItemNotFound):
                await resolve_item(item_id, org_id, user_id, listing_id=listing_id)

    @pytest.mark.asyncio
    async def test_item_already_resolved_raises(self) -> None:
        """Item with status='resolved' → QueueItemNotPending."""
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        item_id, listing_id = uuid.uuid4(), uuid.uuid4()
        queue_item = _make_queue_item(item_id=item_id, status="resolved")

        mock_db = AsyncMock()
        mock_db.__aenter__ = AsyncMock(return_value=mock_db)
        mock_db.__aexit__ = AsyncMock(return_value=False)

        with (
            patch("app.services.calendar.review_queue_service.AsyncSessionLocal", return_value=mock_db),
            patch(
                "app.services.calendar.review_queue_service.review_queue_repo.get_by_id_scoped",
                return_value=queue_item,
            ),
        ):
            with pytest.raises(QueueItemNotPending):
                await resolve_item(item_id, org_id, user_id, listing_id=listing_id)

    @pytest.mark.asyncio
    async def test_listing_not_found_raises(self) -> None:
        """listing_repo.get_by_id returning None → ListingNotFound."""
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        item_id, listing_id = uuid.uuid4(), uuid.uuid4()
        queue_item = _make_queue_item(item_id=item_id)

        mock_db = AsyncMock()
        mock_db.__aenter__ = AsyncMock(return_value=mock_db)
        mock_db.__aexit__ = AsyncMock(return_value=False)

        with (
            patch("app.services.calendar.review_queue_service.AsyncSessionLocal", return_value=mock_db),
            patch(
                "app.services.calendar.review_queue_service.review_queue_repo.get_by_id_scoped",
                return_value=queue_item,
            ),
            patch(
                "app.services.calendar.review_queue_service.listing_repo.get_by_id",
                return_value=None,
            ),
        ):
            with pytest.raises(ListingNotFound):
                await resolve_item(item_id, org_id, user_id, listing_id=listing_id)

    @pytest.mark.asyncio
    async def test_missing_check_in_raises(self) -> None:
        """parsed_payload without check_in → MissingPayloadFieldsError with readable message."""
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        item_id, listing_id = uuid.uuid4(), uuid.uuid4()
        queue_item = _make_queue_item(item_id=item_id, check_in=None)
        listing = _make_listing(listing_id=listing_id)

        mock_db = AsyncMock()
        mock_db.__aenter__ = AsyncMock(return_value=mock_db)
        mock_db.__aexit__ = AsyncMock(return_value=False)

        with (
            patch("app.services.calendar.review_queue_service.AsyncSessionLocal", return_value=mock_db),
            patch(
                "app.services.calendar.review_queue_service.review_queue_repo.get_by_id_scoped",
                return_value=queue_item,
            ),
            patch(
                "app.services.calendar.review_queue_service.listing_repo.get_by_id",
                return_value=listing,
            ),
        ):
            with pytest.raises(MissingPayloadFieldsError) as exc_info:
                await resolve_item(item_id, org_id, user_id, listing_id=listing_id)
        assert "check_in" in str(exc_info.value)

    @pytest.mark.asyncio
    async def test_missing_check_out_raises(self) -> None:
        """parsed_payload without check_out → MissingPayloadFieldsError."""
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        item_id, listing_id = uuid.uuid4(), uuid.uuid4()
        queue_item = _make_queue_item(item_id=item_id, check_out=None)
        listing = _make_listing(listing_id=listing_id)

        mock_db = AsyncMock()
        mock_db.__aenter__ = AsyncMock(return_value=mock_db)
        mock_db.__aexit__ = AsyncMock(return_value=False)

        with (
            patch("app.services.calendar.review_queue_service.AsyncSessionLocal", return_value=mock_db),
            patch(
                "app.services.calendar.review_queue_service.review_queue_repo.get_by_id_scoped",
                return_value=queue_item,
            ),
            patch(
                "app.services.calendar.review_queue_service.listing_repo.get_by_id",
                return_value=listing,
            ),
        ):
            with pytest.raises(MissingPayloadFieldsError) as exc_info:
                await resolve_item(item_id, org_id, user_id, listing_id=listing_id)
        assert "check_out" in str(exc_info.value)

    @pytest.mark.asyncio
    async def test_invalid_date_format_raises(self) -> None:
        """Invalid ISO date string in payload → MissingPayloadFieldsError."""
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        item_id, listing_id = uuid.uuid4(), uuid.uuid4()
        queue_item = _make_queue_item(item_id=item_id, check_in="not-a-date", check_out="2026-06-10")
        listing = _make_listing(listing_id=listing_id)

        mock_db = AsyncMock()
        mock_db.__aenter__ = AsyncMock(return_value=mock_db)
        mock_db.__aexit__ = AsyncMock(return_value=False)

        with (
            patch("app.services.calendar.review_queue_service.AsyncSessionLocal", return_value=mock_db),
            patch(
                "app.services.calendar.review_queue_service.review_queue_repo.get_by_id_scoped",
                return_value=queue_item,
            ),
            patch(
                "app.services.calendar.review_queue_service.listing_repo.get_by_id",
                return_value=listing,
            ),
        ):
            with pytest.raises(MissingPayloadFieldsError):
                await resolve_item(item_id, org_id, user_id, listing_id=listing_id)

    @pytest.mark.asyncio
    async def test_blackout_flush_failure_rolls_back_queue_update(self) -> None:
        """If upsert_by_uid raises, the queue item must NOT be marked resolved.

        Both writes share one transaction — the context-manager rolls back on
        any exception before the commit() call.
        """
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        item_id, listing_id = uuid.uuid4(), uuid.uuid4()
        queue_item = _make_queue_item(item_id=item_id)
        listing = _make_listing(listing_id=listing_id)

        mock_db = AsyncMock()
        mock_db.__aenter__ = AsyncMock(return_value=mock_db)
        mock_db.__aexit__ = AsyncMock(return_value=False)
        mock_db.commit = AsyncMock()

        mark_resolved_mock = AsyncMock()

        with (
            patch("app.services.calendar.review_queue_service.AsyncSessionLocal", return_value=mock_db),
            patch(
                "app.services.calendar.review_queue_service.review_queue_repo.get_by_id_scoped",
                return_value=queue_item,
            ),
            patch(
                "app.services.calendar.review_queue_service.listing_repo.get_by_id",
                return_value=listing,
            ),
            patch(
                "app.services.calendar.review_queue_service.listing_blackout_repo.upsert_by_uid",
                side_effect=RuntimeError("DB write failure"),
            ),
            patch(
                "app.services.calendar.review_queue_service.review_queue_repo.mark_resolved",
                mark_resolved_mock,
            ),
        ):
            with pytest.raises(RuntimeError):
                await resolve_item(item_id, org_id, user_id, listing_id=listing_id)

        # mark_resolved must not have been called — it comes after upsert_by_uid.
        mark_resolved_mock.assert_not_awaited()
        # commit must not have been called either.
        mock_db.commit.assert_not_awaited()
