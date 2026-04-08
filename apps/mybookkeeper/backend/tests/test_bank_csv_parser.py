"""Tests for bank CSV parser — format detection, parsing, and dedup."""
import uuid
from decimal import Decimal

import pytest

from app.services.transactions.bank_csv_parser import detect_bank_format, parse_bank_csv, _make_external_id


ORG_ID = uuid.uuid4()
USER_ID = uuid.uuid4()

CHASE_CSV = """Details,Posting Date,Description,Amount,Type,Balance,Check or Slip #
DEBIT,06/15/2025,CENTERPOINT ENERGY,-150.00,DEBIT_CARD,5000.00,
CREDIT,06/14/2025,RENT PAYMENT JOHN,2500.00,CREDIT,7500.00,
DEBIT,06/13/2025,HOME DEPOT,-89.99,DEBIT_CARD,5000.00,
"""

WELLSFARGO_CSV = """06/15/2025,-150.00,*,*,CENTERPOINT ENERGY
06/14/2025,2500.00,*,*,RENT PAYMENT
06/13/2025,-89.99,*,*,HOME DEPOT
"""

BOFA_CSV = """Date,Description,Amount,Running Bal.
06/15/2025,CENTERPOINT ENERGY,-150.00,5000.00
06/14/2025,RENT PAYMENT JOHN,2500.00,7500.00
06/13/2025,HOME DEPOT,-89.99,5000.00
"""

GENERIC_CSV = """Date,Description,Amount
06/15/2025,Centerpoint Energy,-150.00
06/14/2025,Rent Payment John,2500.00
06/13/2025,Home Depot,-89.99
"""

GENERIC_DEBIT_CREDIT_CSV = """Transaction Date,Description,Debit,Credit
06/15/2025,Centerpoint Energy,150.00,
06/14/2025,Rent Payment John,,2500.00
06/13/2025,Home Depot,89.99,
"""


class TestDetectBankFormat:
    def test_detects_chase(self) -> None:
        assert detect_bank_format(CHASE_CSV) == "chase"

    def test_detects_wellsfargo(self) -> None:
        assert detect_bank_format(WELLSFARGO_CSV) == "wellsfargo"

    def test_detects_bofa(self) -> None:
        assert detect_bank_format(BOFA_CSV) == "bofa"

    def test_detects_generic(self) -> None:
        assert detect_bank_format(GENERIC_CSV) == "generic"

    def test_detects_generic_debit_credit(self) -> None:
        assert detect_bank_format(GENERIC_DEBIT_CREDIT_CSV) == "generic"

    def test_unknown_for_empty(self) -> None:
        assert detect_bank_format("") == "unknown"

    def test_unknown_for_garbage(self) -> None:
        assert detect_bank_format("random garbage data\nno structure here") == "unknown"


class TestParseChase:
    def test_parses_correct_count(self) -> None:
        result = parse_bank_csv(CHASE_CSV, ORG_ID, USER_ID)
        assert len(result) == 3

    def test_debit_is_expense(self) -> None:
        result = parse_bank_csv(CHASE_CSV, ORG_ID, USER_ID)
        centerpoint = next(t for t in result if "CENTERPOINT" in (t.vendor or ""))
        assert centerpoint.transaction_type == "expense"
        assert centerpoint.amount == Decimal("150.00")

    def test_credit_is_income(self) -> None:
        result = parse_bank_csv(CHASE_CSV, ORG_ID, USER_ID)
        rent = next(t for t in result if "RENT" in (t.vendor or ""))
        assert rent.transaction_type == "income"
        assert rent.amount == Decimal("2500.00")

    def test_external_source_set(self) -> None:
        result = parse_bank_csv(CHASE_CSV, ORG_ID, USER_ID)
        for txn in result:
            assert txn.external_source == "bank_csv"
            assert txn.external_id is not None

    def test_status_is_approved(self) -> None:
        result = parse_bank_csv(CHASE_CSV, ORG_ID, USER_ID)
        for txn in result:
            assert txn.status == "approved"

    def test_sender_category_matching(self) -> None:
        result = parse_bank_csv(CHASE_CSV, ORG_ID, USER_ID)
        centerpoint = next(t for t in result if "CENTERPOINT" in (t.vendor or ""))
        assert centerpoint.category == "utilities"


class TestParseWellsFargo:
    def test_parses_correct_count(self) -> None:
        result = parse_bank_csv(WELLSFARGO_CSV, ORG_ID, USER_ID)
        assert len(result) == 3

    def test_negative_amount_is_expense(self) -> None:
        result = parse_bank_csv(WELLSFARGO_CSV, ORG_ID, USER_ID)
        centerpoint = next(t for t in result if "CENTERPOINT" in (t.vendor or ""))
        assert centerpoint.transaction_type == "expense"
        assert centerpoint.amount == Decimal("150.00")

    def test_positive_amount_is_income(self) -> None:
        result = parse_bank_csv(WELLSFARGO_CSV, ORG_ID, USER_ID)
        rent = next(t for t in result if "RENT" in (t.vendor or ""))
        assert rent.transaction_type == "income"
        assert rent.amount == Decimal("2500.00")


