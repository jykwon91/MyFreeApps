"""Tests for the Peerless utility-plan seed data and its parameter mapping.

The seed rows are hand-transcribed from provider email, so the risk they carry
is a typo that the database would reject at INSERT time — after the operator
has already run the command against production. These assertions move each
CHECK constraint's failure to the test suite, and pin the two figures the seed
deliberately leaves unknown so a future edit cannot quietly invent them.
"""
from __future__ import annotations

import datetime as _dt
import uuid
from decimal import Decimal
from types import SimpleNamespace

import pytest

from app.cli.migrate_data import _plan_params
from app.cli.peerless_utility_plan_seed import PEERLESS_UTILITY_PLANS
from app.cli.utility_plan_seed_row import UtilityPlanSeedRow
from app.core.utility_plan_constants import (
    RATE_TYPE_FIXED,
    RATE_TYPE_REGULATED,
    RATE_TYPES,
    SERVICE_TYPE_ELECTRICITY,
    SERVICE_TYPE_NATURAL_GAS,
    SERVICE_TYPES,
)


_TERM_2026_START = _dt.date(2026, 2, 17)
_TERM_2026_END = _dt.date(2027, 2, 17)
_TERM_2025_START = {
    "6732 Peerless": _dt.date(2025, 1, 23),
    "6734 Peerless": _dt.date(2025, 1, 23),
    "6738 Peerless": _dt.date(2025, 1, 27),
}


def _row(
    match: str,
    service_type: str,
    *,
    start: _dt.date | None = None,
) -> UtilityPlanSeedRow:
    """The single seed row for a property + service, disambiguated by term.

    Electricity now carries two generations per property, so a lookup that
    ignores the start date would silently return whichever happens to be
    declared first — exactly the kind of ambiguity these tests exist to catch.
    """
    candidates = [
        row for row in PEERLESS_UTILITY_PLANS
        if row.property_match == match
        and row.service_type == service_type
        and (start is None or row.service_start_date == start)
    ]
    if len(candidates) != 1:
        raise AssertionError(
            f"expected exactly one seed row for {match} / {service_type}"
            f"{f' starting {start}' if start else ''}; got {len(candidates)}"
        )
    return candidates[0]


def _row_2025(match: str) -> UtilityPlanSeedRow:
    return _row(match, SERVICE_TYPE_ELECTRICITY, start=_TERM_2025_START[match])


def _row_2026(match: str) -> UtilityPlanSeedRow:
    return _row(match, SERVICE_TYPE_ELECTRICITY, start=_TERM_2026_START)


class TestSeedRowsSatisfyTheSchema:
    """Every constraint on ``utility_plans`` that the seed data could violate."""

    @pytest.mark.parametrize("row", PEERLESS_UTILITY_PLANS, ids=lambda r: r.property_match)
    def test_service_and_rate_types_are_known_values(self, row: UtilityPlanSeedRow) -> None:
        assert row.service_type in SERVICE_TYPES
        assert row.rate_type in RATE_TYPES

    @pytest.mark.parametrize("row", PEERLESS_UTILITY_PLANS, ids=lambda r: r.property_match)
    def test_provider_name_is_not_empty(self, row: UtilityPlanSeedRow) -> None:
        assert row.provider_name.strip()

    @pytest.mark.parametrize("row", PEERLESS_UTILITY_PLANS, ids=lambda r: r.property_match)
    def test_a_term_never_ends_before_it_starts(self, row: UtilityPlanSeedRow) -> None:
        if row.service_start_date is None or row.term_end_date is None:
            return
        assert row.term_end_date >= row.service_start_date

    def test_no_two_rows_share_a_property_service_and_provider(self) -> None:
        """Duplicates would collide on the seeder's own idempotency check."""
        keys = [
            (r.property_match, r.service_type, r.provider_name, r.service_start_date)
            for r in PEERLESS_UTILITY_PLANS
        ]
        assert len(keys) == len(set(keys))


