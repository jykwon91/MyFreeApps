"""Repository tests for the inquiries domain.

Covers:
- get_by_id / soft-delete / cross-org isolation
- update allowlist (organization_id, user_id, source NOT updatable)
- count_by_organization respects soft-delete and stage filter
- list_with_last_message returns the LATEST message per inquiry (no N+1)
- find_by_email_message_id scoped by user_id
- find_by_source_and_external_id scoped by organization_id
- the full uniqueness matrix on (organization_id, source, external_inquiry_id)
"""
from __future__ import annotations

import datetime as _dt
import uuid

import pytest
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.inquiries.inquiry import Inquiry
from app.models.inquiries.inquiry_message import InquiryMessage
from app.models.organization.organization import Organization
from app.models.organization.organization_member import OrganizationMember
from app.models.user.user import User
from app.repositories import inquiry_repo


def _make_inquiry(
    *,
    organization_id: uuid.UUID,
    user_id: uuid.UUID,
    source: str = "direct",
    external_inquiry_id: str | None = None,
    stage: str = "new",
    received_at: _dt.datetime | None = None,
    deleted_at: _dt.datetime | None = None,
    email_message_id: str | None = None,
    inquirer_name: str | None = None,
    listing_id: uuid.UUID | None = None,
) -> Inquiry:
    return Inquiry(
        id=uuid.uuid4(),
        organization_id=organization_id,
        user_id=user_id,
        listing_id=listing_id,
        source=source,
        external_inquiry_id=external_inquiry_id,
        inquirer_name=inquirer_name,
        stage=stage,
        received_at=received_at or _dt.datetime.now(_dt.timezone.utc),
        deleted_at=deleted_at,
        email_message_id=email_message_id,
    )


