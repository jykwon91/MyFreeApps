"""Tests for what a category correction teaches about a vendor's other rows."""
import uuid
from datetime import date
from decimal import Decimal
from unittest.mock import AsyncMock, patch

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.tags import schedule_e_line_after_category_change
from app.models.classification.classification_rule import ClassificationRule
from app.models.organization.organization import Organization
from app.models.transactions.transaction import Transaction
from app.models.user.user import User
from app.services.classification import rule_learning_service


def _txn(org: Organization, user: User, category: str, line: str | None, **kwargs) -> Transaction:
    base = dict(
        id=uuid.uuid4(),
        organization_id=org.id,
        user_id=user.id,
        transaction_date=date(2025, 6, 15),
        tax_year=2025,
        vendor="Chase Mortgage",
        amount=Decimal("100.00"),
        transaction_type="expense",
        category=category,
        schedule_e_line=line,
        status="approved",
        tax_relevant=True,
    )
    base.update(kwargs)
    return Transaction(**base)


async def _correct(db: AsyncSession, user: User, txn: Transaction, old_category: str) -> int:
    with patch.object(rule_learning_service, "record_event", AsyncMock()):
        return await rule_learning_service.learn_from_correction(
            db,
            organization_id=txn.organization_id,
            user_id=user.id,
            transaction=txn,
            old_category=old_category,
        )


class TestMortgageCorrections:
    @pytest.mark.asyncio
    async def test_correcting_one_row_to_principal_leaves_the_vendors_interest_alone(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        corrected = _txn(test_org, test_user, "mortgage_principal", None)
        interest = _txn(test_org, test_user, "mortgage_interest", "line_12_mortgage_interest")
        db.add_all([corrected, interest])
        await db.flush()

        count = await _correct(db, test_user, corrected, "mortgage_interest")

        assert count == 0
        assert interest.category == "mortgage_interest"
        assert interest.schedule_e_line == "line_12_mortgage_interest"

    @pytest.mark.asyncio
    @pytest.mark.parametrize(
        "old_category,new_category",
        [
            ("mortgage_interest", "mortgage_principal"),
            ("mortgage_principal", "mortgage_interest"),
            ("uncategorized", "mortgage_principal"),
            ("uncategorized", "mortgage_interest"),
            ("mortgage_interest", "insurance"),
        ],
    )
    async def test_no_vendor_rule_is_learned(
        self, db: AsyncSession, test_user: User, test_org: Organization,
        old_category: str, new_category: str,
    ) -> None:
        corrected = _txn(test_org, test_user, new_category, None)
        db.add(corrected)
        await db.flush()

        await _correct(db, test_user, corrected, old_category)

        rules = (await db.execute(select(ClassificationRule))).scalars().all()
        assert rules == []


class TestRetroactiveLine:
    @pytest.mark.asyncio
    async def test_siblings_move_to_the_new_line(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        corrected = _txn(test_org, test_user, "insurance", "line_9_insurance", vendor="Acme")
        sibling = _txn(test_org, test_user, "other_expense", "line_19_other", vendor="Acme")
        db.add_all([corrected, sibling])
        await db.flush()

        count = await rule_learning_service._retroactive_category_fix(
            db, test_org.id, "Acme", "insurance", "other_expense", None, corrected.id,
        )

        assert count == 1
        assert sibling.category == "insurance"
        assert sibling.schedule_e_line == "line_9_insurance"

    @pytest.mark.asyncio
    async def test_a_line_someone_chose_stays(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        corrected = _txn(test_org, test_user, "insurance", "line_9_insurance", vendor="Acme")
        chosen = _txn(test_org, test_user, "other_expense", "line_13_other_interest", vendor="Acme")
        db.add_all([corrected, chosen])
        await db.flush()

        await rule_learning_service._retroactive_category_fix(
            db, test_org.id, "Acme", "insurance", "other_expense", None, corrected.id,
        )

        assert chosen.schedule_e_line == "line_13_other_interest"


class TestLineAfterCategoryChange:
    def test_follows_the_category(self) -> None:
        assert schedule_e_line_after_category_change(
            "line_12_mortgage_interest", "mortgage_interest", "mortgage_principal",
        ) is None
        assert schedule_e_line_after_category_change(
            None, "uncategorized", "mortgage_interest",
        ) == "line_12_mortgage_interest"

    def test_keeps_a_line_that_was_not_the_categorys_own(self) -> None:
        assert schedule_e_line_after_category_change(
            "line_13_other_interest", "other_expense", "insurance",
        ) == "line_13_other_interest"
