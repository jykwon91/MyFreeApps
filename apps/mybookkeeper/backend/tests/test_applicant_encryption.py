"""Verify every encrypted column on the Applicants domain round-trips
plaintext → ciphertext → plaintext correctly, AND that the raw stored value
is NOT plaintext.

Per RENTALS_PLAN.md §8.7: PII columns must be encrypted at rest. The
``EncryptedString`` TypeDecorator is exercised here against real ORM rows.
"""
from __future__ import annotations

import datetime as _dt
import uuid

import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.applicants.applicant import Applicant
from app.models.applicants.reference import Reference
from app.models.applicants.video_call_note import VideoCallNote
from app.models.organization.organization import Organization
from app.models.user.user import User


@pytest.fixture()
async def applicant(
    db: AsyncSession, test_user: User, test_org: Organization,
) -> Applicant:
    a = Applicant(
        id=uuid.uuid4(),
        organization_id=test_org.id, user_id=test_user.id,
        stage="lead",
    )
    db.add(a)
    await db.commit()
    return a


class TestApplicantPiiEncryption:
    @pytest.mark.parametrize(
        "field,plaintext",
        [
            ("legal_name", "Jane Q Public"),
            ("dob", "1985-07-22"),
            ("employer_or_hospital", "Methodist Hospital — Houston"),
            ("vehicle_make_model", "Honda Civic 2018 — silver"),
        ],
    )
    @pytest.mark.asyncio
    async def test_round_trip_via_orm(
        self, db: AsyncSession, test_user: User, test_org: Organization,
        field: str, plaintext: str,
    ) -> None:
        a = Applicant(
            id=uuid.uuid4(),
            organization_id=test_org.id, user_id=test_user.id,
            stage="lead",
            **{field: plaintext},
        )
        db.add(a)
        await db.commit()
        await db.refresh(a)
        assert getattr(a, field) == plaintext

    @pytest.mark.parametrize(
        "field,plaintext",
        [
            ("legal_name", "Jane Q Public"),
            ("dob", "1985-07-22"),
            ("employer_or_hospital", "Methodist Hospital"),
            ("vehicle_make_model", "Honda Civic 2018"),
        ],
    )
    @pytest.mark.asyncio
    async def test_db_stores_ciphertext_not_plaintext(
        self, db: AsyncSession, test_user: User, test_org: Organization,
        field: str, plaintext: str,
    ) -> None:
        a = Applicant(
            id=uuid.uuid4(),
            organization_id=test_org.id, user_id=test_user.id,
            stage="lead",
            **{field: plaintext},
        )
        db.add(a)
        await db.commit()

        raw = await db.execute(text(f"SELECT {field} FROM applicants"))
        stored = raw.scalar_one()
        assert stored is not None
        assert plaintext not in stored, (
            f"plaintext {plaintext!r} found in raw stored {field!r} — "
            f"encryption is not active"
        )
        assert stored.startswith("gAAAAA"), (
            f"expected Fernet ciphertext for {field!r}, got {stored[:20]!r}"
        )


class TestReferencePiiEncryption:
    @pytest.mark.asyncio
    async def test_reference_name_round_trip(
        self, db: AsyncSession, applicant: Applicant,
    ) -> None:
        plaintext = "Bob T Landlord"
        ref = Reference(
            id=uuid.uuid4(),
            applicant_id=applicant.id,
            relationship="landlord",
            reference_name=plaintext,
            reference_contact="other",
        )
        db.add(ref)
        await db.commit()
        await db.refresh(ref)
        assert ref.reference_name == plaintext

        raw = await db.execute(text("SELECT reference_name FROM applicant_references"))
        stored = raw.scalar_one()
        assert stored is not None
        assert plaintext not in stored
        assert stored.startswith("gAAAAA")

    @pytest.mark.asyncio
    async def test_reference_contact_round_trip(
        self, db: AsyncSession, applicant: Applicant,
    ) -> None:
        plaintext = "bob.landlord@example.com"
        ref = Reference(
            id=uuid.uuid4(),
            applicant_id=applicant.id,
            relationship="landlord",
            reference_name="other",
            reference_contact=plaintext,
        )
        db.add(ref)
        await db.commit()
        await db.refresh(ref)
        assert ref.reference_contact == plaintext

        raw = await db.execute(text("SELECT reference_contact FROM applicant_references"))
        stored = raw.scalar_one()
        assert stored is not None
        assert plaintext not in stored
        assert stored.startswith("gAAAAA")


class TestVideoCallNotePiiEncryption:
    @pytest.mark.asyncio
    async def test_notes_round_trip_and_ciphertext_at_rest(
        self, db: AsyncSession, applicant: Applicant,
    ) -> None:
        plaintext = (
            "Strong communicator. Minor concern: mentioned previous landlord "
            "dispute over deposit return — referred to attorney."
        )
        note = VideoCallNote(
            id=uuid.uuid4(),
            applicant_id=applicant.id,
            scheduled_at=_dt.datetime.now(_dt.timezone.utc),
            notes=plaintext,
        )
        db.add(note)
        await db.commit()
        await db.refresh(note)
        assert note.notes == plaintext

        raw = await db.execute(text("SELECT notes FROM video_call_notes"))
        stored = raw.scalar_one()
        assert stored is not None
        assert "previous landlord" not in stored
        assert "deposit return" not in stored
        assert stored.startswith("gAAAAA")

    @pytest.mark.asyncio
    async def test_long_notes_field_supports_10k_chars(
        self, db: AsyncSession, applicant: Applicant,
    ) -> None:
        """The notes column is sized for long observation blocks."""
        plaintext = "x" * 9000
        note = VideoCallNote(
            id=uuid.uuid4(),
            applicant_id=applicant.id,
            scheduled_at=_dt.datetime.now(_dt.timezone.utc),
            notes=plaintext,
        )
        db.add(note)
        await db.commit()
        await db.refresh(note)
        assert note.notes == plaintext


class TestEncryptionKeyVersion:
    @pytest.mark.asyncio
    async def test_applicant_key_version_default_is_one(
        self, db: AsyncSession, applicant: Applicant,
    ) -> None:
        await db.refresh(applicant)
        assert applicant.key_version == 1

    @pytest.mark.asyncio
    async def test_reference_key_version_default_is_one(
        self, db: AsyncSession, applicant: Applicant,
    ) -> None:
        ref = Reference(
            id=uuid.uuid4(),
            applicant_id=applicant.id,
            relationship="personal",
            reference_name="n", reference_contact="c",
        )
        db.add(ref)
        await db.commit()
        await db.refresh(ref)
        assert ref.key_version == 1

    @pytest.mark.asyncio
    async def test_video_call_note_key_version_default_is_one(
        self, db: AsyncSession, applicant: Applicant,
    ) -> None:
        note = VideoCallNote(
            id=uuid.uuid4(),
            applicant_id=applicant.id,
            scheduled_at=_dt.datetime.now(_dt.timezone.utc),
        )
        db.add(note)
        await db.commit()
        await db.refresh(note)
        assert note.key_version == 1
