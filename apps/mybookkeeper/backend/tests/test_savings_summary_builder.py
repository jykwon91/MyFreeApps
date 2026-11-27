"""The money summary the savings research sends to Anthropic, and its recurring-charge detector.

Pinned (recurring): a steady monthly / annual merchant is found with its
yearly cost; irregular or one-off merchants aren't; a stray charge far off
the typical amount doesn't break detection; a merchant that stopped charging
is left out; merchant names group case-insensitively.

Pinned (summary — privacy): no account mask, policy number, utility account
number or street address reaches the serialized summary; properties are
located to city/state/ZIP only; premiums are annualised; categories are
ranked by spend.
"""
from __future__ import annotations

import datetime as _dt
import uuid
from decimal import Decimal

from app.core.address_utils import location_without_street
from app.core.slug_utils import slugify
from app.core.text_redaction import without_long_numbers
from app.models.financial_accounts.financial_account import FinancialAccount
from app.models.insurance.insurance_policy import InsurancePolicy
from app.models.properties.property import Property
from app.models.properties.property_classification import PropertyClassification
from app.models.properties.utility_plan import UtilityPlan
from app.services.savings.recurring_charge_detector import detect_recurring_charges
from app.services.savings.savings_summary_builder import build_summary

_TODAY = _dt.date(2026, 11, 27)


def _monthly(merchant: str, amount: str, months: int, *, last: _dt.date = _TODAY) -> list:
    return [(merchant, last - _dt.timedelta(days=30 * n), Decimal(amount)) for n in range(months)]


class TestRecurringCharges:
    def test_a_steady_monthly_charge_is_found_with_its_yearly_cost(self) -> None:
        [charge] = detect_recurring_charges(_monthly("Netflix", "15.49", 6), as_of=_TODAY)
        assert charge.merchant == "Netflix"
        assert charge.cadence == "monthly"
        assert charge.typical_charge_dollars == 15.49
        assert charge.yearly_cost_dollars == 186
        assert charge.charges_in_window == 6

    def test_an_annual_charge_needs_only_two(self) -> None:
        rows = [("Costco", _TODAY - _dt.timedelta(days=10), Decimal("65")),
                ("Costco", _TODAY - _dt.timedelta(days=375), Decimal("60"))]
        [charge] = detect_recurring_charges(rows, as_of=_TODAY)
        assert charge.cadence == "annual"
        assert charge.yearly_cost_dollars == 62

    def test_irregular_and_one_off_merchants_are_not_recurring(self) -> None:
        rows = [
            ("Home Depot", _TODAY - _dt.timedelta(days=d), Decimal("80")) for d in (2, 9, 51, 140)
        ] + [("Apple Store", _TODAY, Decimal("999"))]
        assert detect_recurring_charges(rows, as_of=_TODAY) == []

    def test_a_stray_charge_far_off_the_typical_amount_is_ignored(self) -> None:
        rows = _monthly("Comcast", "80", 5) + [("Comcast", _TODAY - _dt.timedelta(days=45), Decimal("400"))]
        [charge] = detect_recurring_charges(rows, as_of=_TODAY)
        assert charge.charges_in_window == 5
        assert charge.typical_charge_dollars == 80.0

    def test_a_merchant_that_stopped_charging_is_left_out(self) -> None:
        rows = _monthly("Hulu", "17.99", 5, last=_TODAY - _dt.timedelta(days=120))
        assert detect_recurring_charges(rows, as_of=_TODAY) == []

    def test_merchant_names_group_case_insensitively_and_rank_by_cost(self) -> None:
        rows = _monthly("SPOTIFY", "11.99", 2) + _monthly("spotify", "11.99", 2, last=_TODAY - _dt.timedelta(days=60))
        rows += _monthly("Geico", "140", 4)
        charges = detect_recurring_charges(rows, as_of=_TODAY)
        assert [c.merchant for c in charges] == ["Geico", "SPOTIFY"]


