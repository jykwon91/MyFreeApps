"""Verify the audit listener masks the loan account number.

``account_number`` is an ``EncryptedString`` column, but the audit listener
reads attribute values BEFORE the bind-time encryption hook fires — so the
plaintext number reaches the listener. Without an entry in
``MBK_SENSITIVE_FIELDS`` it would be written into ``audit_logs.new_value`` in
the clear, which is the one place a loan account number must never appear.

The insurance version of this feature learned the same lesson for
``policy_number``; this is the mortgage half of it.
"""
from __future__ import annotations

import uuid
from decimal import Decimal

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.mortgage_enums import RATE_TYPE_FIXED
from app.models.mortgage.mortgage import Mortgage
from app.models.organization.organization import Organization
from app.models.properties.property import Property
from app.models.system.audit_log import AuditLog
from app.models.user.user import User

PLAINTEXT_ACCOUNT = "240224944"


@pytest.fixture(autouse=True)
def _audit(audit_listeners):
    """Attach the audit listener for this module's tests only — see the
    shared ``audit_listeners`` fixture for why it must be detached after."""


async def _property(db: AsyncSession, user: User, org: Organization) -> Property:
    prop = Property(
        id=uuid.uuid4(),
        organization_id=org.id,
        user_id=user.id,
        name="6734 Peerless",
    )
    db.add(prop)
    await db.flush()
    return prop


class TestMortgageAuditMasking:
    @pytest.mark.asyncio
    async def test_account_number_masked_on_insert(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        prop = await _property(db, test_user, test_org)

        mortgage = Mortgage(
            id=uuid.uuid4(),
            user_id=test_user.id,
            organization_id=test_org.id,
            property_id=prop.id,
            lender="TDECU",
            account_number=PLAINTEXT_ACCOUNT,
            rate_type=RATE_TYPE_FIXED,
            interest_rate=Decimal("7.125"),
        )
        db.add(mortgage)
        await db.commit()

        rows = (await db.execute(
            select(AuditLog).where(
                AuditLog.table_name == "mortgages",
                AuditLog.record_id == str(mortgage.id),
                AuditLog.operation == "INSERT",
            ),
        )).scalars().all()

        captured = {r.field_name: r.new_value for r in rows}
        assert captured.get("account_number") == "***"
        # The lender is not a secret — masking everything would make the log
        # useless, so the check has to prove the mask is selective.
        assert captured.get("lender") == "TDECU"
        for row in rows:
            if row.new_value is not None:
                assert PLAINTEXT_ACCOUNT not in row.new_value

    @pytest.mark.asyncio
    async def test_account_number_masked_on_update(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        """An edit writes both the old and new value — both are the number."""
        prop = await _property(db, test_user, test_org)

        mortgage = Mortgage(
            id=uuid.uuid4(),
            user_id=test_user.id,
            organization_id=test_org.id,
            property_id=prop.id,
            account_number="000000000",
            rate_type=RATE_TYPE_FIXED,
        )
        db.add(mortgage)
        await db.commit()

        mortgage.account_number = PLAINTEXT_ACCOUNT
        await db.commit()

        rows = (await db.execute(
            select(AuditLog).where(
                AuditLog.table_name == "mortgages",
                AuditLog.record_id == str(mortgage.id),
                AuditLog.operation == "UPDATE",
                AuditLog.field_name == "account_number",
            ),
        )).scalars().all()

        assert rows, "an account-number change must still be audited"
        for row in rows:
            assert row.new_value == "***"
            assert row.old_value == "***"