class TestParseBankOfAmerica:
    def test_parses_correct_count(self) -> None:
        result = parse_bank_csv(BOFA_CSV, ORG_ID, USER_ID)
        assert len(result) == 3

    def test_negative_amount_is_expense(self) -> None:
        result = parse_bank_csv(BOFA_CSV, ORG_ID, USER_ID)
        centerpoint = next(t for t in result if "CENTERPOINT" in (t.vendor or ""))
        assert centerpoint.transaction_type == "expense"
        assert centerpoint.amount == Decimal("150.00")


class TestParseGeneric:
    def test_parses_standard_generic(self) -> None:
        result = parse_bank_csv(GENERIC_CSV, ORG_ID, USER_ID)
        assert len(result) == 3

    def test_parses_debit_credit_columns(self) -> None:
        result = parse_bank_csv(GENERIC_DEBIT_CREDIT_CSV, ORG_ID, USER_ID)
        assert len(result) == 3
        debit_txn = next(t for t in result if "Centerpoint" in (t.vendor or ""))
        assert debit_txn.transaction_type == "expense"
        assert debit_txn.amount == Decimal("150.00")

        credit_txn = next(t for t in result if "Rent" in (t.vendor or ""))
        assert credit_txn.transaction_type == "income"
        assert credit_txn.amount == Decimal("2500.00")

    def test_property_id_assignment(self) -> None:
        prop_id = uuid.uuid4()
        result = parse_bank_csv(GENERIC_CSV, ORG_ID, USER_ID, prop_id)
        for txn in result:
            assert txn.property_id == prop_id


class TestDedup:
    def test_same_data_produces_same_external_id(self) -> None:
        from datetime import date
        d = date(2025, 6, 15)
        id1 = _make_external_id(d, Decimal("150.00"), "CENTERPOINT ENERGY")
        id2 = _make_external_id(d, Decimal("150.00"), "CENTERPOINT ENERGY")
        assert id1 == id2

    def test_different_description_produces_different_id(self) -> None:
        from datetime import date
        d = date(2025, 6, 15)
        id1 = _make_external_id(d, Decimal("150.00"), "CENTERPOINT ENERGY")
        id2 = _make_external_id(d, Decimal("150.00"), "HOME DEPOT")
        assert id1 != id2

    def test_different_amount_produces_different_id(self) -> None:
        from datetime import date
        d = date(2025, 6, 15)
        id1 = _make_external_id(d, Decimal("150.00"), "CENTERPOINT")
        id2 = _make_external_id(d, Decimal("200.00"), "CENTERPOINT")
        assert id1 != id2

    def test_same_csv_parsed_twice_produces_identical_external_ids(self) -> None:
        result1 = parse_bank_csv(CHASE_CSV, ORG_ID, USER_ID)
        result2 = parse_bank_csv(CHASE_CSV, ORG_ID, USER_ID)
        ids1 = {t.external_id for t in result1}
        ids2 = {t.external_id for t in result2}
        assert ids1 == ids2


class TestSenderCategoryMatching:
    def test_centerpoint_maps_to_utilities(self) -> None:
        result = parse_bank_csv(CHASE_CSV, ORG_ID, USER_ID)
        centerpoint = next(t for t in result if "CENTERPOINT" in (t.vendor or ""))
        assert centerpoint.category == "utilities"

    def test_unknown_vendor_maps_to_uncategorized(self) -> None:
        result = parse_bank_csv(CHASE_CSV, ORG_ID, USER_ID)
        home_depot = next(t for t in result if "HOME DEPOT" in (t.vendor or ""))
        assert home_depot.category == "uncategorized"

    def test_tax_relevant_when_categorized(self) -> None:
        result = parse_bank_csv(CHASE_CSV, ORG_ID, USER_ID)
        centerpoint = next(t for t in result if "CENTERPOINT" in (t.vendor or ""))
        assert centerpoint.tax_relevant is True

    def test_not_tax_relevant_when_uncategorized(self) -> None:
        result = parse_bank_csv(CHASE_CSV, ORG_ID, USER_ID)
        home_depot = next(t for t in result if "HOME DEPOT" in (t.vendor or ""))
        assert home_depot.tax_relevant is False


class TestNegativeAmounts:
    def test_chase_negative_is_expense(self) -> None:
        result = parse_bank_csv(CHASE_CSV, ORG_ID, USER_ID)
        expenses = [t for t in result if t.transaction_type == "expense"]
        for t in expenses:
            assert t.amount > 0

    def test_chase_positive_is_income(self) -> None:
        result = parse_bank_csv(CHASE_CSV, ORG_ID, USER_ID)
        incomes = [t for t in result if t.transaction_type == "income"]
        for t in incomes:
            assert t.amount > 0

    def test_all_amounts_positive_after_parsing(self) -> None:
        for csv_data in [CHASE_CSV, WELLSFARGO_CSV, BOFA_CSV, GENERIC_CSV]:
            result = parse_bank_csv(csv_data, ORG_ID, USER_ID)
            for t in result:
                assert t.amount > 0, f"Negative amount found: {t.amount} in {t.vendor}"


class TestUnknownFormat:
    def test_returns_empty_for_unknown(self) -> None:
        result = parse_bank_csv("garbage,data\nfoo,bar", ORG_ID, USER_ID)
        assert result == []
