"""Dedup of peer-to-peer payments by payer identity.

P2P payments (Zelle/Venmo/Cash App) carry no property at extraction time and
their vendor is always the platform name, so the vendor/property dedup checks
can neither recognize a second notification of an already-attributed payment
nor tell two different payers apart. ``evaluate_dedup`` therefore dedups P2P
payments (those with a ``payer_name``) on the payer instead.

Composite-key matrix exercised below (incoming: payer P, amount A, date D):

  existing row                                     -> expected
  ------------------------------------------------    --------
  same payer, HAS property, within skip window      -> skip   (the reported bug)
  same payer, NO property, same day                 -> skip
  same payer, name differs only by case/whitespace  -> skip   (normalization)
  same payer, wider gap (4..14d)                    -> review (don't silently drop)
  same payer, outside detection window (>14d)       -> create (legit monthly rent)
  DIFFERENT payer, same amount + vendor, 1d apart   -> create (no false-merge)
  no payer_name (non-P2P)                           -> falls through to vendor path
"""
import uuid
from datetime import date, datetime, timezone
from decimal import Decimal

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.organization.organization import Organization
from app.models.properties.property import Property
from app.models.transactions.transaction import Transaction
from app.models.user.user import User
from app.services.extraction.dedup_service import evaluate_dedup

_AMOUNT = Decimal("1595.00")
_BASE_DATE = date(2026, 6, 1)


@pytest_asyncio.fixture()
async def user(db: AsyncSession) -> User:
    user = User(
        id=uuid.uuid4(), email="payerdedup@example.com", hashed_password="x",
        is_active=True, is_superuser=False, is_verified=True,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


@pytest_asyncio.fixture()
async def org(db: AsyncSession, user: User) -> Organization:
    org = Organization(id=uuid.uuid4(), name="Payer Org", created_by=user.id)
    db.add(org)
    await db.commit()
    await db.refresh(org)
    return org


async def _existing(
    db: AsyncSession, org: Organization, user: User, *,
    payer_name: str, txn_date: date = _BASE_DATE,
    property_id: uuid.UUID | None = None, vendor: str = "Zelle",
) -> Transaction:
    txn = Transaction(
        id=uuid.uuid4(), organization_id=org.id, user_id=user.id,
        vendor=vendor, transaction_date=txn_date, tax_year=txn_date.year,
        amount=_AMOUNT, transaction_type="income", category="rental_revenue",
        tags=["rental_revenue"], status="approved", payer_name=payer_name,
        property_id=property_id,
    )
    db.add(txn)
    await db.commit()
    await db.refresh(txn)
    return txn


async def _evaluate(
    db: AsyncSession, org: Organization, *, payer_name: str | None,
    txn_date: date, property_id: uuid.UUID | None = None, vendor: str = "Zelle",
):
    return await evaluate_dedup(
        db, organization_id=org.id, vendor=vendor,
        doc_date=datetime(txn_date.year, txn_date.month, txn_date.day, tzinfo=timezone.utc),
        amount=_AMOUNT, line_items=None, property_id=property_id,
        file_type="email", new_document_type="payment_confirmation",
        payer_name=payer_name,
    )


@pytest.mark.asyncio
async def test_same_payer_already_attributed_to_property_skips(db, user, org):
    """The reported bug: first copy got a property via attribution; the second
    notification (no property) must still dedup against it."""
    prop = Property(id=uuid.uuid4(), organization_id=org.id, user_id=user.id, name="6734 Peerless")
    db.add(prop)
    await db.commit()
    await _existing(db, org, user, payer_name="Prince Kapoor", txn_date=_BASE_DATE, property_id=prop.id)

    decision = await _evaluate(db, org, payer_name="Prince Kapoor", txn_date=date(2026, 6, 2), property_id=None)
    assert decision.action == "skip"


@pytest.mark.asyncio
async def test_same_payer_no_property_same_day_skips(db, user, org):
    await _existing(db, org, user, payer_name="Prince Kapoor", txn_date=_BASE_DATE)
    decision = await _evaluate(db, org, payer_name="Prince Kapoor", txn_date=_BASE_DATE)
    assert decision.action == "skip"


@pytest.mark.asyncio
async def test_same_payer_name_normalized_match_skips(db, user, org):
    await _existing(db, org, user, payer_name="Prince Kapoor", txn_date=_BASE_DATE)
    decision = await _evaluate(db, org, payer_name="  prince kapoor ", txn_date=date(2026, 6, 2))
    assert decision.action == "skip"


@pytest.mark.asyncio
async def test_same_payer_wider_gap_reviews(db, user, org):
    await _existing(db, org, user, payer_name="Prince Kapoor", txn_date=_BASE_DATE)
    decision = await _evaluate(db, org, payer_name="Prince Kapoor", txn_date=date(2026, 6, 8))  # 7d
    assert decision.action == "review"


@pytest.mark.asyncio
async def test_same_payer_outside_window_creates(db, user, org):
    """Same tenant, same rent, next month → a distinct legitimate payment."""
    await _existing(db, org, user, payer_name="Prince Kapoor", txn_date=date(2026, 5, 1))
    decision = await _evaluate(db, org, payer_name="Prince Kapoor", txn_date=_BASE_DATE)  # 31d
    assert decision.action == "create"


@pytest.mark.asyncio
async def test_different_payer_same_amount_creates(db, user, org):
    """Two different tenants paying the same amount via Zelle within a day must
    NOT be merged (regression: the vendor/property path would have skipped)."""
    await _existing(db, org, user, payer_name="Prince Kapoor", txn_date=_BASE_DATE)
    decision = await _evaluate(db, org, payer_name="Sarah Johnson", txn_date=date(2026, 6, 2))
    assert decision.action == "create"


@pytest.mark.asyncio
async def test_no_payer_name_falls_through_to_vendor_path(db, user, org):
    """Without a payer_name the P2P branch is skipped — an exact
    vendor+date+amount(+null property) match still skips, as before."""
    await _existing(db, org, user, payer_name="Prince Kapoor", txn_date=_BASE_DATE, vendor="AT&T")
    decision = await _evaluate(db, org, payer_name=None, txn_date=_BASE_DATE, vendor="AT&T")
    assert decision.action == "skip"
