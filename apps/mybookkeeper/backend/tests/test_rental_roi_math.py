"""Pure arithmetic behind the Rental ROI analytics — every formula and its null cases."""
from datetime import date
from decimal import Decimal

from app.core.tags import (
    RENTAL_ROI_DEBT_SERVICE_TAGS,
    RENTAL_ROI_OPERATING_TAGS,
    RENTAL_ROI_REVENUE_TAGS,
)
from app.mappers.rental_roi_mapper import to_cents
from app.services.analytics.rental_roi_figures import RentalRoiFigures
from app.services.analytics.rental_roi_loan import RentalRoiLoan
from app.services.analytics.rental_roi_math import (
    cash_invested,
    compute_property_figures,
    months_in_service,
    trailing_window,
)

WINDOW_START = date(2025, 11, 1)
WINDOW_END = date(2026, 10, 31)


def _loan(
    principal: int | None = 50_000,
    interest: int | None = 100_000,
    escrow: int | None = None,
    original: int | None = 20_000_000,
) -> RentalRoiLoan:
    return RentalRoiLoan(
        monthly_principal_cents=principal,
        monthly_interest_cents=interest,
        monthly_escrow_cents=escrow,
        original_principal_cents=original,
    )


def _figures(
    totals: dict[str, str],
    *,
    months: int = 12,
    loans: list[RentalRoiLoan] | None = None,
    purchase_price: str | None = None,
    pct: str = "8",
) -> RentalRoiFigures:
    return compute_property_figures(
        category_totals={k: Decimal(v) for k, v in totals.items()},
        months=months,
        loans=loans or [],
        purchase_price=Decimal(purchase_price) if purchase_price is not None else None,
        target_return_pct=Decimal(pct),
    )


class TestCategoryLists:
    def test_revenue_is_rent_and_cleaning_fees(self) -> None:
        assert RENTAL_ROI_REVENUE_TAGS == {"rental_revenue", "cleaning_fee_revenue"}

    def test_operating_excludes_the_loan_and_non_schedule_e_costs(self) -> None:
        assert not RENTAL_ROI_OPERATING_TAGS & RENTAL_ROI_DEBT_SERVICE_TAGS
        assert {
            "utilities", "contract_work", "maintenance", "taxes", "furnishings", "insurance",
        } <= RENTAL_ROI_OPERATING_TAGS
        assert "meals" not in RENTAL_ROI_OPERATING_TAGS
        assert "rental_revenue" not in RENTAL_ROI_OPERATING_TAGS


class TestTrailingWindow:
    def test_twelve_full_months_before_this_month(self) -> None:
        assert trailing_window(date(2026, 11, 17)) == (WINDOW_START, WINDOW_END)

    def test_january_wraps_the_year(self) -> None:
        assert trailing_window(date(2026, 1, 1)) == (date(2025, 1, 1), date(2025, 12, 31))


class TestMonthsInService:
    def test_unknown_date_is_the_whole_window(self) -> None:
        assert months_in_service(WINDOW_START, WINDOW_END, None) == 12

    def test_in_service_before_the_window_is_the_whole_window(self) -> None:
        assert months_in_service(WINDOW_START, WINDOW_END, date(2019, 3, 5)) == 12

    def test_in_service_mid_window_counts_from_its_month(self) -> None:
        assert months_in_service(WINDOW_START, WINDOW_END, date(2026, 7, 20)) == 4

    def test_in_service_after_the_window_is_at_least_one(self) -> None:
        assert months_in_service(WINDOW_START, WINDOW_END, date(2026, 11, 3)) == 1


class TestCashInvested:
    def test_price_less_borrowed(self) -> None:
        assert cash_invested(Decimal("250000"), [_loan(original=20_000_000)]) == Decimal("50000")

    def test_no_price_is_unknown(self) -> None:
        assert cash_invested(None, [_loan()]) is None

    def test_loans_covering_the_price_is_unknown(self) -> None:
        assert cash_invested(Decimal("200000"), [_loan(original=20_000_000)]) is None

    def test_unknown_loan_amount_is_unknown(self) -> None:
        assert cash_invested(Decimal("250000"), [_loan(original=None)]) is None

    def test_no_loans_is_the_whole_price(self) -> None:
        assert cash_invested(Decimal("250000"), []) == Decimal("250000")


