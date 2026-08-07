"""Tests for the Peerless utility-plan seed data and its parameter mapping.

The seed rows are hand-transcribed from provider email, so the risk they carry
is a typo that the database would reject at INSERT time — after the operator
has already run the command against production. These assertions move each
CHECK constraint's failure to the test suite, and pin the two figures the seed
deliberately leaves unknown so a future edit cannot quietly invent them.
"""
from __future__ import annotations

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


def _row(match: str, service_type: str) -> UtilityPlanSeedRow:
    for row in PEERLESS_UTILITY_PLANS:
        if row.property_match == match and row.service_type == service_type:
            return row
    raise AssertionError(f"no seed row for {match} / {service_type}")


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
    def test_all_three_properties_have_a_lapsed_fixed_term(self) -> None:
        electric = [r for r in PEERLESS_UTILITY_PLANS if r.service_type == SERVICE_TYPE_ELECTRICITY]

        assert {r.property_match for r in electric} == {
            "6732 Peerless", "6734 Peerless", "6738 Peerless",
        }
        for row in electric:
            assert row.rate_type == RATE_TYPE_FIXED
            assert row.term_months == 12
            # Term end is start + 12 months; both dates are in the past, which
            # is what makes the renewal alert fire the moment the seed lands.
            assert row.term_end_date is not None
            assert row.term_end_date.year == row.service_start_date.year + 1
            assert (row.term_end_date.month, row.term_end_date.day) == (
                row.service_start_date.month, row.service_start_date.day,
            )

    def test_rates_match_the_enrollment_emails(self) -> None:
        row = _row("6734 Peerless", SERVICE_TYPE_ELECTRICITY)

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

    def test_6738_leaves_unstated_figures_blank(self) -> None:
        """Its plan-change notice omits these; copying the siblings' would be invention."""
        row = _row("6738 Peerless", SERVICE_TYPE_ELECTRICITY)

        assert row.avg_price_cents_per_kwh_at_1000 is None
        assert row.early_termination_fee_cents is None
        assert row.account_number == "204430810"

    def test_the_two_unbound_accounts_are_left_null_and_documented(self) -> None:
        """No email binds 204865879 / 204865622 to an address — don't guess."""
        for match in ("6732 Peerless", "6734 Peerless"):
            row = _row(match, SERVICE_TYPE_ELECTRICITY)
            assert row.account_number is None
            assert "204865879" in row.notes
            assert "204865622" in row.notes


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

        params = _plan_params(_row("6734 Peerless", SERVICE_TYPE_ELECTRICITY), prop)

        assert params["property_id"] == str(prop.id)
        assert params["user_id"] == str(prop.user_id)
        assert params["organization_id"] == str(prop.organization_id)
        assert uuid.UUID(params["id"])

    def test_account_number_is_normalized_for_joining(self) -> None:
        """Must match utility_account_link's stored form, dashes stripped."""
        params = _plan_params(_row("6734 Peerless", SERVICE_TYPE_NATURAL_GAS), self._prop())

        assert params["account_number"] == "64037718075"

    def test_a_missing_account_number_stays_null(self) -> None:
        params = _plan_params(_row("6732 Peerless", SERVICE_TYPE_ELECTRICITY), self._prop())

        assert params["account_number"] is None

    def test_rate_precision_is_passed_through_undamaged(self) -> None:
        params = _plan_params(_row("6732 Peerless", SERVICE_TYPE_ELECTRICITY), self._prop())

        assert params["tdu_charge_cents_per_kwh"] == Decimal("5.3509")
