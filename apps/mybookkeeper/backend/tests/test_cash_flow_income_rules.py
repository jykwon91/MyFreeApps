"""Money arriving under your own name is yours coming back, not income — but
only a transfer (or a row with no bank category) is judged on the name. Pure."""
from __future__ import annotations

import datetime as _dt
import uuid
from decimal import Decimal

from app.repositories.cash_flow.income_row import IncomeRow
from app.services.cash_flow import income_rules

HOLDER = uuid.uuid4()
NAMES = {HOLDER: "Pat Doe"}


def _in(description: str, external_category: str | None, user_id: uuid.UUID | None = HOLDER) -> IncomeRow:
    return IncomeRow(
        id=uuid.uuid4(), transaction_date=_dt.date(2026, 10, 1), amount=Decimal("100"), vendor=None,
        description=description, category="uncategorized", transaction_scope="personal",
        external_category=external_category, account_user_id=user_id,
    )


def test_a_transfer_in_your_own_name_is_from_yourself() -> None:
    assert income_rules.is_from_self(_in("Cash App Pat Doe PPD", "TRANSFER_IN"), NAMES)
    assert income_rules.is_from_self(_in("Zelle from PAT DOE", None), NAMES)


def test_a_paycheck_printing_your_name_is_still_income() -> None:
    assert not income_rules.is_from_self(_in("PAYCHEX PAYROLL PAT DOE", "INCOME"), NAMES)


def test_someone_else_or_no_account_is_income() -> None:
    assert not income_rules.is_from_self(_in("Zelle from Sam Roe", "TRANSFER_IN"), NAMES)
    assert not income_rules.is_from_self(_in("Cash App Pat Doe", "TRANSFER_IN", user_id=None), NAMES)