class TestBreakEven:
    def test_from_transactions_only(self) -> None:
        f = _figures({
            "mortgage_interest": "12000", "mortgage_principal": "6000",
            "utilities": "2400", "maintenance": "1200", "rental_revenue": "30000",
        })
        assert f.mortgage_source == "transactions"
        assert f.debt_service_monthly == Decimal("1500")
        assert f.operating_monthly == Decimal("300")
        assert f.break_even_monthly == Decimal("1800")
        assert f.actual_revenue_monthly == Decimal("2500")

    def test_records_replace_mortgage_transactions(self) -> None:
        f = _figures(
            {"mortgage_interest": "99999", "utilities": "1200"},
            loans=[_loan(principal=50_000, interest=100_000, escrow=None)],
        )
        assert f.mortgage_source == "records"
        assert f.debt_service_monthly == Decimal("1500")
        assert f.break_even_monthly == Decimal("1600")

    def test_record_without_any_payment_falls_back_to_transactions(self) -> None:
        f = _figures(
            {"mortgage_interest": "1200"},
            loans=[_loan(principal=None, interest=None, escrow=None)],
        )
        assert f.mortgage_source == "transactions"
        assert f.debt_service_monthly == Decimal("100")

    def test_no_mortgage_anywhere(self) -> None:
        f = _figures({"utilities": "1200"})
        assert f.mortgage_source == "none"
        assert f.debt_service_monthly == Decimal("0")

    def test_categories_outside_schedule_e_are_ignored(self) -> None:
        f = _figures({"utilities": "1200", "meals": "5000"})
        assert f.operating_monthly == Decimal("100")

    def test_averages_over_months_in_service(self) -> None:
        f = _figures({"utilities": "400", "rental_revenue": "8000"}, months=4)
        assert f.operating_monthly == Decimal("100")
        assert f.actual_revenue_monthly == Decimal("2000")
        assert f.months_averaged == 4


class TestEscrow:
    def test_escrow_excludes_taxes_and_insurance_bills(self) -> None:
        f = _figures(
            {"taxes": "6000", "insurance": "2400", "utilities": "1200"},
            loans=[_loan(principal=50_000, interest=100_000, escrow=40_000)],
        )
        assert f.debt_service_monthly == Decimal("1900")
        assert f.operating_monthly == Decimal("100")
        assert f.break_even_monthly == Decimal("2000")

    def test_without_escrow_taxes_and_insurance_are_operating(self) -> None:
        f = _figures(
            {"taxes": "6000", "insurance": "2400", "utilities": "1200"},
            loans=[_loan(escrow=0)],
        )
        assert f.operating_monthly == Decimal("800")


class TestTarget:
    def test_target_adds_the_return_on_cash_invested(self) -> None:
        # 250k price, 200k loan: 50k invested; 8% of 50k / 12 = 333.33
        f = _figures(
            {"utilities": "1200", "rental_revenue": "24000"},
            loans=[_loan(original=20_000_000)],
            purchase_price="250000",
        )
        assert f.break_even_monthly == Decimal("1600")
        assert f.target_monthly is not None
        assert to_cents(f.target_monthly) == 193333
        assert f.gap_basis == "target"
        assert to_cents(f.gap_monthly) == 200000 - 193333

    def test_no_purchase_price_has_no_target_and_gaps_against_break_even(self) -> None:
        f = _figures({"utilities": "1200", "rental_revenue": "24000"})
        assert f.target_monthly is None
        assert f.has_purchase_price is False
        assert f.gap_basis == "break_even"
        assert f.gap_monthly == Decimal("1900")

    def test_zero_return_target_is_break_even(self) -> None:
        f = _figures({"utilities": "1200"}, purchase_price="100000", pct="0")
        assert f.target_monthly == f.break_even_monthly


class TestRatios:
    def test_noi_cap_rate_and_cash_on_cash(self) -> None:
        f = _figures(
            {"taxes": "6000", "utilities": "1200", "rental_revenue": "36000"},
            loans=[_loan(principal=50_000, interest=100_000, escrow=50_000, original=20_000_000)],
            purchase_price="250000",
        )
        # actual 3000, operating 100 (taxes escrowed), escrow 500: NOI 2400 x 12
        assert f.noi_annual == Decimal("28800")
        assert f.cap_rate_pct == Decimal("11.52")
        # break-even 2100: 900 x 12 / 50000
        assert f.cash_on_cash_pct == Decimal("21.60")

    def test_ratios_are_null_without_a_price(self) -> None:
        f = _figures({"rental_revenue": "36000"})
        assert f.cap_rate_pct is None
        assert f.cash_on_cash_pct is None
        assert f.noi_annual == Decimal("36000")


class TestToCents:
    def test_rounds_half_up_not_down(self) -> None:
        assert to_cents(Decimal("10.005")) == 1001
        assert to_cents(Decimal("10.004")) == 1000
        assert to_cents(Decimal("-10.005")) == -1001
