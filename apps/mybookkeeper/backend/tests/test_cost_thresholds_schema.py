import math
from decimal import Decimal

import pytest
from pydantic import ValidationError

from app.schemas.system.cost import CostThresholdsUpdate

FIELDS = [
    "daily_budget",
    "monthly_budget",
    "per_user_daily_alert",
    "input_rate_per_million",
    "output_rate_per_million",
]


@pytest.mark.parametrize("field", FIELDS)
@pytest.mark.parametrize("value", [0, 12.5, 100000])
def test_accepts_zero_and_positive(field: str, value: float) -> None:
    assert getattr(CostThresholdsUpdate(**{field: value}), field) == Decimal(str(value))


@pytest.mark.parametrize("field", FIELDS)
@pytest.mark.parametrize("value", [-0.01, -5, math.inf, math.nan])
def test_refuses_negative_and_non_finite(field: str, value: float) -> None:
    with pytest.raises(ValidationError):
        CostThresholdsUpdate(**{field: value})


def test_omitted_fields_stay_unset() -> None:
    update = CostThresholdsUpdate(daily_budget=10)
    assert update.model_dump(exclude_unset=True) == {"daily_budget": Decimal(10)}


@pytest.mark.parametrize("field", FIELDS)
def test_refuses_explicit_null(field: str) -> None:
    with pytest.raises(ValidationError):
        CostThresholdsUpdate(**{field: None})


@pytest.mark.parametrize("field", ["daily_budget", "monthly_budget", "per_user_daily_alert"])
@pytest.mark.parametrize("value", ["12.345", "100000000"])
def test_budget_must_fit_numeric_10_2(field: str, value: str) -> None:
    with pytest.raises(ValidationError):
        CostThresholdsUpdate(**{field: value})


@pytest.mark.parametrize("field", ["input_rate_per_million", "output_rate_per_million"])
def test_rate_keeps_four_decimals_and_fits_numeric_10_4(field: str) -> None:
    assert getattr(CostThresholdsUpdate(**{field: "3.1234"}), field) == Decimal("3.1234")
    for bad in ("3.12345", "1000000"):
        with pytest.raises(ValidationError):
            CostThresholdsUpdate(**{field: bad})
