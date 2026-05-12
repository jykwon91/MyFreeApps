"""Unit tests for booking_ingestion_service.ingest_booking_email.

Test scenarios (per feature spec):
- not_a_booking: non-booking email returns action="not_a_booking" unchanged
- unparseable: booking-looking email with missing channel/listing_id logs WARNING
  and returns action="unparseable"
- blocked: blocklist entry for this listing → returns "blocked", no DB writes
- auto_matched: channel_listing match → creates listing_blackout with host_notes
- auto_matched_idempotent: same email_message_id twice → second call is no-op
- queued_for_review: no channel_listing match → review queue gets a new row
- queued_for_review_idempotent: same email_message_id twice → second is no-op
- exception_propagates: unexpected DB error is logged with exc_info and re-raised
"""
from __future__ import annotations

import uuid
from datetime import date
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.core.context import RequestContext, worker_context
from app.models.organization.organization_member import OrgRole
from app.services.calendar.booking_ingestion_service import IngestionResult, ingest_booking_email


# ---------------------------------------------------------------------------
# Shared fixtures / helpers
# ---------------------------------------------------------------------------

_ORG_ID = uuid.uuid4()
_USER_ID = uuid.uuid4()


def _ctx() -> RequestContext:
    return worker_context(_ORG_ID, _USER_ID)


def _mock_db() -> AsyncMock:
    """Return a mock that behaves like an async context manager for unit_of_work."""
    db = AsyncMock()
    db.__aenter__ = AsyncMock(return_value=db)
    db.__aexit__ = AsyncMock(return_value=False)
    db.commit = AsyncMock()
    db.refresh = AsyncMock()
    return db


def _make_blackout(
    *,
    listing_id: uuid.UUID | None = None,
    host_notes: str | None = None,
) -> MagicMock:
    bo = MagicMock()
    bo.id = uuid.uuid4()
    bo.listing_id = listing_id or uuid.uuid4()
    bo.starts_on = date(2026, 6, 5)
    bo.ends_on = date(2026, 6, 10)
    bo.source = "airbnb"
    bo.host_notes = host_notes
    return bo


def _make_channel_listing(*, listing_id: uuid.UUID | None = None) -> MagicMock:
    cl = MagicMock()
    cl.id = uuid.uuid4()
    cl.listing_id = listing_id or uuid.uuid4()
    cl.channel_id = "airbnb"
    cl.external_id = "99999999"
    return cl


def _make_queue_item() -> MagicMock:
    qi = MagicMock()
    qi.id = uuid.uuid4()
    return qi


# ---------------------------------------------------------------------------
# Airbnb booking email fixtures (realistic but minimal)
# ---------------------------------------------------------------------------

_AIRBNB_FROM = "automated@airbnb.com"
_AIRBNB_SUBJECT = "Reservation confirmed — Jun 5 - Jun 10"
_AIRBNB_BODY = """
Guest: Jane Smith
Check-in: June 5, 2026
Check-out: June 10, 2026
Total payout: $425.00
#99999999
Reservation code: ABCD1234
"""

_NON_BOOKING_FROM = "receipts@amazon.com"
_NON_BOOKING_SUBJECT = "Your Amazon order has shipped"
_NON_BOOKING_BODY = "Order #123-456-789 has shipped."

# A booking-looking email where listing ID is missing
_AIRBNB_NO_LISTING_BODY = """
Guest: Jane Smith
Check-in: June 5, 2026
Check-out: June 10, 2026
Total payout: $425.00
Reservation code: ABCD1234
"""


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


class TestNotABooking:
    @pytest.mark.asyncio
    async def test_non_booking_email_returns_not_a_booking(self) -> None:
        """A regular non-booking email → action='not_a_booking', no DB calls."""
        mock_db = _mock_db()

        with patch(
            "app.services.calendar.booking_ingestion_service.unit_of_work",
            return_value=mock_db,
        ):
            result = await ingest_booking_email(
                ctx=_ctx(),
                email_message_id="msg-non-booking",
                from_address=_NON_BOOKING_FROM,
                subject=_NON_BOOKING_SUBJECT,
                body=_NON_BOOKING_BODY,
            )

        assert result.action == "not_a_booking"
        assert result.listing_id is None
        assert result.blackout_id is None
        assert result.queue_item_id is None
        # unit_of_work context manager must not have been entered
        mock_db.__aenter__.assert_not_awaited()


