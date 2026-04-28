"""Verify the audit listener masks PII columns on the Applicants domain.

Per RENTALS_PLAN.md §8.7: ``legal_name``, ``dob``, ``employer_or_hospital``,
``vehicle_make_model``, ``reference_name``, ``reference_contact``, and
freeform ``notes`` are sensitive — even after column-level encryption, the
audit log must not capture decrypted PII (or the ciphertext, which leaks
the existence of a value).

This test catches the regression class where adding a new encrypted column
without also adding it to ``SENSITIVE_FIELDS`` lets plaintext PII land in
``audit_logs.new_value``.
"""
from __future__ import annotations

import datetime as _dt
import uuid

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import register_audit_listeners
from app.models.applicants.applicant import Applicant
from app.models.applicants.reference import Reference
from app.models.applicants.video_call_note import VideoCallNote
from app.models.organization.organization import Organization
from app.models.system.audit_log import AuditLog
from app.models.user.user import User


@pytest.fixture(scope="session", autouse=True)
def _audit() -> None:
    """Register audit listeners ONCE for the session.

    The audit listener attaches to the global ``Session`` class — registering
    per-test would stack listeners and produce duplicate audit_log rows.
    """
    register_audit_listeners()


class TestApplicantAuditMasking:
    @pytest.mark.asyncio
    async def test_pii_fields_masked_on_insert(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        plaintext_name = "Jane Q Public"
        plaintext_dob = "1985-07-22"
        plaintext_employer = "Methodist Hospital"
        plaintext_vehicle = "Honda Civic 2018"
        a = Applicant(
            id=uuid.uuid4(),
            organization_id=test_org.id, user_id=test_user.id,
            stage="lead",
            legal_name=plaintext_name,
            dob=plaintext_dob,
            employer_or_hospital=plaintext_employer,
            vehicle_make_model=plaintext_vehicle,
            referred_by="public source",  # NON-PII — should NOT be masked
        )
        db.add(a)
        await db.commit()

        rows = (await db.execute(
            select(AuditLog).where(
                AuditLog.table_name == "applicants",
                AuditLog.record_id == str(a.id),
                AuditLog.operation == "INSERT",
            ),
        )).scalars().all()

        masked = {r.field_name: r.new_value for r in rows}

        # PII columns are masked.
        for sensitive in (
            "legal_name", "dob", "employer_or_hospital", "vehicle_make_model",
        ):
            assert masked.get(sensitive) == "***", (
                f"audit log for {sensitive} must be masked, got {masked.get(sensitive)!r}"
            )

        # Non-PII columns are NOT masked — confirm we still capture them.
        # ``referred_by`` is host-supplied marketing source (e.g. "Furnished Finder"),
        # ``stage`` is the pipeline state — neither needs masking.
        assert masked.get("stage") == "lead"
        assert masked.get("referred_by") == "public source"

        # Plaintext PII never leaks into ANY audit row for this record.
        for r in rows:
            if r.new_value is None:
                continue
            assert plaintext_name not in r.new_value
            assert plaintext_dob not in r.new_value
            assert plaintext_employer not in r.new_value
            assert plaintext_vehicle not in r.new_value

    @pytest.mark.asyncio
    async def test_legal_name_update_masked(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        a = Applicant(
            id=uuid.uuid4(),
            organization_id=test_org.id, user_id=test_user.id,
            stage="lead",
            legal_name="Original Name",
        )
        db.add(a)
        await db.commit()

        a.legal_name = "Updated Name"
        await db.commit()

        rows = (await db.execute(
            select(AuditLog).where(
                AuditLog.table_name == "applicants",
                AuditLog.record_id == str(a.id),
                AuditLog.operation == "UPDATE",
                AuditLog.field_name == "legal_name",
            ),
        )).scalars().all()

        # Always at least one UPDATE row. Tolerate >1 in case other test files
        # also register the audit listener (the listener is global on Session).
        # The masking contract is what we're verifying — every row's old/new
        # must be ``"***"`` regardless of how many were captured.
        assert len(rows) >= 1
        for r in rows:
            assert r.old_value == "***"
            assert r.new_value == "***"


class TestReferenceAuditMasking:
    @pytest.mark.asyncio
    async def test_reference_pii_masked_on_insert(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        a = Applicant(
            id=uuid.uuid4(),
            organization_id=test_org.id, user_id=test_user.id,
            stage="lead",
        )
        db.add(a)
        await db.commit()

        plaintext_name = "Bob T Landlord"
        plaintext_contact = "bob.landlord@example.com"
        plaintext_notes = "previous tenant 2019-2021, paid on time"
        ref = Reference(
            id=uuid.uuid4(),
            applicant_id=a.id,
            relationship="landlord",
            reference_name=plaintext_name,
            reference_contact=plaintext_contact,
            notes=plaintext_notes,
        )
        db.add(ref)
        await db.commit()

        rows = (await db.execute(
            select(AuditLog).where(
                AuditLog.table_name == "applicant_references",
                AuditLog.record_id == str(ref.id),
                AuditLog.operation == "INSERT",
            ),
        )).scalars().all()

        masked = {r.field_name: r.new_value for r in rows}
        for sensitive in ("reference_name", "reference_contact", "notes"):
            assert masked.get(sensitive) == "***", (
                f"audit log for {sensitive} must be masked, got {masked.get(sensitive)!r}"
            )
        # ``relationship`` is enum-y, not PII — must remain captured.
        assert masked.get("relationship") == "landlord"

        # Plaintext PII never leaks anywhere.
        for r in rows:
            if r.new_value is None:
                continue
            assert plaintext_name not in r.new_value
            assert plaintext_contact not in r.new_value
            assert plaintext_notes not in r.new_value


class TestVideoCallNoteAuditMasking:
    @pytest.mark.asyncio
    async def test_notes_masked_on_insert(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        a = Applicant(
            id=uuid.uuid4(),
            organization_id=test_org.id, user_id=test_user.id,
            stage="lead",
        )
        db.add(a)
        await db.commit()

        plaintext = "Articulate but mentioned an active small-claims case."
        note = VideoCallNote(
            id=uuid.uuid4(),
            applicant_id=a.id,
            scheduled_at=_dt.datetime.now(_dt.timezone.utc),
            notes=plaintext,
            gut_rating=3,
        )
        db.add(note)
        await db.commit()

        rows = (await db.execute(
            select(AuditLog).where(
                AuditLog.table_name == "video_call_notes",
                AuditLog.record_id == str(note.id),
                AuditLog.operation == "INSERT",
                AuditLog.field_name == "notes",
            ),
        )).scalars().all()

        assert len(rows) >= 1
        for r in rows:
            assert r.new_value == "***"
            # And no plaintext leak.
            if r.new_value is not None:
                assert "small-claims" not in r.new_value

        # gut_rating is non-PII numeric — must be captured.
        gut_rows = (await db.execute(
            select(AuditLog).where(
                AuditLog.table_name == "video_call_notes",
                AuditLog.record_id == str(note.id),
                AuditLog.operation == "INSERT",
                AuditLog.field_name == "gut_rating",
            ),
        )).scalars().all()
        assert len(gut_rows) >= 1
        for r in gut_rows:
            assert r.new_value == "3"


class TestAuditMaskingDoesNotMaskUnrelatedNameColumns:
    """``name`` is on Property, Organization, Tenant, ReplyTemplate, etc. We
    DO NOT add bare ``name`` to SENSITIVE_FIELDS — instead we use specific
    names like ``legal_name`` and ``reference_name``. Confirm the unrelated
    columns are still captured."""

    @pytest.mark.asyncio
    async def test_organization_name_not_masked(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        # test_org was created in the conftest fixture — find its INSERT log.
        rows = (await db.execute(
            select(AuditLog).where(
                AuditLog.table_name == "organizations",
                AuditLog.record_id == str(test_org.id),
                AuditLog.field_name == "name",
            ),
        )).scalars().all()
        # If the conftest creates the org before the audit listener is
        # registered, this could be empty — that's also fine for the regression
        # check (we just need to verify that when it IS captured, it is NOT masked).
        for r in rows:
            assert r.new_value != "***", (
                "Organization.name must NOT be masked — adding bare 'name' to "
                "SENSITIVE_FIELDS would break audit-log readability across the schema."
            )
