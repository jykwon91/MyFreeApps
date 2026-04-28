"""Service-layer tests for inquiry_service.

Verifies the orchestration contract:
- create_inquiry emits a 'received' InquiryEvent in the same transaction
- update_inquiry with a stage change emits a stage-transition event
- update_inquiry without a stage change does NOT emit an event
- delete_inquiry emits an 'archived' event before soft-deleting
- cross-org access raises LookupError (404 mapping)
- duplicate (organization_id, source, external_inquiry_id) raises InquiryConflictError

These tests intentionally use the service module's own DB session manager
(not the test fixture's `db`) — we patch ``AsyncSessionLocal`` /
``unit_of_work`` so the in-memory SQLite session is used end-to-end.
"""
from __future__ import annotations

import datetime as _dt
import uuid
from contextlib import asynccontextmanager

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.inquiries.inquiry import Inquiry
from app.models.inquiries.inquiry_event import InquiryEvent
from app.models.organization.organization import Organization
from app.models.user.user import User
from app.schemas.inquiries.inquiry_create_request import InquiryCreateRequest
from app.schemas.inquiries.inquiry_update_request import InquiryUpdateRequest
from app.services.inquiries import inquiry_service
from app.services.inquiries.inquiry_service import InquiryConflictError


@pytest.fixture
def patch_session(monkeypatch: pytest.MonkeyPatch, db: AsyncSession):
    """Re-route inquiry_service's session factory to the test SQLite fixture."""

    @asynccontextmanager
    async def _factory():
        yield db

    @asynccontextmanager
    async def _uow():
        # The real unit_of_work begins/commits a transaction. For the
        # in-memory fixture we just yield the same session — the tests call
        # await db.commit() / db.rollback() explicitly when they need to.
        try:
            yield db
            await db.commit()
        except Exception:
            await db.rollback()
            raise

    monkeypatch.setattr(inquiry_service, "AsyncSessionLocal", _factory)
    monkeypatch.setattr(inquiry_service, "unit_of_work", _uow)
    return None


def _create_payload(
    *, source: str = "FF", external_inquiry_id: str | None = "I-1",
) -> InquiryCreateRequest:
    return InquiryCreateRequest(
        source=source,
        external_inquiry_id=external_inquiry_id,
        inquirer_name="Alice",
        inquirer_email="alice@example.com",
        received_at=_dt.datetime.now(_dt.timezone.utc),
    )


class TestCreateInquiryEmitsReceivedEvent:
    @pytest.mark.asyncio
    async def test_creates_inquiry_and_seed_event_atomically(
        self, db: AsyncSession, test_user: User, test_org: Organization,
        patch_session,
    ) -> None:
        payload = _create_payload()
        result = await inquiry_service.create_inquiry(
            test_org.id, test_user.id, payload,
        )

        # Service returns full response with events embedded.
        assert result.stage == "new"
        assert len(result.events) == 1
        assert result.events[0].event_type == "received"
        assert result.events[0].actor == "host"

        # And it's actually in the DB (not just in-memory).
        events = (await db.execute(
            select(InquiryEvent).where(InquiryEvent.inquiry_id == result.id),
        )).scalars().all()
        assert len(events) == 1
        assert events[0].event_type == "received"

    @pytest.mark.asyncio
    async def test_duplicate_source_external_id_raises_conflict(
        self, db: AsyncSession, test_user: User, test_org: Organization,
        patch_session,
    ) -> None:
        payload = _create_payload(source="FF", external_inquiry_id="I-dup")
        await inquiry_service.create_inquiry(test_org.id, test_user.id, payload)

        with pytest.raises(InquiryConflictError):
            await inquiry_service.create_inquiry(test_org.id, test_user.id, payload)

    @pytest.mark.asyncio
    async def test_different_orgs_can_use_same_external_id(
        self, db: AsyncSession, test_user: User, test_org: Organization,
        patch_session,
    ) -> None:
        # Build a second org/user.
        from app.models.organization.organization_member import OrganizationMember

        user_b = User(
            id=uuid.uuid4(), email="b@example.com", hashed_password="h",
            is_active=True, is_superuser=False, is_verified=True,
        )
        org_b = Organization(id=uuid.uuid4(), name="B", created_by=user_b.id)
        db.add_all([user_b, org_b])
        await db.flush()
        db.add(OrganizationMember(
            organization_id=org_b.id, user_id=user_b.id, org_role="owner",
        ))
        await db.commit()

        payload = _create_payload(source="FF", external_inquiry_id="I-shared")
        result_a = await inquiry_service.create_inquiry(
            test_org.id, test_user.id, payload,
        )
        result_b = await inquiry_service.create_inquiry(
            org_b.id, user_b.id, payload,
        )
        assert result_a.id != result_b.id


