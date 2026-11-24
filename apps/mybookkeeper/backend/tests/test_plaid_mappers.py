"""Pure Plaid → MBK mapping: account types, masks, balances, transaction
fields and spending categories, plus the bank-row classifier both Plaid and
CSV import share."""
from __future__ import annotations

import datetime as _dt
import uuid
from decimal import Decimal

import pytest

from app.core.financial_account_enums import ACCOUNT_TYPES
from app.core.plaid_category_constants import (
    PFC_DETAILED_TO_SPENDING_CATEGORY,
    PFC_PRIMARY_TO_SPENDING_CATEGORY,
    PLAID_SUBTYPE_TO_ACCOUNT_TYPE,
    PLAID_TYPE_TO_ACCOUNT_TYPE,
)
from app.core.spending_category_enums import DEFAULT_SPENDING_CATEGORIES
from app.mappers import plaid_account_mapper, plaid_transaction_mapper
from app.models.financial_accounts.financial_account import FinancialAccount
from app.schemas.plaid.wire.plaid_wire_account import PlaidWireAccount
from app.schemas.plaid.wire.plaid_wire_balances import PlaidWireBalances
from app.schemas.plaid.wire.plaid_wire_category import PlaidWireCategory
from app.schemas.plaid.wire.plaid_wire_transaction import PlaidWireTransaction
from app.services.transactions.bank_row_classifier import classify_bank_row


def _account(**fields: object) -> PlaidWireAccount:
    base: dict[str, object] = {"account_id": "acc-1", "name": "Total Checking", "type": "depository"}
    base.update(fields)
    return PlaidWireAccount(**base)


class TestAccountMapper:
    @pytest.mark.parametrize(
        ("plaid_type", "subtype", "expected"),
        [
            ("depository", "checking", "checking"),
            ("depository", "savings", "savings"),
            ("credit", "credit card", "credit_card"),
            ("loan", "mortgage", "mortgage"),
            ("loan", "student", "loan"),
            ("investment", "401k", "retirement"),
            ("investment", None, "brokerage"),
            ("other", None, "other_asset"),
        ],
    )
    def test_account_type(self, plaid_type: str, subtype: str | None, expected: str) -> None:
        assert plaid_account_mapper.account_type_for(_account(type=plaid_type, subtype=subtype)) == expected

    def test_every_mapped_type_is_a_real_account_type(self) -> None:
        mapped = set(PLAID_SUBTYPE_TO_ACCOUNT_TYPE.values()) | set(PLAID_TYPE_TO_ACCOUNT_TYPE.values())
        assert mapped <= set(ACCOUNT_TYPES)

    @pytest.mark.parametrize(
        ("mask", "expected"),
        [("1234", "1234"), ("00", "00"), ("123456789", "6789"), ("12-4", None), (None, None), ("", None)],
    )
    def test_mask_never_keeps_more_than_four(self, mask: str | None, expected: str | None) -> None:
        assert plaid_account_mapper.mask_for(_account(mask=mask)) == expected

    def test_balance_rounds_to_cents(self) -> None:
        account = _account(balances=PlaidWireBalances(current=Decimal("10.005")))
        assert plaid_account_mapper.balance_cents_for(account) == 1001
        assert plaid_account_mapper.balance_cents_for(_account()) is None

    def test_currency_falls_back_to_usd(self) -> None:
        assert plaid_account_mapper.currency_for(_account(balances=PlaidWireBalances(iso_currency_code="cad"))) == "CAD"
        assert plaid_account_mapper.currency_for(_account()) == "USD"

    def test_name_falls_back_when_blank(self) -> None:
        assert plaid_account_mapper.name_for(_account(name=" ", official_name="Official")) == "Official"

    def test_new_account_is_linked_with_the_chosen_scope(self) -> None:
        item_id = uuid.uuid4()
        account = plaid_account_mapper.new_account(
            _account(subtype="checking", mask="4321", balances=PlaidWireBalances(current=Decimal("5"))),
            user_id=uuid.uuid4(), organization_id=uuid.uuid4(), plaid_item_id=item_id,
            institution_name="Chase", default_transaction_scope="rental", today=_dt.date(2026, 11, 23),
        )
        assert (account.plaid_item_id, account.plaid_account_id) == (item_id, "acc-1")
        assert (account.default_transaction_scope, account.current_balance_cents) == ("rental", 500)
        assert account.balance_as_of == _dt.date(2026, 11, 23)


class TestTransactionMapper:
    def test_every_mapped_category_is_a_default_personal_category(self) -> None:
        mapped = set(PFC_DETAILED_TO_SPENDING_CATEGORY.values()) | set(PFC_PRIMARY_TO_SPENDING_CATEGORY.values())
        assert mapped <= set(DEFAULT_SPENDING_CATEGORIES)

    @pytest.mark.parametrize(
        ("primary", "detailed", "expected"),
        [
            ("FOOD_AND_DRINK", "FOOD_AND_DRINK_GROCERIES", "Groceries"),
            ("FOOD_AND_DRINK", "FOOD_AND_DRINK_FAST_FOOD", "Dining & restaurants"),
            ("RENT_AND_UTILITIES", "RENT_AND_UTILITIES_RENT", None),
            ("RENT_AND_UTILITIES", "RENT_AND_UTILITIES_GAS_AND_ELECTRICITY", "Personal utilities"),
            ("LOAN_PAYMENTS", None, None),
        ],
    )
    def test_spending_category(self, primary: str, detailed: str | None, expected: str | None) -> None:
        category = PlaidWireCategory(primary=primary, detailed=detailed)
        assert plaid_transaction_mapper.spending_category_name_for(category) == expected
        assert plaid_transaction_mapper.spending_category_name_for(None) is None

    def test_merchant_name_wins_over_the_raw_description(self) -> None:
        txn = PlaidWireTransaction(
            transaction_id="t", account_id="a", amount=Decimal("1"), date=_dt.date(2026, 11, 2),
            name="POS 4421 STARBUCKS #22", merchant_name="Starbucks",
        )
        assert plaid_transaction_mapper.vendor_for(txn) == "Starbucks"

    def test_new_transaction_takes_the_accounts_scope(self) -> None:
        account = FinancialAccount(
            id=uuid.uuid4(), organization_id=uuid.uuid4(), user_id=uuid.uuid4(),
            name="Checking", account_type="checking", default_transaction_scope="rental",
        )
        txn = PlaidWireTransaction(
            transaction_id="t-1", account_id="a", amount=Decimal("20"), date=_dt.date(2026, 11, 2), name="Lowe's",
            personal_finance_category=PlaidWireCategory(primary="HOME_IMPROVEMENT"),
        )
        row = plaid_transaction_mapper.new_transaction(
            txn, account=account,
            classification=classify_bank_row("Lowe's", Decimal("20"), "rental"),
            spending_category_id=None,
        )
        assert (row.external_source, row.external_id, row.external_category) == ("plaid", "t-1", "HOME_IMPROVEMENT")
        assert (row.transaction_scope, row.account_id, row.tax_year) == ("rental", account.id, 2026)


class TestBankRowClassifier:
    def test_money_out_is_an_expense_and_money_in_is_income(self) -> None:
        out = classify_bank_row("Corner Store", Decimal("12.50"), "personal")
        income = classify_bank_row("Payroll", Decimal("-900"), "personal")
        assert (out.transaction_type, out.amount) == ("expense", Decimal("12.50"))
        assert (income.transaction_type, income.amount) == ("income", Decimal("900"))

    def test_personal_rows_are_never_tax_relevant(self) -> None:
        assert classify_bank_row("Corner Store", Decimal("12.50"), "personal").tax_relevant is False