class TestUnparseable:
    @pytest.mark.asyncio
    async def test_booking_without_listing_id_returns_unparseable(
        self, caplog: pytest.LogCaptureFixture,
    ) -> None:
        """Airbnb email recognised but listing ID missing → action='unparseable', WARNING logged."""
        import logging

        mock_db = _mock_db()

        with (
            patch(
                "app.services.calendar.booking_ingestion_service.unit_of_work",
                return_value=mock_db,
            ),
            caplog.at_level(logging.WARNING, logger="app.services.calendar.booking_ingestion_service"),
        ):
            result = await ingest_booking_email(
                ctx=_ctx(),
                email_message_id="msg-no-listing",
                from_address=_AIRBNB_FROM,
                subject=_AIRBNB_SUBJECT,
                body=_AIRBNB_NO_LISTING_BODY,
            )

        assert result.action == "unparseable"
        assert any("unparseable" in r.message.lower() or "could not be fully parsed" in r.message for r in caplog.records)
        mock_db.__aenter__.assert_not_awaited()


class TestBlocked:
    @pytest.mark.asyncio
    async def test_blocked_listing_returns_blocked_no_writes(self) -> None:
        """Listing on blocklist → action='blocked', no queue insert or blackout created."""
        mock_db = _mock_db()
        blocklist_mock = AsyncMock(return_value=True)

        with (
            patch(
                "app.services.calendar.booking_ingestion_service.unit_of_work",
                return_value=mock_db,
            ),
            patch(
                "app.services.calendar.booking_ingestion_service.blocklist_repo.is_blocked",
                blocklist_mock,
            ),
            patch(
                "app.services.calendar.booking_ingestion_service.channel_listing_repo.get_by_org_channel_external_id",
            ) as cl_mock,
            patch(
                "app.services.calendar.booking_ingestion_service.review_queue_repo.insert_if_not_exists",
            ) as rq_mock,
            patch(
                "app.services.calendar.booking_ingestion_service.listing_blackout_repo.upsert_by_uid",
            ) as bo_mock,
        ):
            result = await ingest_booking_email(
                ctx=_ctx(),
                email_message_id="msg-blocked",
                from_address=_AIRBNB_FROM,
                subject=_AIRBNB_SUBJECT,
                body=_AIRBNB_BODY,
            )

        assert result.action == "blocked"
        blocklist_mock.assert_awaited_once()
        cl_mock.assert_not_awaited()
        rq_mock.assert_not_awaited()
        bo_mock.assert_not_awaited()
        mock_db.commit.assert_not_awaited()


