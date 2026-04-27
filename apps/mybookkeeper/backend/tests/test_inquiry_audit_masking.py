"""Verify the audit listener masks PII columns on the inquiries domain.

Per RENTALS_PLAN.md §8.7: ``inquirer_*``, ``from_address``, ``to_address``
and ``notes`` are sensitive — even after column-level encryption, the audit
log must not capture decrypted PII (or the ciphertext, which leaks the
existence of a value).
"""
from __future__ import annotations

import datetime as _dt
import uuid

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import register_audit_listeners
from app.models.inquiries.inquiry import Inquiry
from app.models.organization.organization import Organization
from app.models.system.audit_log import AuditLog
from app.models.user.user import User


@pytest.fixture(autouse=True)
def _audit():
    register_audit_listeners()


class TestInquiryAuditMasking:
    @pytest.mark.asyncio
    async def test_pii_fields_are_masked_on_insert(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        plaintext_email = "alice@example.com"
        plaintext_name = "Alice the Nurse"
        plaintext_notes = "Working at TX Medical Center, has small dog."
        inq = Inquiry(
            id=uuid.uuid4(),
            organization_id=test_org.id,
            user_id=test_user.id,
            source="direct",
            stage="new",
            inquirer_name=plaintext_name,
            inquirer_email=plaintext_email,
            inquirer_phone="555-1234",
            inquirer_employer="St Lukes",
            notes=plaintext_notes,
            received_at=_dt.datetime.now(_dt.timezone.utc),
        )
        db.add(inq)
        await db.commit()

        rows = (await db.execute(
            select(AuditLog).where(
                AuditLog.table_name == "inquiries",
                AuditLog.record_id == str(inq.id),
                AuditLog.operation == "INSERT",
            ),
        )).scalars().all()

        masked = {r.field_name: r.new_value for r in rows}
        # Sensitive columns are masked.
        for sensitive in (
            "inquirer_name", "inquirer_email", "inquirer_phone",
            "inquirer_employer", "notes",
        ):
            assert masked.get(sensitive) == "***", (
                f"audit log for {sensitive} must be masked, got {masked.get(sensitive)!r}"
            )
        # Non-sensitive columns are NOT masked — confirm we still capture them.
        assert masked.get("source") == "direct"
        assert masked.get("stage") == "new"
        # And the plaintext PII never leaks into ANY audit row.
        for r in rows:
            if r.new_value is not None:
                assert plaintext_email not in r.new_value
                assert plaintext_name not in r.new_value
                assert plaintext_notes not in r.new_value
