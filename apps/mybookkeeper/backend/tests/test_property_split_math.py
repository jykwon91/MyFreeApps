"""Dividing an amount into per-property shares, to the cent."""
import re
import uuid
from decimal import Decimal

import pytest

from app.core.property_split_constants import (
    SPLIT_AMOUNTS_DONT_ADD_UP,
    SPLIT_NEEDS_TWO_PROPERTIES,
    SPLIT_PROPERTY_REPEATED,
    SPLIT_SHARE_NOT_CENTS,
    SPLIT_SHARE_NOT_POSITIVE,
    SPLIT_TOO_SMALL,
)
from app.services.transactions.property_split_error import PropertySplitError
from app.services.transactions.property_split_math import even_shares, rescaled_shares, validate_shares

A, B, C = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()


class TestEvenShares:
    def test_divides_exactly(self) -> None:
        assert even_shares(Decimal("90.00"), 3) == [Decimal("30.00")] * 3

    def test_odd_cent_goes_to_the_first_share(self) -> None:
        assert even_shares(Decimal("100.00"), 3) == [Decimal("33.34"), Decimal("33.33"), Decimal("33.33")]

    def test_two_odd_cents_go_to_the_first_two(self) -> None:
        assert even_shares(Decimal("100.01"), 3) == [Decimal("33.34"), Decimal("33.34"), Decimal("33.33")]

    def test_shares_always_add_up(self) -> None:
        for total in ("0.07", "1.00", "123.45", "9999.99"):
            for count in (2, 3, 4, 7):
                if Decimal(total) * 100 < count:
                    continue
                assert sum(even_shares(Decimal(total), count)) == Decimal(total)

    def test_one_property_is_not_a_split(self) -> None:
        with pytest.raises(PropertySplitError, match=re.escape(SPLIT_NEEDS_TWO_PROPERTIES)):
            even_shares(Decimal("10.00"), 1)

    def test_fewer_cents_than_properties(self) -> None:
        with pytest.raises(PropertySplitError, match=re.escape(SPLIT_TOO_SMALL)):
            even_shares(Decimal("0.02"), 3)


class TestRescaledShares:
    def test_keeps_the_proportions(self) -> None:
        assert rescaled_shares([Decimal("60.00"), Decimal("40.00")], Decimal("200.00")) == [
            Decimal("120.00"), Decimal("80.00"),
        ]

    def test_even_split_stays_even_with_the_odd_cent_first(self) -> None:
        shares = even_shares(Decimal("90.00"), 3)
        assert rescaled_shares(shares, Decimal("100.00")) == [
            Decimal("33.34"), Decimal("33.33"), Decimal("33.33"),
        ]

    def test_adds_up_to_the_new_total(self) -> None:
        result = rescaled_shares([Decimal("10.01"), Decimal("20.02"), Decimal("30.03")], Decimal("77.77"))
        assert sum(result) == Decimal("77.77")

    def test_rejects_a_share_rounded_to_nothing(self) -> None:
        with pytest.raises(PropertySplitError, match=re.escape(SPLIT_TOO_SMALL)):
            rescaled_shares([Decimal("99.99"), Decimal("0.01")], Decimal("1.00"))


class TestValidateShares:
    def test_accepts_shares_that_add_up(self) -> None:
        validate_shares(Decimal("100.00"), [(A, Decimal("50.00")), (B, Decimal("30.00")), (C, Decimal("20.00"))])

    @pytest.mark.parametrize(
        ("shares", "message"),
        [
            ([(A, Decimal("100.00"))], SPLIT_NEEDS_TWO_PROPERTIES),
            ([(A, Decimal("50.00")), (A, Decimal("50.00"))], SPLIT_PROPERTY_REPEATED),
            ([(A, Decimal("100.00")), (B, Decimal("0"))], SPLIT_SHARE_NOT_POSITIVE),
            ([(A, Decimal("50.005")), (B, Decimal("49.995"))], SPLIT_SHARE_NOT_CENTS),
            ([(A, Decimal("50.00")), (B, Decimal("49.99"))], SPLIT_AMOUNTS_DONT_ADD_UP),
            ([(A, Decimal("50.00")), (B, Decimal("50.01"))], SPLIT_AMOUNTS_DONT_ADD_UP),
        ],
    )
    def test_rejects(self, shares: list[tuple[uuid.UUID, Decimal]], message: str) -> None:
        with pytest.raises(PropertySplitError, match=re.escape(message)):
            validate_shares(Decimal("100.00"), shares)