class TestUpdateInquiry:
    @pytest.mark.asyncio
    async def test_stage_change_emits_event(
        self, db: AsyncSession, test_user: User, test_org: Organization,
        patch_session,
    ) -> None:
        created = await inquiry_service.create_inquiry(
            test_org.id, test_user.id, _create_payload(),
        )

        updated = await inquiry_service.update_inquiry(
            test_org.id, test_user.id, created.id,
            InquiryUpdateRequest(stage="triaged"),
        )
        assert updated.stage == "triaged"

        # received + triaged
        types = [e.event_type for e in updated.events]
        assert "received" in types
        assert "triaged" in types
        assert len(types) == 2

    @pytest.mark.asyncio
    async def test_field_only_update_does_not_emit_event(
        self, db: AsyncSession, test_user: User, test_org: Organization,
        patch_session,
    ) -> None:
        created = await inquiry_service.create_inquiry(
            test_org.id, test_user.id, _create_payload(),
        )

        updated = await inquiry_service.update_inquiry(
            test_org.id, test_user.id, created.id,
            InquiryUpdateRequest(notes="updated notes", gut_rating=4),
        )
        assert updated.notes == "updated notes"
        assert updated.gut_rating == 4

        # Still only the seed event.
        assert [e.event_type for e in updated.events] == ["received"]

    @pytest.mark.asyncio
    async def test_same_stage_update_does_not_emit_event(
        self, db: AsyncSession, test_user: User, test_org: Organization,
        patch_session,
    ) -> None:
        """Setting stage to the existing value is a no-op event-wise."""
        created = await inquiry_service.create_inquiry(
            test_org.id, test_user.id, _create_payload(),
        )

        updated = await inquiry_service.update_inquiry(
            test_org.id, test_user.id, created.id,
            InquiryUpdateRequest(stage="new"),
        )
        assert [e.event_type for e in updated.events] == ["received"]

    @pytest.mark.asyncio
    async def test_cross_org_update_raises_lookup_error(
        self, db: AsyncSession, test_user: User, test_org: Organization,
        patch_session,
    ) -> None:
        created = await inquiry_service.create_inquiry(
            test_org.id, test_user.id, _create_payload(),
        )

        other_org = uuid.uuid4()
        with pytest.raises(LookupError):
            await inquiry_service.update_inquiry(
                other_org, test_user.id, created.id,
                InquiryUpdateRequest(stage="triaged"),
            )


class TestDeleteInquiry:
    @pytest.mark.asyncio
    async def test_delete_emits_archived_event_and_soft_deletes(
        self, db: AsyncSession, test_user: User, test_org: Organization,
        patch_session,
    ) -> None:
        created = await inquiry_service.create_inquiry(
            test_org.id, test_user.id, _create_payload(),
        )

        await inquiry_service.delete_inquiry(
            test_org.id, test_user.id, created.id,
        )

        # The inquiry row still exists, but is soft-deleted.
        row = (await db.execute(
            select(Inquiry).where(Inquiry.id == created.id),
        )).scalar_one()
        assert row.deleted_at is not None

        # 'archived' event is on the timeline.
        events = (await db.execute(
            select(InquiryEvent).where(InquiryEvent.inquiry_id == created.id),
        )).scalars().all()
        types = [e.event_type for e in events]
        assert "received" in types
        assert "archived" in types

    @pytest.mark.asyncio
    async def test_cross_org_delete_raises_lookup_error(
        self, db: AsyncSession, test_user: User, test_org: Organization,
        patch_session,
    ) -> None:
        created = await inquiry_service.create_inquiry(
            test_org.id, test_user.id, _create_payload(),
        )
        with pytest.raises(LookupError):
            await inquiry_service.delete_inquiry(
                uuid.uuid4(), test_user.id, created.id,
            )


