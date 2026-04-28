"""Repository tests for ``video_call_note_repo``.

Covers:
- create / list_for_applicant / update_note
- Tenant isolation through Applicant join
- PII round-trip on notes via EncryptedString
- CheckConstraint: gut_rating outside 1..5 rejected
- Update allowlist: applicant_id NOT updatable
"""
from __future__ import annotations

import datetime as _dt
import uuid

import pytest
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.applicants.applicant import Applicant
from app.models.applicants.video_call_note import VideoCallNote
from app.models.organization.organization import Organization
from app.models.user.user import User
from app.repositories.applicants import video_call_note_repo


def _make_applicant(
    *, organization_id: uuid.UUID, user_id: uuid.UUID,
) -> Applicant:
    return Applicant(
        id=uuid.uuid4(),
        organization_id=organization_id, user_id=user_id,
        stage="lead",
    )


class TestVideoCallNoteRepoCreate:
    @pytest.mark.asyncio
    async def test_create_persists_with_pii_round_trip(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        a = _make_applicant(organization_id=test_org.id, user_id=test_user.id)
        db.add(a)
        await db.commit()

        note_text = "Strong candidate. Articulate, asked thoughtful questions."
        scheduled = _dt.datetime.now(_dt.timezone.utc)
        note = await video_call_note_repo.create(
            db, applicant_id=a.id, scheduled_at=scheduled,
            notes=note_text, gut_rating=4,
        )
        await db.commit()
        await db.refresh(note)

        assert note.notes == note_text  # PII round-trip
        assert note.gut_rating == 4
        # SQLite drops tz info on read; compare naive parts.
        assert note.scheduled_at.replace(tzinfo=None) == scheduled.replace(tzinfo=None)


class TestVideoCallNoteRepoList:
    @pytest.mark.asyncio
    async def test_list_returns_notes_for_owned_applicant(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        a = _make_applicant(organization_id=test_org.id, user_id=test_user.id)
        db.add(a)
        await db.commit()

        await video_call_note_repo.create(
            db, applicant_id=a.id,
            scheduled_at=_dt.datetime.now(_dt.timezone.utc),
            notes="first",
        )
        await db.commit()

        results = await video_call_note_repo.list_for_applicant(
            db, applicant_id=a.id,
            organization_id=test_org.id, user_id=test_user.id,
        )
        assert len(results) == 1
        assert results[0].notes == "first"

    @pytest.mark.asyncio
    async def test_list_returns_empty_for_other_user(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        a = _make_applicant(organization_id=test_org.id, user_id=test_user.id)
        db.add(a)
        await db.commit()

        await video_call_note_repo.create(
            db, applicant_id=a.id,
            scheduled_at=_dt.datetime.now(_dt.timezone.utc),
            notes="first",
        )
        await db.commit()

        results = await video_call_note_repo.list_for_applicant(
            db, applicant_id=a.id,
            organization_id=test_org.id, user_id=uuid.uuid4(),
        )
        assert results == []


class TestVideoCallNoteRepoUpdate:
    @pytest.mark.asyncio
    async def test_update_applies_allowlisted_fields(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        a = _make_applicant(organization_id=test_org.id, user_id=test_user.id)
        db.add(a)
        await db.commit()
        note = await video_call_note_repo.create(
            db, applicant_id=a.id,
            scheduled_at=_dt.datetime.now(_dt.timezone.utc),
            notes="initial",
        )
        await db.commit()

        completed = _dt.datetime.now(_dt.timezone.utc)
        updated = await video_call_note_repo.update_note(
            db, video_call_note_id=note.id,
            organization_id=test_org.id, user_id=test_user.id,
            fields={"notes": "revised", "gut_rating": 5, "completed_at": completed},
        )
        await db.commit()
        assert updated is not None
        assert updated.notes == "revised"
        assert updated.gut_rating == 5
        assert updated.completed_at is not None
        assert updated.completed_at.replace(tzinfo=None) == completed.replace(tzinfo=None)

    @pytest.mark.asyncio
    async def test_update_drops_protected_fields(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        a = _make_applicant(organization_id=test_org.id, user_id=test_user.id)
        db.add(a)
        await db.commit()
        note = await video_call_note_repo.create(
            db, applicant_id=a.id,
            scheduled_at=_dt.datetime.now(_dt.timezone.utc),
            notes="initial",
        )
        await db.commit()
        original_applicant_id = note.applicant_id

        attacker_applicant_id = uuid.uuid4()
        updated = await video_call_note_repo.update_note(
            db, video_call_note_id=note.id,
            organization_id=test_org.id, user_id=test_user.id,
            fields={
                "applicant_id": attacker_applicant_id,  # NOT in allowlist
                "notes": "still updates",  # in allowlist
            },
        )
        await db.commit()
        assert updated is not None
        assert updated.applicant_id == original_applicant_id
        assert updated.notes == "still updates"

    @pytest.mark.asyncio
    async def test_update_returns_none_for_other_org(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        a = _make_applicant(organization_id=test_org.id, user_id=test_user.id)
        db.add(a)
        await db.commit()
        note = await video_call_note_repo.create(
            db, applicant_id=a.id,
            scheduled_at=_dt.datetime.now(_dt.timezone.utc),
            notes="initial",
        )
        await db.commit()

        result = await video_call_note_repo.update_note(
            db, video_call_note_id=note.id,
            organization_id=uuid.uuid4(), user_id=test_user.id,
            fields={"notes": "x"},
        )
        assert result is None


class TestVideoCallNoteConstraints:
    @pytest.mark.asyncio
    async def test_gut_rating_zero_rejected(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        a = _make_applicant(organization_id=test_org.id, user_id=test_user.id)
        db.add(a)
        await db.commit()

        bad = VideoCallNote(
            applicant_id=a.id,
            scheduled_at=_dt.datetime.now(_dt.timezone.utc),
            gut_rating=0,
        )
        db.add(bad)
        with pytest.raises(IntegrityError):
            await db.commit()
        await db.rollback()

    @pytest.mark.asyncio
    async def test_gut_rating_six_rejected(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        a = _make_applicant(organization_id=test_org.id, user_id=test_user.id)
        db.add(a)
        await db.commit()

        bad = VideoCallNote(
            applicant_id=a.id,
            scheduled_at=_dt.datetime.now(_dt.timezone.utc),
            gut_rating=6,
        )
        db.add(bad)
        with pytest.raises(IntegrityError):
            await db.commit()
        await db.rollback()

    @pytest.mark.asyncio
    async def test_gut_rating_null_allowed(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        a = _make_applicant(organization_id=test_org.id, user_id=test_user.id)
        db.add(a)
        await db.commit()

        # Just creating without gut_rating should succeed.
        await video_call_note_repo.create(
            db, applicant_id=a.id,
            scheduled_at=_dt.datetime.now(_dt.timezone.utc),
        )
        await db.commit()