def _summary(**inputs: object):
    defaults: dict[str, object] = {
        "as_of": _TODAY,
        "window_start": _TODAY - _dt.timedelta(days=365),
        "category_rows": [],
        "merchant_rows": [],
        "accounts": [],
        "properties": [],
        "rate_watch": None,
        "insurance_policies": [],
        "utility_plans": [],
        "budget": None,
        "known_ideas": [],
    }
    defaults.update(inputs)
    return build_summary(**defaults)  # type: ignore[arg-type]


class TestSummary:
    def test_nothing_identifying_reaches_the_summary(self) -> None:
        prop = Property(
            id=uuid.uuid4(), name="12 Elm St", address="12 Elm St, Austin, TX 78701",
            classification=PropertyClassification.INVESTMENT, estimated_value_cents=40_000_000,
        )
        account = FinancialAccount(
            name="Sapphire ...9911", institution_name="Chase", account_type="credit_card", mask="4242",
        )
        policy = InsurancePolicy(
            property_id=prop.id, policy_name="12 Elm St landlord", carrier="Acme",
            policy_number="POL-998877", premium_cents=12_000, premium_frequency="monthly",
        )
        plan = UtilityPlan(
            property_id=prop.id, service_type="electricity", provider_name="Reliant",
            rate_type="fixed", account_number="ACCT-554433",
        )
        summary = _summary(properties=[prop], accounts=[account], insurance_policies=[policy], utility_plans=[plan])
        text = summary.model_dump_json()
        for secret in ("4242", "9911", "POL-998877", "ACCT-554433", "Elm St"):
            assert secret not in text
        assert summary.properties[0].location == "Austin, TX 78701"
        assert summary.insurance_policies[0].yearly_premium_dollars == 1440
        assert summary.insurance_policies[0].property == "Property 1"
        assert summary.utility_plans[0].property == "Property 1"
        assert summary.properties[0].label == "Property 1"
        assert summary.accounts[0].name == "Sapphire"
        assert summary.accounts[0].institution == "Chase"

    def test_property_labels_are_the_same_whatever_order_they_load_in(self) -> None:
        props = [Property(id=uuid.uuid4(), name=f"{n} Oak Ave", classification=PropertyClassification.INVESTMENT)
                 for n in range(3)]
        forward = _summary(properties=props).properties
        backward = _summary(properties=list(reversed(props))).properties
        assert forward == backward

    def test_categories_rank_by_spend_and_total_the_year(self) -> None:
        rows = [
            ("personal", "Dining", Decimal("1200.90"), 40),
            ("personal", "Groceries", Decimal("5100.10"), 90),
            ("rental", "insurance", Decimal("2300"), 1),
        ]
        summary = _summary(category_rows=rows)
        assert [c.category for c in summary.spending_by_category] == ["Groceries", "insurance", "Dining"]
        assert summary.yearly_spending_dollars == 8601


class TestHelpers:
    def test_location_drops_the_street_and_never_guesses(self) -> None:
        assert location_without_street("12 Elm St, Austin, TX 78701") == "Austin, TX 78701"
        assert location_without_street("12 Elm St") is None
        assert location_without_street("6738 Peerless St Houston TX 77021") == "TX 77021"
        assert location_without_street(None) is None

    def test_long_numbers_are_scrubbed_from_typed_names(self) -> None:
        assert without_long_numbers("TOTAL CHECKING ...4821") == "TOTAL CHECKING"
        assert without_long_numbers("12 Month Plan") == "12 Month Plan"
        assert without_long_numbers("4821") is None
        assert without_long_numbers(None) is None

    def test_slugify_folds_accents_and_falls_back(self) -> None:
        assert slugify("María's  Café!", max_length=50, fallback="x") == "maria-s-cafe"
        assert slugify("🙂🙂", max_length=50, fallback="x") == "x"
        assert slugify("abc def", max_length=4, fallback="x") == "abc"
