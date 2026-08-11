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

    def test_current_terms_keep_the_portal_average_not_the_efl_one(self) -> None:
        """The portal figure is the current one; the EFL's is priced on a stale TDU.

        The EFLs quote 16.5 and 17.1 c/kWh at 1,000 kWh against a 6.0009 c/kWh
        TDU rate; CenterPoint now charges 5.1461. Replacing these with the EFL
        numbers would overstate every current comparison by ~0.85 c/kWh.
        """
        rates = {
            "6732 Peerless": Decimal("15.0600"),
            "6734 Peerless": Decimal("15.6600"),
            "6738 Peerless": Decimal("16.2700"),
        }
        for match, rate in rates.items():
            assert _row_2026(match).avg_price_cents_per_kwh_at_1000 == rate

    def test_no_current_term_records_a_tdu_charge(self) -> None:
        """TDU is a pass-through the utility re-tariffs mid-term.

        Neither the EFL's issue-date value nor a spot reading is a property of
        the contract, so none is stored.
        """
        for match in ("6732 Peerless", "6734 Peerless", "6738 Peerless"):
            assert _row_2026(match).tdu_charge_cents_per_kwh is None

    def test_efl_backed_terms_carry_their_supplier_fixed_components(self) -> None:
        """Read from each plan's EFL on 2026-08-11 — both stated a $150 ETF."""
        row = _row_2026("6734 Peerless")
        assert row.energy_charge_cents_per_kwh == Decimal("10.0000")
        assert row.monthly_base_charge_cents == 0
        assert row.early_termination_fee_cents == 15_000

        row = _row_2026("6738 Peerless")
        # Higher because the bundled A/C, heating and water-heater coverage is
        # priced into the energy charge rather than billed as a separate line.
        assert row.energy_charge_cents_per_kwh == Decimal("14.1100")
        assert row.early_termination_fee_cents == 15_000

    def test_6732_leaves_its_unread_efl_fields_blank(self) -> None:
        """Its EFL could not be retrieved; the sibling's values are NOT assumed.

        6732 is on the identically-named plan as 6734, which makes $150 and
        10.00 c/kWh a good guess — and a guess in a money column reads as a
        measurement to every comparison downstream.
        """
        row = _row_2026("6732 Peerless")
        assert row.energy_charge_cents_per_kwh is None
        assert row.monthly_base_charge_cents is None
        assert row.early_termination_fee_cents is None

    def test_every_current_term_records_its_zero_minimum_usage_fee(self) -> None:
        """6738's came from its EFL; the other two from the plan name itself."""
        for match in ("6732 Peerless", "6734 Peerless", "6738 Peerless"):
            assert _row_2026(match).min_usage_fee_cents == 0

    def test_6738_records_the_bill_credit_that_distorts_its_rate(self) -> None:
        """A credit that only lands above a usage floor changes the real price."""
        row = _row_2026("6738 Peerless")
        assert row.has_bill_credit is True
        assert row.bill_credit_amount_cents == 3_500
        assert row.bill_credit_threshold_kwh == 1_000
        # The EFL's second tier ($15 above 2,000 kWh) has no column to live in;
        # the note must say so rather than let the omission look like absence.
        assert "2,000 kWh" in (row.notes or "")

    def test_no_other_plan_claims_a_bill_credit(self) -> None:
        credited = [r for r in PEERLESS_UTILITY_PLANS if r.has_bill_credit]
        assert [r.property_match for r in credited] == ["6738 Peerless"]

    def test_a_claimed_bill_credit_always_carries_both_its_terms(self) -> None:
        """Mirrors chk_utility_plan_bill_credit_complete — a half pair is a 500."""
        for row in PEERLESS_UTILITY_PLANS:
            if row.has_bill_credit:
                assert row.bill_credit_amount_cents is not None
                assert row.bill_credit_threshold_kwh is not None


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

    def test_a_bill_credit_reaches_the_insert(self) -> None:
        """The INSERT bound ``false`` literally until 2026-08-11.

        A row could declare a credit and land in the database without one, so
        the flag has to be asserted on the params, not just on the seed row.
        """
        params = _plan_params(_row_2026("6738 Peerless"), self._prop())

        assert params["has_bill_credit"] is True
        assert params["bill_credit_amount_cents"] == 3_500
        assert params["bill_credit_threshold_kwh"] == 1_000

    def test_a_plan_without_a_credit_sends_the_flag_false_not_null(self) -> None:
        """``has_bill_credit`` is NOT NULL — a None here is an INSERT failure."""
        params = _plan_params(_row_2026("6734 Peerless"), self._prop())

        assert params["has_bill_credit"] is False
        assert params["bill_credit_amount_cents"] is None
        assert params["bill_credit_threshold_kwh"] is None
