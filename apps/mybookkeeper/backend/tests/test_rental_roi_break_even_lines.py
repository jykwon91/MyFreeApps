"""The lines behind a property's break-even: what they show, and that they add up to the cent."""
import uuid
from decimal import Decimal

from app.mappers.rental_roi_mapper import to_property_response
from app.services.analytics.rental_roi_figures import RentalRoiFigures
from app.services.analytics.rental_roi_loan import RentalRoiLoan
from app.services.analytics.rental_roi_math import compute_property_figures


def _loan(principal: int = 50_000, interest: int = 100_000, escrow: int | None = None) -> RentalRoiLoan:
    return RentalRoiLoan(
        monthly_principal_cents=principal,
        monthly_interest_cents=interest,
        monthly_escrow_cents=escrow,
        original_principal_cents=20_000_000,
    )


def _figures(
    totals: dict[str, str], *, months: int = 12, loans: list[RentalRoiLoan] | None = None,
) -> RentalRoiFigures:
    return compute_property_figures(
        category_totals={k: Decimal(v) for k, v in totals.items()},
        months=months,
        loans=loans or [],
        purchase_price=None,
        target_return_pct=Decimal(8),
    )


class TestOperatingLines:
    def test_show_the_total_and_monthly_share_biggest_first(self) -> None:
        figures = _figures({"utilities": "1200", "maintenance": "3600"})

        assert [(l.category, l.window_total, l.monthly) for l in figures.operating_lines] == [
            ("maintenance", Decimal(3600), Decimal(300)),
            ("utilities", Decimal(1200), Decimal(100)),
        ]

    def test_divide_by_the_months_in_service(self) -> None:
        assert _figures({"utilities": "1200"}, months=8).operating_lines[0].monthly == Decimal(150)


class TestMortgageLines:
    def test_a_loan_record_lists_its_parts_without_a_window_total(self) -> None:
        figures = _figures({}, loans=[_loan(escrow=30_000)])

        assert [(l.category, l.monthly, l.window_total) for l in figures.mortgage_lines] == [
            ("mortgage_principal", Decimal(500), None),
            ("mortgage_interest", Decimal(1000), None),
            ("mortgage_escrow", Decimal(300), None),
        ]

    def test_two_loans_add_together_and_a_missing_part_is_left_out(self) -> None:
        figures = _figures({}, loans=[_loan(), _loan()])

        assert [(l.category, l.monthly) for l in figures.mortgage_lines] == [
            ("mortgage_principal", Decimal(1000)),
            ("mortgage_interest", Decimal(2000)),
        ]

    def test_without_a_loan_record_they_come_from_transactions(self) -> None:
        figures = _figures({"mortgage_interest": "12000", "mortgage_principal": "6000"})

        assert [(l.category, l.monthly, l.window_total) for l in figures.mortgage_lines] == [
            ("mortgage_interest", Decimal(1000), Decimal(12000)),
            ("mortgage_principal", Decimal(500), Decimal(6000)),
        ]


class TestEscrowCoveredLines:
    def test_escrow_moves_taxes_and_insurance_out_of_operating(self) -> None:
        figures = _figures(
            {"taxes": "2400", "insurance": "1200", "utilities": "600"},
            loans=[_loan(escrow=30_000)],
        )

        assert [l.category for l in figures.operating_lines] == ["utilities"]
        assert [l.category for l in figures.escrow_covered_lines] == ["taxes", "insurance"]

    def test_without_escrow_they_stay_in_operating(self) -> None:
        figures = _figures({"taxes": "2400", "insurance": "1200"}, loans=[_loan()])

        assert [l.category for l in figures.operating_lines] == ["taxes", "insurance"]
        assert figures.escrow_covered_lines == ()

    def test_they_never_count_towards_break_even(self) -> None:
        figures = _figures({"taxes": "2400"}, loans=[_loan(escrow=30_000)])

        response = to_property_response(uuid.uuid4(), "Alpha", figures)

        assert response.break_even_monthly_cents == 180_000
        assert response.cost_breakdown.escrow_covered_lines[0].monthly_cents == 20_000


class TestAddingUp:
    def test_every_column_adds_up_to_the_cent(self) -> None:
        figures = _figures(
            {
                "utilities": "100",
                "maintenance": "100",
                "cleaning_expense": "100.01",
                "mortgage_interest": "1000.01",
                "mortgage_principal": "333.33",
            },
            months=7,
        )

        response = to_property_response(uuid.uuid4(), "Alpha", figures)
        costs = response.cost_breakdown

        assert sum(l.monthly_cents for l in costs.operating_lines) == costs.operating_monthly_cents
        assert sum(l.monthly_cents for l in costs.mortgage_lines) == costs.debt_service_monthly_cents
        assert costs.debt_service_monthly_cents + costs.operating_monthly_cents == response.break_even_monthly_cents
