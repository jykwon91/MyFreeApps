"""The migration that re-keys loan payees and vendor rules on the one payee key, run on rows.

The default suite builds its schema from the models, so the migration's upgrade and
downgrade are run here directly against that schema. Also checked by hand on the
Postgres 18 dev DB: upgrade, downgrade, upgrade.
"""
from __future__ import annotations

import importlib.util
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from types import ModuleType, SimpleNamespace
from unittest.mock import patch

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Session

from app.models.classification.classification_rule import ClassificationRule
from app.models.organization.organization import Organization
from app.models.transactions.loan_payee import LoanPayee
from app.models.user.user import User

MIGRATION_FILE = (
    Path(__file__).resolve().parent.parent / "alembic" / "versions" / "payeekey261127_rekey_payees_on_one_key.py"
)
NOW = datetime(2026, 11, 27, tzinfo=timezone.utc)
# The loan payees tagged in production, as they were tagged.
PRODUCTION_TAGS = (
    ("Jason Kwon External F Jason Kwon WEB ID: 1313185515", "mortgage"),
    ("JPMORGAN CHASE CHASE ACH PPD ID: 1000008113", "mortgage"),
    ("Toyota Financial Services", "loan"),
)


def _migration() -> ModuleType:
    spec = importlib.util.spec_from_file_location("payeekey261127", MIGRATION_FILE)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


async def _run(db: AsyncSession, step: str) -> None:
    module = _migration()

    def run(session: Session) -> None:
        with patch.object(module, "op", SimpleNamespace(get_bind=session.connection)):
            getattr(module, step)()

    await db.run_sync(run)
    db.expire_all()


def _loan(org: Organization, user: User, display: str, kind: str, age_days: int) -> LoanPayee:
    return LoanPayee(
        id=uuid.uuid4(), organization_id=org.id, created_by_user_id=user.id, display_name=display,
        normalized_payee=" ".join(display.split()).casefold(), kind=kind, created_at=NOW - timedelta(days=age_days),
    )


def _rule(org: Organization, user: User, pattern: str, source: str, category: str, age_days: int) -> ClassificationRule:
    at = NOW - timedelta(days=age_days)
    return ClassificationRule(
        id=uuid.uuid4(), organization_id=org.id, match_type="vendor", match_pattern=pattern, category=category,
        source=source, created_by=user.id, created_at=at, updated_at=at,
    )


async def _loans(db: AsyncSession) -> set[tuple[str, str]]:
    return set((await db.execute(select(LoanPayee.normalized_payee, LoanPayee.kind))).tuples().all())


async def _rules(db: AsyncSession) -> set[tuple[str, str, str]]:
    rows = await db.execute(select(ClassificationRule.match_pattern, ClassificationRule.source, ClassificationRule.category))
    return set(rows.tuples().all())


@pytest.mark.asyncio
async def test_the_production_loan_payees_survive_the_re_key_and_the_downgrade(
    db: AsyncSession, test_user: User, test_org: Organization,
) -> None:
    db.add_all([_loan(test_org, test_user, display, kind, age) for age, (display, kind) in enumerate(PRODUCTION_TAGS)])
    await db.commit()
    before = await _loans(db)

    await _run(db, "upgrade")
    assert await _loans(db) == before == {
        ("jason kwon external f jason kwon web id: 1313185515", "mortgage"),
        ("jpmorgan chase chase ach ppd id: 1000008113", "mortgage"),
        ("toyota financial services", "loan"),
    }

    await _run(db, "downgrade")
    assert await _loans(db) == before


@pytest.mark.asyncio
async def test_two_tags_on_one_payee_keep_the_newest(
    db: AsyncSession, test_user: User, test_org: Organization,
) -> None:
    db.add_all([
        _loan(test_org, test_user, "Silvia 29520127614", "loan", 5),
        _loan(test_org, test_user, "Silvia 31715789323", "mortgage", 1),
    ])
    await db.commit()

    await _run(db, "upgrade")
    assert await _loans(db) == {("silvia", "mortgage")}

    await _run(db, "downgrade")
    assert await _loans(db) == {("silvia 31715789323", "mortgage")}


@pytest.mark.asyncio
async def test_rules_on_one_payee_keep_a_manual_one_then_the_newest(
    db: AsyncSession, test_user: User, test_org: Organization,
) -> None:
    db.add_all([
        _rule(test_org, test_user, "zelle payment to silvia", "manual", "cleaning_expense", 10),
        _rule(test_org, test_user, "zelle payment to silvia 31715789323", "user_correction", "maintenance", 1),
        _rule(test_org, test_user, "zelle payment to jason lawn guy jpm99cjlb7cn", "user_correction", "maintenance", 6),
        _rule(test_org, test_user, "zelle payment to jason lawn guy xk29pp01qz7", "user_correction", "cleaning_expense", 2),
        _rule(test_org, test_user, "home depot", "manual", "maintenance", 3),
    ])
    await db.commit()

    await _run(db, "upgrade")
    assert await _rules(db) == {
        ("silvia", "manual", "cleaning_expense"),
        ("jason lawn guy", "user_correction", "cleaning_expense"),
        ("home depot", "manual", "maintenance"),
    }

    # Vendor rule patterns stay re-keyed; the old code still matches them.
    await _run(db, "downgrade")
    assert {pattern for pattern, _, _ in await _rules(db)} == {"silvia", "jason lawn guy", "home depot"}