class TestAutoMatched:
    @pytest.mark.asyncio
    async def test_auto_matched_creates_blackout_with_host_notes(self) -> None:
        """channel_listing match → upsert_by_uid called, host_notes populated, action='auto_matched'."""
        listing_id = uuid.uuid4()
        channel_listing = _make_channel_listing(listing_id=listing_id)
        blackout = _make_blackout(listing_id=listing_id, host_notes=None)

        mock_db = _mock_db()
        upsert_mock = AsyncMock(return_value=blackout)

        with (
            patch(
                "app.services.calendar.booking_ingestion_service.unit_of_work",
                return_value=mock_db,
            ),
            patch(
                "app.services.calendar.booking_ingestion_service.blocklist_repo.is_blocked",
                AsyncMock(return_value=False),
            ),
            patch(
                "app.services.calendar.booking_ingestion_service.channel_listing_repo.get_by_org_channel_external_id",
                AsyncMock(return_value=channel_listing),
            ),
            patch(
                "app.services.calendar.booking_ingestion_service.listing_blackout_repo.upsert_by_uid",
                upsert_mock,
            ),
        ):
            result = await ingest_booking_email(
                ctx=_ctx(),
                email_message_id="msg-matched-1",
                from_address=_AIRBNB_FROM,
                subject=_AIRBNB_SUBJECT,
                body=_AIRBNB_BODY,
            )

        assert result.action == "auto_matched"
        assert result.listing_id == listing_id
        assert result.blackout_id == blackout.id
        assert result.queue_item_id is None

        # Verify upsert was called with the email_message_id as source_event_id
        upsert_call = upsert_mock.call_args.kwargs
        assert upsert_call["source_event_id"] == "msg-matched-1"
        assert upsert_call["listing_id"] == listing_id
        assert upsert_call["source"] == "airbnb"

        # host_notes should have been set (blackout.host_notes was None before)
        assert blackout.host_notes is not None
        assert "Jane Smith" in blackout.host_notes
        assert "airbnb" in blackout.host_notes.lower()

        mock_db.commit.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_auto_matched_does_not_overwrite_existing_host_notes(self) -> None:
        """If host_notes is already set on the blackout, it must not be overwritten."""
        listing_id = uuid.uuid4()
        channel_listing = _make_channel_listing(listing_id=listing_id)
        existing_notes = "Host wrote this manually"
        blackout = _make_blackout(listing_id=listing_id, host_notes=existing_notes)

        mock_db = _mock_db()

        with (
            patch(
                "app.services.calendar.booking_ingestion_service.unit_of_work",
                return_value=mock_db,
            ),
            patch(
                "app.services.calendar.booking_ingestion_service.blocklist_repo.is_blocked",
                AsyncMock(return_value=False),
            ),
            patch(
                "app.services.calendar.booking_ingestion_service.channel_listing_repo.get_by_org_channel_external_id",
                AsyncMock(return_value=channel_listing),
            ),
            patch(
                "app.services.calendar.booking_ingestion_service.listing_blackout_repo.upsert_by_uid",
                AsyncMock(return_value=blackout),
            ),
        ):
            await ingest_booking_email(
                ctx=_ctx(),
                email_message_id="msg-matched-existing-notes",
                from_address=_AIRBNB_FROM,
                subject=_AIRBNB_SUBJECT,
                body=_AIRBNB_BODY,
            )

        # Existing notes must be preserved
        assert blackout.host_notes == existing_notes


class TestAutoMatchedIdempotent:
    @pytest.mark.asyncio
    async def test_second_call_with_same_message_id_is_no_op(self) -> None:
        """upsert_by_uid is idempotent — second call with same email_message_id
        returns the same blackout without creating a duplicate."""
        listing_id = uuid.uuid4()
        channel_listing = _make_channel_listing(listing_id=listing_id)
        blackout = _make_blackout(listing_id=listing_id, host_notes="already set")

        mock_db = _mock_db()
        upsert_mock = AsyncMock(return_value=blackout)

        kwargs = dict(
            ctx=_ctx(),
            email_message_id="msg-idempotent",
            from_address=_AIRBNB_FROM,
            subject=_AIRBNB_SUBJECT,
            body=_AIRBNB_BODY,
        )
        patches = (
            patch(
                "app.services.calendar.booking_ingestion_service.unit_of_work",
                return_value=mock_db,
            ),
            patch(
                "app.services.calendar.booking_ingestion_service.blocklist_repo.is_blocked",
                AsyncMock(return_value=False),
            ),
            patch(
                "app.services.calendar.booking_ingestion_service.channel_listing_repo.get_by_org_channel_external_id",
                AsyncMock(return_value=channel_listing),
            ),
            patch(
                "app.services.calendar.booking_ingestion_service.listing_blackout_repo.upsert_by_uid",
                upsert_mock,
            ),
        )

        with patches[0], patches[1], patches[2], patches[3]:
            result1 = await ingest_booking_email(**kwargs)
            result2 = await ingest_booking_email(**kwargs)

        # Both return auto_matched
        assert result1.action == "auto_matched"
        assert result2.action == "auto_matched"
        # upsert_by_uid was called twice — idempotency is inside the repo
        assert upsert_mock.await_count == 2


