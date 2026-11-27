"""A correction teaches one rule per payee, keyed without the payment reference, and
reinforces a rule the payee already has instead of adding a near-duplicate."""
import uuid
from datetime import date
from decimal import Decimal
from unittest.mock import AsyncMock, patch

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.classification.classification_rule import ClassificationRule
from app.models.organization.organization import Organization
from app.models.transactions.transaction import Transaction
from app.models.user.user import User
from app.repositories.classification import classification_rule_repo
from app.services.classification import rule_engine, rule_learning_service

SILVIA_1 = "Zelle payment to Silvia 29520127614"
SILVIA_2 = "Zelle payment to Silvia 31715789323"
LAWN_GUY = "Zelle payment to Jason Lawn Guy JPM99cjlb7cn"


def _txn(org: Organization, user: User, vendor: str, category: str = "uncategorized") -> Transaction:
    return Transaction(
        id=uuid.uuid4(),
        organization_id=org.id,
        user_id=user.id,
        transaction_date=date(2026, 11, 2),
        tax_year=2026,
        vendor=vendor,
        amount=Decimal("120.00"),
        transaction_type="expense",
        category=category,
        status="approved",
        tax_relevant=True,
    )


async def _correct(db: AsyncSession, user: User, txn: Transaction, category: str) -> int:
    old = txn.category
    txn.category = category
    with patch.object(rule_learning_service, "record_event", AsyncMock()):
        return await rule_learning_service.learn_from_correction(
            db, organization_id=txn.organization_id, user_id=user.id, transaction=txn, old_category=old,
        )


async def _rules(db: AsyncSession) -> list[ClassificationRule]:
    return list((await db.execute(select(ClassificationRule))).scalars().all())


async def _manual_rule(db: AsyncSession, org: Organization, user: User, pattern: str, category: str) -> ClassificationRule:
    return await classification_rule_repo.upsert_rule(
        db, organization_id=org.id, match_type="vendor", pattern=pattern, category=category,
        created_by=user.id, source="manual",
    )


class TestOneRulePerPayee:
    @pytest.mark.asyncio
    async def test_corrections_on_two_payments_learn_one_rule_without_the_reference(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        first, second = _txn(test_org, test_user, SILVIA_1), _txn(test_org, test_user, SILVIA_2)
        db.add_all([first, second])
        await db.flush()

        await _correct(db, test_user, first, "cleaning_expense")
        await _correct(db, test_user, second, "cleaning_expense")

        rules = await _rules(db)
        assert [(r.match_pattern, r.category) for r in rules] == [("silvia", "cleaning_expense")]

    @pytest.mark.asyncio
    async def test_a_confirmation_id_is_left_out_too(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        txn = _txn(test_org, test_user, LAWN_GUY)
        db.add(txn)
        await db.flush()

        await _correct(db, test_user, txn, "maintenance")

        assert [r.match_pattern for r in await _rules(db)] == ["jason lawn guy"]

    @pytest.mark.asyncio
    async def test_the_correction_reaches_the_payees_other_payments(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        corrected, sibling = _txn(test_org, test_user, SILVIA_1), _txn(test_org, test_user, SILVIA_2)
        other_payee = _txn(test_org, test_user, "Zelle payment to Silvio 31715789323")
        db.add_all([corrected, sibling, other_payee])
        await db.flush()

        count = await _correct(db, test_user, corrected, "cleaning_expense")

        assert count == 1
        assert sibling.category == "cleaning_expense"
        assert other_payee.category == "uncategorized"


class TestExistingRulesAreReinforced:
    @pytest.mark.asyncio
    async def test_a_manual_rule_on_the_payee_is_updated_and_stays_manual(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        manual = await _manual_rule(db, test_org, test_user, "Zelle payment to Silvia", "cleaning_expense")
        txn = _txn(test_org, test_user, SILVIA_2, category="cleaning_expense")
        db.add(txn)
        await db.flush()

        await _correct(db, test_user, txn, "maintenance")

        rules = await _rules(db)
        assert [r.id for r in rules] == [manual.id]
        assert (manual.category, manual.source) == ("maintenance", "manual")

    @pytest.mark.asyncio
    async def test_a_broader_rule_that_already_agrees_gets_no_near_duplicate(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        broad = await _manual_rule(db, test_org, test_user, "Zelle payment to Jason Law", "maintenance")
        txn = _txn(test_org, test_user, LAWN_GUY)
        db.add(txn)
        await db.flush()

        await _correct(db, test_user, txn, "maintenance")

        assert [r.id for r in await _rules(db)] == [broad.id]

    @pytest.mark.asyncio
    async def test_a_broader_rule_that_disagrees_is_left_alone_and_the_payees_own_rule_wins(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        broad = await _manual_rule(db, test_org, test_user, "Zelle payment to Jason Law", "maintenance")
        txn = _txn(test_org, test_user, LAWN_GUY)
        db.add(txn)
        await db.flush()

        await _correct(db, test_user, txn, "cleaning_expense")

        assert broad.category == "maintenance"
        matched = await rule_engine.find_vendor_rule(db, test_org.id, "Zelle payment to Jason Lawn Guy XK29PP01QZ7")
        assert matched is not None
        assert (matched.match_pattern, matched.category) == ("jason lawn guy", "cleaning_expense")


class TestMatchingUsesTheSameKey:
    @pytest.mark.asyncio
    async def test_a_rule_on_the_payee_matches_a_payment_with_a_reference(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        rule = await _manual_rule(db, test_org, test_user, "zelle payment to silvia", "cleaning_expense")

        assert await rule_engine.find_vendor_rule(db, test_org.id, SILVIA_2) is rule

    @pytest.mark.asyncio
    async def test_a_rule_made_from_a_full_descriptor_is_stored_on_the_payee(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        rule = await _manual_rule(db, test_org, test_user, SILVIA_1, "cleaning_expense")

        assert rule.match_pattern == "silvia"
        assert await rule_engine.find_vendor_rule(db, test_org.id, SILVIA_2) is rule

    @pytest.mark.asyncio
    async def test_digits_that_name_a_payee_keep_rules_apart(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        seven = await _manual_rule(db, test_org, test_user, "7-ELEVEN #33155", "other_expense")

        assert seven.match_pattern == "7-eleven"
        assert await rule_engine.find_vendor_rule(db, test_org.id, "7-ELEVEN #40112") is seven
        assert await rule_engine.find_vendor_rule(db, test_org.id, "ELEVEN MADISON PARK") is None

    @pytest.mark.asyncio
    async def test_one_payee_paid_through_another_app_matches_the_same_rule(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        rule = await _manual_rule(db, test_org, test_user, "zelle payment to silvia", "cleaning_expense")

        assert rule.match_pattern == "silvia"
        assert await rule_engine.find_vendor_rule(db, test_org.id, "Venmo payment to Silvia 8812004411") is rule

    @pytest.mark.asyncio
    async def test_a_short_payee_matches_only_where_a_word_starts(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        al = await _manual_rule(db, test_org, test_user, "Zelle payment to Al 29520127614", "maintenance")

        assert al.match_pattern == "al"
        assert await rule_engine.find_vendor_rule(db, test_org.id, "WALMART #1234") is None
        assert await rule_engine.find_vendor_rule(db, test_org.id, "Zelle to Al 31715789323") is al