class TestInquiryRepoGetById:
    @pytest.mark.asyncio
    async def test_returns_inquiry_when_exists(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        inquiry = _make_inquiry(
            organization_id=test_org.id, user_id=test_user.id,
            inquirer_name="Alice",
        )
        db.add(inquiry)
        await db.commit()

        result = await inquiry_repo.get_by_id(db, inquiry.id, test_org.id)
        assert result is not None
        assert result.id == inquiry.id
        assert result.inquirer_name == "Alice"

    @pytest.mark.asyncio
    async def test_returns_none_when_soft_deleted(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        inquiry = _make_inquiry(
            organization_id=test_org.id, user_id=test_user.id,
            deleted_at=_dt.datetime.now(_dt.timezone.utc),
        )
        db.add(inquiry)
        await db.commit()

        assert await inquiry_repo.get_by_id(db, inquiry.id, test_org.id) is None

    @pytest.mark.asyncio
    async def test_returns_none_for_other_org(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        inquiry = _make_inquiry(
            organization_id=test_org.id, user_id=test_user.id,
        )
        db.add(inquiry)
        await db.commit()

        other_org = uuid.uuid4()
        assert await inquiry_repo.get_by_id(db, inquiry.id, other_org) is None


class TestInquiryRepoCreateAndUpdate:
    @pytest.mark.asyncio
    async def test_create_persists_with_pii_round_trip(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        now = _dt.datetime.now(_dt.timezone.utc)
        created = await inquiry_repo.create(
            db,
            organization_id=test_org.id,
            user_id=test_user.id,
            source="FF",
            external_inquiry_id="I-1",
            received_at=now,
            inquirer_name="Bob",
            inquirer_email="bob@example.com",
            inquirer_phone="555-1234",
        )
        await db.commit()

        fetched = await inquiry_repo.get_by_id(db, created.id, test_org.id)
        assert fetched is not None
        assert fetched.source == "FF"
        assert fetched.external_inquiry_id == "I-1"
        # PII columns round-trip via EncryptedString.
        assert fetched.inquirer_name == "Bob"
        assert fetched.inquirer_email == "bob@example.com"
        assert fetched.inquirer_phone == "555-1234"
        assert fetched.stage == "new"

    @pytest.mark.asyncio
    async def test_update_applies_allowlisted_fields(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        inquiry = _make_inquiry(
            organization_id=test_org.id, user_id=test_user.id,
        )
        db.add(inquiry)
        await db.commit()

        updated = await inquiry_repo.update_inquiry(
            db, inquiry.id, test_org.id,
            {"stage": "triaged", "gut_rating": 4, "notes": "promising"},
        )
        await db.commit()
        assert updated is not None
        assert updated.stage == "triaged"
        assert updated.gut_rating == 4
        assert updated.notes == "promising"

    @pytest.mark.asyncio
    async def test_update_drops_protected_fields(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        inquiry = _make_inquiry(
            organization_id=test_org.id, user_id=test_user.id, source="FF",
            external_inquiry_id="I-protected",
        )
        db.add(inquiry)
        await db.commit()
        original_org = inquiry.organization_id
        original_source = inquiry.source

        attacker_org = uuid.uuid4()
        updated = await inquiry_repo.update_inquiry(
            db, inquiry.id, test_org.id,
            {
                "organization_id": attacker_org,
                "user_id": uuid.uuid4(),
                "id": uuid.uuid4(),
                "source": "TNH",  # source is NOT in the allowlist
                "external_inquiry_id": "I-evil",
                "deleted_at": _dt.datetime.now(_dt.timezone.utc),
                "stage": "approved",  # legit allowlisted field
            },
        )
        await db.commit()
        assert updated is not None
        assert updated.organization_id == original_org
        assert updated.source == original_source
        assert updated.external_inquiry_id == "I-protected"
        assert updated.deleted_at is None
        assert updated.stage == "approved"

    @pytest.mark.asyncio
    async def test_update_returns_none_for_other_org(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        inquiry = _make_inquiry(
            organization_id=test_org.id, user_id=test_user.id,
        )
        db.add(inquiry)
        await db.commit()

        result = await inquiry_repo.update_inquiry(
            db, inquiry.id, uuid.uuid4(), {"stage": "triaged"},
        )
        assert result is None


class TestInquiryRepoSoftDelete:
    @pytest.mark.asyncio
    async def test_soft_delete_sets_deleted_at(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        inquiry = _make_inquiry(
            organization_id=test_org.id, user_id=test_user.id,
        )
        db.add(inquiry)
        await db.commit()

        ok = await inquiry_repo.soft_delete_by_id(db, inquiry.id, test_org.id)
        await db.commit()
        assert ok is True
        assert await inquiry_repo.get_by_id(db, inquiry.id, test_org.id) is None

    @pytest.mark.asyncio
    async def test_soft_delete_returns_false_for_other_org(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        inquiry = _make_inquiry(
            organization_id=test_org.id, user_id=test_user.id,
        )
        db.add(inquiry)
        await db.commit()

        ok = await inquiry_repo.soft_delete_by_id(db, inquiry.id, uuid.uuid4())
        assert ok is False


class TestInquiryRepoCount:
    @pytest.mark.asyncio
    async def test_count_excludes_soft_deleted(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        live = _make_inquiry(
            organization_id=test_org.id, user_id=test_user.id,
        )
        gone = _make_inquiry(
            organization_id=test_org.id, user_id=test_user.id,
            deleted_at=_dt.datetime.now(_dt.timezone.utc),
        )
        db.add_all([live, gone])
        await db.commit()
        assert await inquiry_repo.count_by_organization(db, test_org.id) == 1

    @pytest.mark.asyncio
    async def test_count_respects_stage_filter(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        for s in ("new", "new", "triaged"):
            db.add(_make_inquiry(
                organization_id=test_org.id, user_id=test_user.id, stage=s,
            ))
        await db.commit()
        assert await inquiry_repo.count_by_organization(db, test_org.id, stage="new") == 2
        assert await inquiry_repo.count_by_organization(db, test_org.id, stage="triaged") == 1

    @pytest.mark.asyncio
    async def test_count_isolates_by_org(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        db.add(_make_inquiry(
            organization_id=test_org.id, user_id=test_user.id,
        ))
        await db.commit()
        assert await inquiry_repo.count_by_organization(db, uuid.uuid4()) == 0


class TestListWithLastMessage:
    """The most important repo function in this PR — must NOT N+1.

    The test sets up 3 inquiries each with multiple messages and verifies
    every result attaches the truly-latest message body.
    """

    @pytest.mark.asyncio
    async def test_returns_latest_message_per_inquiry(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        now = _dt.datetime.now(_dt.timezone.utc)
        inquiries: list[Inquiry] = []
        for i in range(3):
            inq = _make_inquiry(
                organization_id=test_org.id, user_id=test_user.id,
                received_at=now - _dt.timedelta(hours=i),
                inquirer_name=f"Inquirer-{i}",
            )
            inquiries.append(inq)
            db.add(inq)
        await db.flush()

        # Add 3 messages per inquiry with increasing created_at.
        # The "latest" body should be the one with the highest created_at.
        for i, inq in enumerate(inquiries):
            for j in range(3):
                # Manually-set created_at via raw __init__ — SQLite + SQLA defaults
                # would otherwise stamp them at the same instant within a flush.
                msg = InquiryMessage(
                    inquiry_id=inq.id,
                    direction="inbound",
                    channel="email",
                    raw_email_body=f"body-{i}-{j}",
                    parsed_body=f"parsed-{i}-{j}",
                    created_at=now + _dt.timedelta(seconds=j),
                )
                db.add(msg)
        await db.commit()

        results = await inquiry_repo.list_with_last_message(db, test_org.id)
        assert len(results) == 3
        bodies = {r.id: r.last_message_preview for r in results}
        for inq in inquiries:
            # last message has j=2 (highest created_at); parsed_body wins over raw_email_body
            i = int(inq.inquirer_name.split("-")[1])
            assert bodies[inq.id] == f"parsed-{i}-2", (
                f"Expected latest parsed_body 'parsed-{i}-2', got {bodies[inq.id]!r}"
            )

    @pytest.mark.asyncio
    async def test_returns_null_preview_for_inquiry_without_messages(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        inq = _make_inquiry(
            organization_id=test_org.id, user_id=test_user.id,
            inquirer_name="No-msgs",
        )
        db.add(inq)
        await db.commit()

        results = await inquiry_repo.list_with_last_message(db, test_org.id)
        assert len(results) == 1
        assert results[0].last_message_preview is None
        assert results[0].last_message_at is None

    @pytest.mark.asyncio
    async def test_filters_by_stage(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        db.add_all([
            _make_inquiry(
                organization_id=test_org.id, user_id=test_user.id,
                stage="new", inquirer_name="N",
            ),
            _make_inquiry(
                organization_id=test_org.id, user_id=test_user.id,
                stage="triaged", inquirer_name="T",
            ),
        ])
        await db.commit()

        new_only = await inquiry_repo.list_with_last_message(
            db, test_org.id, stage="new",
        )
        assert len(new_only) == 1
        assert new_only[0].stage == "new"

    @pytest.mark.asyncio
    async def test_excludes_soft_deleted_and_other_orgs(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        db.add(_make_inquiry(
            organization_id=test_org.id, user_id=test_user.id,
            deleted_at=_dt.datetime.now(_dt.timezone.utc),
            inquirer_name="dead",
        ))
        db.add(_make_inquiry(
            organization_id=test_org.id, user_id=test_user.id,
            inquirer_name="live",
        ))
        await db.commit()

        results = await inquiry_repo.list_with_last_message(db, test_org.id)
        assert {r.inquirer_name for r in results} == {"live"}

        # Different org sees nothing.
        other = await inquiry_repo.list_with_last_message(db, uuid.uuid4())
        assert other == []

    @pytest.mark.asyncio
    async def test_orders_by_received_at_desc(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        now = _dt.datetime.now(_dt.timezone.utc)
        old = _make_inquiry(
            organization_id=test_org.id, user_id=test_user.id,
            received_at=now - _dt.timedelta(days=2), inquirer_name="OLD",
        )
        new = _make_inquiry(
            organization_id=test_org.id, user_id=test_user.id,
            received_at=now, inquirer_name="NEW",
        )
        mid = _make_inquiry(
            organization_id=test_org.id, user_id=test_user.id,
            received_at=now - _dt.timedelta(days=1), inquirer_name="MID",
        )
        db.add_all([old, new, mid])
        await db.commit()

        results = await inquiry_repo.list_with_last_message(db, test_org.id)
        assert [r.inquirer_name for r in results] == ["NEW", "MID", "OLD"]


class TestInquiryDedupHelpers:
    """The PR 2.2 reconciler relies on these — they MUST scope by tenant
    or else two orgs forwarding the same FF email would collide in dedup."""

    @pytest.mark.asyncio
    async def test_find_by_source_and_external_id_scoped_by_org(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        inq = _make_inquiry(
            organization_id=test_org.id, user_id=test_user.id,
            source="FF", external_inquiry_id="I-shared",
        )
        db.add(inq)
        await db.commit()

        match = await inquiry_repo.find_by_source_and_external_id(
            db, test_org.id, "FF", "I-shared",
        )
        assert match is not None
        assert match.id == inq.id

        # Different org returns None — no cross-org leak.
        other = await inquiry_repo.find_by_source_and_external_id(
            db, uuid.uuid4(), "FF", "I-shared",
        )
        assert other is None

    @pytest.mark.asyncio
    async def test_find_by_email_message_id_scoped_by_user(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        inq = _make_inquiry(
            organization_id=test_org.id, user_id=test_user.id,
            email_message_id="msg-99",
        )
        db.add(inq)
        await db.commit()

        match = await inquiry_repo.find_by_email_message_id(
            db, test_user.id, "msg-99",
        )
        assert match is not None
        assert match.id == inq.id

        other = await inquiry_repo.find_by_email_message_id(
            db, uuid.uuid4(), "msg-99",
        )
        assert other is None


class TestInquiryUniquenessMatrix:
    """Per CLAUDE.md: enumerate every composite-key combination for
    deduplication. The (organization_id, source, external_inquiry_id)
    partial UNIQUE has the following cases:
    """

    @pytest.mark.asyncio
    async def test_same_org_same_source_same_external_id_rejected(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        db.add(_make_inquiry(
            organization_id=test_org.id, user_id=test_user.id,
            source="FF", external_inquiry_id="I-collide",
        ))
        await db.commit()

        db.add(_make_inquiry(
            organization_id=test_org.id, user_id=test_user.id,
            source="FF", external_inquiry_id="I-collide",
        ))
        with pytest.raises(IntegrityError):
            await db.commit()
        await db.rollback()

    @pytest.mark.asyncio
    async def test_same_org_different_sources_same_external_id_allowed(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        """source is part of the partial UNIQUE — same external_id on FF and
        TNH for the same org is two distinct inquiries."""
        db.add(_make_inquiry(
            organization_id=test_org.id, user_id=test_user.id,
            source="FF", external_inquiry_id="I-same",
        ))
        db.add(_make_inquiry(
            organization_id=test_org.id, user_id=test_user.id,
            source="TNH", external_inquiry_id="I-same",
        ))
        await db.commit()  # must succeed

    @pytest.mark.asyncio
    async def test_different_orgs_same_source_same_external_id_allowed(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        """Two orgs can independently track FF inquiry "I-1" — partial
        UNIQUE is per-org, not global."""
        # Build a second org/user.
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
        await db.flush()

        db.add(_make_inquiry(
            organization_id=test_org.id, user_id=test_user.id,
            source="FF", external_inquiry_id="I-1",
        ))
        db.add(_make_inquiry(
            organization_id=org_b.id, user_id=user_b.id,
            source="FF", external_inquiry_id="I-1",
        ))
        await db.commit()  # must succeed

    @pytest.mark.asyncio
    async def test_manual_entry_with_null_external_id_can_repeat(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        """Partial UNIQUE only enforced WHERE external_inquiry_id IS NOT NULL
        — multiple direct inquiries with NULL external_id is valid."""
        for _ in range(3):
            db.add(_make_inquiry(
                organization_id=test_org.id, user_id=test_user.id,
                source="direct", external_inquiry_id=None,
            ))
        await db.commit()  # must succeed


class TestInquiryEmailMessageIdUniqueness:
    """The (user_id, email_message_id) partial UNIQUE prevents the same
    forwarded email being parsed twice into two inquiries."""

    @pytest.mark.asyncio
    async def test_same_user_same_message_id_rejected(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        db.add(_make_inquiry(
            organization_id=test_org.id, user_id=test_user.id,
            email_message_id="msg-1",
        ))
        await db.commit()

        db.add(_make_inquiry(
            organization_id=test_org.id, user_id=test_user.id,
            email_message_id="msg-1",
        ))
        with pytest.raises(IntegrityError):
            await db.commit()
        await db.rollback()


class TestInquiryTenantIsolation:
    @pytest.mark.asyncio
    async def test_two_orgs_see_only_their_inquiries(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        a = _make_inquiry(
            organization_id=test_org.id, user_id=test_user.id,
            inquirer_name="Org-A",
        )
        db.add(a)

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
        b = _make_inquiry(
            organization_id=org_b.id, user_id=user_b.id,
            inquirer_name="Org-B",
        )
        db.add(b)
        await db.commit()

        a_results = await inquiry_repo.list_with_last_message(db, test_org.id)
        assert {r.inquirer_name for r in a_results} == {"Org-A"}

        # Cross-org get returns None.
        assert await inquiry_repo.get_by_id(db, b.id, test_org.id) is None
        assert await inquiry_repo.get_by_id(db, a.id, org_b.id) is None