class TestGetInquiry:
    @pytest.mark.asyncio
    async def test_returns_inquiry_with_messages_and_events(
        self, db: AsyncSession, test_user: User, test_org: Organization,
        patch_session,
    ) -> None:
        created = await inquiry_service.create_inquiry(
            test_org.id, test_user.id, _create_payload(),
        )

        # Add a message directly via the repo (services don't expose a
        # message-create endpoint in PR 2.1a).
        from app.repositories import inquiry_message_repo
        await inquiry_message_repo.create(
            db,
            inquiry_id=created.id,
            direction="inbound",
            channel="email",
            raw_email_body="hello",
        )
        await db.commit()

        result = await inquiry_service.get_inquiry(
            test_org.id, test_user.id, created.id,
        )
        assert result.id == created.id
        assert len(result.messages) == 1
        assert result.messages[0].raw_email_body == "hello"
        assert any(e.event_type == "received" for e in result.events)

    @pytest.mark.asyncio
    async def test_get_for_other_org_raises_lookup_error(
        self, db: AsyncSession, test_user: User, test_org: Organization,
        patch_session,
    ) -> None:
        created = await inquiry_service.create_inquiry(
            test_org.id, test_user.id, _create_payload(),
        )
        with pytest.raises(LookupError):
            await inquiry_service.get_inquiry(
                uuid.uuid4(), test_user.id, created.id,
            )

    @pytest.mark.asyncio
    async def test_linked_applicant_id_is_null_when_not_promoted(
        self, db: AsyncSession, test_user: User, test_org: Organization,
        patch_session,
    ) -> None:
        created = await inquiry_service.create_inquiry(
            test_org.id, test_user.id, _create_payload(),
        )
        result = await inquiry_service.get_inquiry(
            test_org.id, test_user.id, created.id,
        )
        assert result.linked_applicant_id is None

    @pytest.mark.asyncio
    async def test_linked_applicant_id_surfaced_after_applicant_seeded(
        self, db: AsyncSession, test_user: User, test_org: Organization,
        patch_session,
    ) -> None:
        """If an Applicant exists pointing at the inquiry, the response surfaces it.

        Used by the frontend InquiryDetail page to switch the "Promote to
        applicant" button to a "View applicant" link (PR 3.2).
        """
        from app.repositories.applicants import applicant_repo

        created = await inquiry_service.create_inquiry(
            test_org.id, test_user.id, _create_payload(),
        )
        applicant = await applicant_repo.create(
            db,
            organization_id=test_org.id,
            user_id=test_user.id,
            inquiry_id=created.id,
            legal_name="Alice",
            stage="lead",
        )
        await db.commit()

        result = await inquiry_service.get_inquiry(
            test_org.id, test_user.id, created.id,
        )
        assert result.linked_applicant_id == applicant.id


class TestListInbox:
    @pytest.mark.asyncio
    async def test_returns_paginated_envelope(
        self, db: AsyncSession, test_user: User, test_org: Organization,
        patch_session,
    ) -> None:
        for i in range(3):
            await inquiry_service.create_inquiry(
                test_org.id, test_user.id,
                _create_payload(source="FF", external_inquiry_id=f"I-{i}"),
            )

        result = await inquiry_service.list_inbox(
            test_org.id, test_user.id, limit=2, offset=0,
        )
        assert result.total == 3
        assert len(result.items) == 2
        assert result.has_more is True

        page2 = await inquiry_service.list_inbox(
            test_org.id, test_user.id, limit=2, offset=2,
        )
        assert page2.total == 3
        assert len(page2.items) == 1
        assert page2.has_more is False
