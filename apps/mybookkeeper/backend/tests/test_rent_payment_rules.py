"""Linking a payment to a tenant files the whole row as rent (pure)."""
from __future__ import annotations

import datetime as _dt
import uuid
from decimal import Decimal

from app.models.transactions.transaction import Transaction
from app.services.transactions.rent_payment_rules import file_as_rent


def _row(**fields: object) -> Transaction:
    values: dict[str, object] = dict(
        id=uuid.uuid4(), organization_id=uuid.uuid4(), user_id=uuid.uuid4(),
        transaction_date=_dt.date(2026, 11, 16), tax_year=2026, amount=Decimal("338.50"),
        transaction_type="income", category="uncategorized", tags=["uncategorized"],
        tax_relevant=False, schedule_e_line=None, transaction_scope="personal",
        spending_category_id=None, status="approved",
    )
    values.update(fields)
    return Transaction(**values)


def test_an_uncategorized_personal_bank_row_becomes_rent_on_the_rents_line() -> None:
    row = _row()
    file_as_rent(row)
    assert row.category == "rental_revenue"
    assert row.tags == ["rental_revenue"]
    assert row.tax_relevant is True
    assert row.schedule_e_line == "line_3_rents_received"
    assert row.transaction_scope == "rental"
    assert row.spending_category_id is None


def test_other_tags_are_kept() -> None:
    row = _row(tags=["uncategorized", "zelle"], transaction_scope="rental")
    file_as_rent(row)
    assert row.tags == ["rental_revenue", "zelle"]


def test_a_row_already_filed_as_rent_keeps_how_it_was_filed() -> None:
    row = _row(
        category="rental_revenue", tags=["rental_revenue"], tax_relevant=False,
        schedule_e_line=None, transaction_scope="business",
    )
    file_as_rent(row)
    assert row.tax_relevant is False
    assert row.schedule_e_line is None
    assert row.transaction_scope == "business"


def test_a_line_someone_chose_is_kept() -> None:
    row = _row(transaction_scope="rental", schedule_e_line="line_19_other", tax_relevant=True)
    file_as_rent(row)
    assert row.schedule_e_line == "line_19_other"
