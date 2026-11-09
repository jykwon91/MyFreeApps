from decimal import Decimal

import pytest

from app.core.parsers import to_decimal, to_text


class TestToDecimal:
    def test_bool_is_never_a_number(self) -> None:
        assert to_decimal(True) is None
        assert to_decimal(False) is None

    @pytest.mark.parametrize(("raw", "expected"), [
        (75000.0, Decimal("75000.0")), ("12.50", Decimal("12.50")), (7, Decimal("7")),
    ])
    def test_numbers(self, raw: object, expected: Decimal) -> None:
        assert to_decimal(raw) == expected

    @pytest.mark.parametrize("raw", ["TX", "", 0, None, {"a": 1}])
    def test_non_numbers_and_zero(self, raw: object) -> None:
        assert to_decimal(raw) is None


class TestToText:
    def test_structures_are_json(self) -> None:
        assert to_text({"a": 1}) == '{"a": 1}'
        assert to_text(["x"]) == '["x"]'

    def test_scalars_use_str(self) -> None:
        assert to_text(7) == "7"
        assert to_text("TX") == "TX"