class TestQueuedForReview:
    @pytest.mark.asyncio
    async def test_no_match_inserts_into_review_queue(self) -> None:
        """No channel_listing match → insert_if_not_exists called, action='queued_for_review'."""
        queue_item = _make_queue_item()
        insert_mock = AsyncMock(return_value=queue_item)

        mock_db = _mock_db()

        with (
            patch(
                "app.services.calendar.booking_ingestion_service.unit_of_work",
                return_value=mock_db,
            ),
            patch(
                "app.services.calendar.booking_ingestion_service.blocklist_repo.is_blocked",
                AsyncMock(return_value=False),
            ),
            patch(
                "app.services.calendar.booking_ingestion_service.channel_listing_repo.get_by_org_channel_external_id",
                AsyncMock(return_value=None),
            ),
            patch(
                "app.services.calendar.booking_ingestion_service.review_queue_repo.insert_if_not_exists",
                insert_mock,
            ),
        ):
            result = await ingest_booking_email(
                ctx=_ctx(),
                email_message_id="msg-no-match",
                from_address=_AIRBNB_FROM,
                subject=_AIRBNB_SUBJECT,
                body=_AIRBNB_BODY,
            )

        assert result.action == "queued_for_review"
        assert result.queue_item_id == queue_item.id
        assert result.listing_id is None
        assert result.blackout_id is None

        # Verify insert received the correct payload
        insert_call = insert_mock.call_args.kwargs
        assert insert_call["email_message_id"] == "msg-no-match"
        assert insert_call["source_channel"] == "airbnb"
        assert insert_call["user_id"] == _USER_ID
        assert insert_call["organization_id"] == _ORG_ID
        assert "guest_name" in insert_call["parsed_payload"]

        mock_db.commit.assert_awaited_once()


class TestQueuedForReviewIdempotent:
    @pytest.mark.asyncio
    async def test_second_call_returns_queued_with_none_id(self) -> None:
        """insert_if_not_exists returns None on conflict — second call is a no-op.
        The returned queue_item_id is None but action is still 'queued_for_review'.
        """
        mock_db = _mock_db()
        # Simulate conflict: first call returns a row, second returns None
        insert_mock = AsyncMock(side_effect=[_make_queue_item(), None])

        with (
            patch(
                "app.services.calendar.booking_ingestion_service.unit_of_work",
                return_value=mock_db,
            ),
            patch(
                "app.services.calendar.booking_ingestion_service.blocklist_repo.is_blocked",
                AsyncMock(return_value=False),
            ),
            patch(
                "app.services.calendar.booking_ingestion_service.channel_listing_repo.get_by_org_channel_external_id",
                AsyncMock(return_value=None),
            ),
            patch(
                "app.services.calendar.booking_ingestion_service.review_queue_repo.insert_if_not_exists",
                insert_mock,
            ),
        ):
            result1 = await ingest_booking_email(
                ctx=_ctx(),
                email_message_id="msg-idempotent-queue",
                from_address=_AIRBNB_FROM,
                subject=_AIRBNB_SUBJECT,
                body=_AIRBNB_BODY,
            )
            result2 = await ingest_booking_email(
                ctx=_ctx(),
                email_message_id="msg-idempotent-queue",
                from_address=_AIRBNB_FROM,
                subject=_AIRBNB_SUBJECT,
                body=_AIRBNB_BODY,
            )

        assert result1.action == "queued_for_review"
        assert result1.queue_item_id is not None

        assert result2.action == "queued_for_review"
        assert result2.queue_item_id is None  # conflict → None returned by repo


class TestExceptionPropagation:
    @pytest.mark.asyncio
    async def test_db_error_is_logged_and_reraised(
        self, caplog: pytest.LogCaptureFixture,
    ) -> None:
        """An unexpected DB error must be logged at WARNING (with exc_info) and re-raised."""
        import logging

        mock_db = _mock_db()

        with (
            patch(
                "app.services.calendar.booking_ingestion_service.unit_of_work",
                return_value=mock_db,
            ),
            patch(
                "app.services.calendar.booking_ingestion_service.blocklist_repo.is_blocked",
                AsyncMock(side_effect=RuntimeError("DB connection lost")),
            ),
            caplog.at_level(logging.WARNING, logger="app.services.calendar.booking_ingestion_service"),
        ):
            with pytest.raises(RuntimeError, match="DB connection lost"):
                await ingest_booking_email(
                    ctx=_ctx(),
                    email_message_id="msg-db-error",
                    from_address=_AIRBNB_FROM,
                    subject=_AIRBNB_SUBJECT,
                    body=_AIRBNB_BODY,
                )

        # Must have logged with exc_info — at least one WARNING record with the message id
        warning_records = [r for r in caplog.records if r.levelno >= logging.WARNING]
        assert any("msg-db-error" in r.message for r in warning_records)
        # exc_info is set when the record has exc_info tuple
        assert any(r.exc_info is not None for r in warning_records)