class TestElectricPlans:
    _PROPERTIES = ("6732 Peerless", "6734 Peerless", "6738 Peerless")

    def test_every_property_carries_both_a_lapsed_and_a_current_term(self) -> None:
        """The superseded row is the baseline a new offer is measured against.

        Seeding only the 2025 generation is what made the app assert every plan
        had lapsed in January 2026 and fire a renewal alert for six months while
        all three accounts were in fact under contract.
        """
        electric = [r for r in PEERLESS_UTILITY_PLANS if r.service_type == SERVICE_TYPE_ELECTRICITY]

        assert len(electric) == 6
        for match in self._PROPERTIES:
            assert _row_2025(match).term_end_date < _TERM_2026_START
            assert _row_2026(match).term_end_date == _TERM_2026_END

    @pytest.mark.parametrize("match", _PROPERTIES)
    def test_every_electric_term_is_a_12_month_fixed_deal(self, match: str) -> None:
        for row in (_row_2025(match), _row_2026(match)):
            assert row.rate_type == RATE_TYPE_FIXED
            assert row.term_months == 12
            assert row.term_end_date is not None
            assert row.term_end_date.year == row.service_start_date.year + 1
            assert (row.term_end_date.month, row.term_end_date.day) == (
                row.service_start_date.month, row.service_start_date.day,
            )

    def test_2025_rates_match_the_enrollment_emails(self) -> None:
        row = _row_2025("6734 Peerless")

        assert row.energy_charge_cents_per_kwh == Decimal("11.6000")
        # Four decimal places — the reason the column is Numeric, not cents.
        assert row.tdu_charge_cents_per_kwh == Decimal("5.3509")
        assert row.avg_price_cents_per_kwh_at_1000 == Decimal("13.9000")
        assert row.monthly_base_charge_cents == 439
        assert row.early_termination_fee_cents == 15_000
        # The EFL states the fee as 0.00000 below 999 kWh — the shape exists,
        # the penalty does not. Zero is a recorded fact, not a missing value.
        assert row.min_usage_fee_cents == 0
        assert row.min_usage_threshold_kwh == 999

    def test_6738_2025_leaves_unstated_figures_blank(self) -> None:
        """Its plan-change notice omits these; copying the siblings' would be invention."""
        row = _row_2025("6738 Peerless")

        assert row.avg_price_cents_per_kwh_at_1000 is None
        assert row.early_termination_fee_cents is None

    def test_every_account_number_is_the_one_the_portal_printed(self) -> None:
        """Email never bound 204865879 / 204865622 to an address; the portal did.

        Both generations carry the same number per property — they are the same
        meter, so a mismatch between them would be a transcription error.
        """
        expected = {
            "6732 Peerless": "204865879",
            "6734 Peerless": "204865622",
            "6738 Peerless": "204430810",
        }
        for match, account in expected.items():
            assert _row_2025(match).account_number == account
            assert _row_2026(match).account_number == account

    def test_current_terms_record_the_portal_rate_and_nothing_it_did_not_state(self) -> None:
        """Plan detail shows a blended average only — no components, no ETF."""
        rates = {
            "6732 Peerless": Decimal("15.0600"),
            "6734 Peerless": Decimal("15.6600"),
            "6738 Peerless": Decimal("16.2700"),
        }
        for match, rate in rates.items():
            row = _row_2026(match)
            assert row.avg_price_cents_per_kwh_at_1000 == rate
            # Carrying 2025's components or ETF forward onto a differently
            # named plan would be invention, not a transcription.
            assert row.energy_charge_cents_per_kwh is None
            assert row.tdu_charge_cents_per_kwh is None
            assert row.monthly_base_charge_cents is None
            assert row.early_termination_fee_cents is None

    def test_only_the_plans_that_say_so_claim_no_minimum_usage_fee(self) -> None:
        """The claim comes from the plan name; 6738's name makes no such claim."""
        assert _row_2026("6732 Peerless").min_usage_fee_cents == 0
        assert _row_2026("6734 Peerless").min_usage_fee_cents == 0
        assert _row_2026("6738 Peerless").min_usage_fee_cents is None


class TestGasPlans:
    def test_regulated_gas_carries_an_account_but_no_term(self) -> None:
        gas = [r for r in PEERLESS_UTILITY_PLANS if r.service_type == SERVICE_TYPE_NATURAL_GAS]

        assert len(gas) == 2
        for row in gas:
            assert row.rate_type == RATE_TYPE_REGULATED
            # No competing supplier and no term to renew — a term_end_date
            # would make the alert fire on something unactionable.
            assert row.term_end_date is None
            assert row.term_months is None
            assert row.account_number

    def test_accounts_map_to_the_addresses_centerpoint_printed(self) -> None:
        assert _row("6732 Peerless", SERVICE_TYPE_NATURAL_GAS).account_number == "6403771834-9"
        assert _row("6734 Peerless", SERVICE_TYPE_NATURAL_GAS).account_number == "6403771807-5"

    def test_no_gas_row_is_invented_for_6738(self) -> None:
        """Nothing in the mailbox shows gas service there; absence isn't a value."""
        matches = {
            r.property_match
            for r in PEERLESS_UTILITY_PLANS
            if r.service_type == SERVICE_TYPE_NATURAL_GAS
        }
        assert "6738 Peerless" not in matches


class TestPlanParams:
    def _prop(self):
        return SimpleNamespace(
            id=uuid.uuid4(),
            user_id=uuid.uuid4(),
            organization_id=uuid.uuid4(),
            name="6734 Peerless St",
        )

    def test_tenant_columns_come_from_the_matched_property(self) -> None:
        prop = self._prop()

        params = _plan_params(_row_2026("6734 Peerless"), prop)

        assert params["property_id"] == str(prop.id)
        assert params["user_id"] == str(prop.user_id)
        assert params["organization_id"] == str(prop.organization_id)
        assert uuid.UUID(params["id"])

    def test_account_number_is_normalized_for_joining(self) -> None:
        """Must match utility_account_link's stored form, dashes stripped."""
        params = _plan_params(_row("6734 Peerless", SERVICE_TYPE_NATURAL_GAS), self._prop())

        assert params["account_number"] == "64037718075"

    def test_a_missing_account_number_stays_null(self) -> None:
        """Every seeded row now has one, so this holds the behaviour directly.

        Previously this leaned on 6732's electricity row being unbound; the
        portal resolved it, and a test that silently stops exercising its own
        subject is worse than no test.
        """
        row = UtilityPlanSeedRow(
            property_match="6732 Peerless",
            service_type=SERVICE_TYPE_ELECTRICITY,
            provider_name="Constellation",
            rate_type=RATE_TYPE_FIXED,
        )

        params = _plan_params(row, self._prop())

        assert params["account_number"] is None

    def test_rate_precision_is_passed_through_undamaged(self) -> None:
        params = _plan_params(_row_2025("6732 Peerless"), self._prop())

        assert params["tdu_charge_cents_per_kwh"] == Decimal("5.3509")
