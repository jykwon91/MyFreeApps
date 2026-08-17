"""Tests for matching a policy's carrier to its TDI dwelling filings.

Every company name here is copied from the live dataset, because the failures
that matter are all name-shaped and none of them are guessable. Two are
regressions found by running the matcher against the real feed:

- "State Farm Lloyds" matched "STATE NATIONAL INSURANCE COMPANY, INC." once the
  boilerplate words were stripped from both, which would have reported a
  different company's rate increase against the operator's policy.
- Foremost files four dwelling programs at once, and compounding them together
  produced a change that applies to no single policy.
"""
from __future__ import annotations

import datetime as _dt

from app.schemas.insurance.insurance_rate_filing import InsuranceRateFiling
from app.services.insurance._carrier_filing_match import (
    applies_by,
    carrier_aliases,
    carrier_tokens,
    compound_change_pct,
    is_recent,
    matches_carrier,
    project_premium_cents,
)

TODAY = _dt.date(2026, 8, 17)


def _filing(
    *,
    company: str = "SAFEPOINT INSURANCE COMPANY",
    product: str | None = "TX DWO",
    pct: float | None = 11.1,
    filed: _dt.date | None = _dt.date(2026, 5, 28),
    renewal: _dt.date | None = _dt.date(2026, 9, 1),
    in_force: bool = True,
    pending: bool = False,
) -> InsuranceRateFiling:
    return InsuranceRateFiling(
        serff_id=f"SERFF-{company[:6]}-{product}-{filed}",
        company_name=company,
        product_name=product,
        percent_change=pct,
        filed_date=filed,
        effective_date_renewal=renewal,
        is_in_force=in_force,
        is_pending=pending,
    )


class TestTokens:
    def test_strips_corporate_boilerplate(self):
        assert carrier_tokens("SAFEPOINT INSURANCE COMPANY") == frozenset({"SAFEPOINT"})

    def test_strips_the_texas_lloyds_construction(self):
        assert carrier_tokens("FOREMOST LLOYDS OF TEXAS") == frozenset({"FOREMOST"})

    def test_a_name_of_pure_boilerplate_identifies_nothing(self):
        # Left non-empty, "Texas Insurance Co" would key onto every filing in
        # the state.
        assert carrier_tokens("Texas Insurance Co") == frozenset()

    def test_splits_a_fronted_policy_into_both_names(self):
        assert carrier_aliases("Benchmark/Swyfft") == [
            frozenset({"BENCHMARK"}),
            frozenset({"SWYFFT"}),
        ]

    def test_drops_aliases_that_identify_nothing(self):
        assert carrier_aliases("Texas Insurance Co") == []


class TestMatching:
    def test_short_operator_name_matches_full_legal_name(self):
        assert matches_carrier("SafePoint", "SAFEPOINT INSURANCE COMPANY")

    def test_case_and_punctuation_are_irrelevant(self):
        assert matches_carrier("safepoint insurance co.", "SAFEPOINT INSURANCE COMPANY")

    def test_either_half_of_a_fronted_policy_can_match(self):
        assert matches_carrier("Benchmark/Swyfft", "SWYFFT INSURANCE COMPANY")

    def test_state_farm_does_not_match_state_national(self):
        # The regression. Both reduce to a set containing STATE; accepting the
        # filing's tokens as a subset of the policy's would attribute State
        # National's filings to a State Farm policy.
        assert not matches_carrier(
            "State Farm Lloyds", "STATE NATIONAL INSURANCE COMPANY, INC.",
        )

    def test_unrelated_carriers_do_not_match(self):
        assert not matches_carrier("SafePoint", "FOREMOST LLOYDS OF TEXAS")

    def test_a_policy_with_no_carrier_matches_nothing(self):
        assert not matches_carrier(None, "SAFEPOINT INSURANCE COMPANY")
        assert not matches_carrier("", "SAFEPOINT INSURANCE COMPANY")

    def test_a_boilerplate_only_carrier_matches_nothing(self):
        assert not matches_carrier("Texas Insurance Co", "SAFEPOINT INSURANCE COMPANY")


class TestRelevance:
    def test_a_filing_from_four_years_ago_is_stale(self):
        assert not is_recent(_filing(filed=_dt.date(2022, 1, 1)), today=TODAY)

    def test_a_filing_with_no_date_is_kept(self):
        # TDI publishes rows before every column is populated, and those are
        # the newest ones.
        assert is_recent(_filing(filed=None), today=TODAY)

    def test_a_rate_effective_before_renewal_applies(self):
        assert applies_by(
            _filing(renewal=_dt.date(2026, 9, 1)), renewal=_dt.date(2026, 9, 24),
        )

    def test_a_rate_effective_after_renewal_hits_the_next_term(self):
        assert not applies_by(
            _filing(renewal=_dt.date(2026, 10, 15)), renewal=_dt.date(2026, 9, 24),
        )

    def test_a_filing_with_no_effective_date_is_treated_as_applying(self):
        # 310 of 704 dwelling rows leave this blank. Reading blank as "does not
        # apply" would drop nearly half the dataset.
        assert applies_by(_filing(renewal=None), renewal=_dt.date(2026, 9, 24))


class TestCompounding:
    def test_the_safepoint_case(self):
        # The filing that predicts 6738 Peerless's September renewal.
        assert compound_change_pct([_filing()]) == 11.1

    def test_successive_filings_on_one_program_compound(self):
        filings = [
            _filing(pct=10.0, filed=_dt.date(2026, 5, 1)),
            _filing(pct=10.0, filed=_dt.date(2026, 1, 1)),
        ]
        assert compound_change_pct(filings) == 21.0

    def test_separate_programs_do_not_compound(self):
        # Foremost's live shape. Multiplying the four together would produce a
        # 27% rise that no single policy is charged.
        filings = [
            _filing(
                company="FOREMOST LLOYDS OF TEXAS",
                product="Dwelling Program - Landlord",
                pct=6.0,
                filed=_dt.date(2026, 3, 10),
            ),
            _filing(
                company="FOREMOST LLOYDS OF TEXAS",
                product="Dwelling Program - Owner Occupied",
                pct=8.0,
                filed=_dt.date(2026, 1, 5),
            ),
            _filing(
                company="FOREMOST LLOYDS OF TEXAS",
                product="Dwelling Program - Vacant or Unoccupied",
                pct=11.0,
                filed=_dt.date(2025, 11, 14),
            ),
        ]
        # The most recently filed program, not the sum and not the worst.
        assert compound_change_pct(filings) == 6.0

    def test_pending_filings_are_not_counted(self):
        assert compound_change_pct([_filing(in_force=False, pending=True)]) is None

    def test_withdrawn_filings_are_not_counted(self):
        # Closed without ever applying — 63 of the 704 dwelling rows. Counting
        # these would invent an increase the operator will never be charged.
        assert compound_change_pct([_filing(in_force=False)]) is None

    def test_a_carrier_holding_flat_reports_zero_not_none(self):
        # Zero is the signal that puts a carrier on the shortlist to call, so
        # it must not collapse into "nothing found".
        assert compound_change_pct([_filing(pct=0.0)]) == 0.0

    def test_no_filings_reports_none(self):
        assert compound_change_pct([]) is None

    def test_a_decrease_stays_negative(self):
        assert compound_change_pct([_filing(pct=-5.0)]) == -5.0


class TestProjection:
    def test_applies_the_change_to_the_current_premium(self):
        # $2,410 at 11.1% — the 6738 Peerless renewal.
        assert project_premium_cents(241_000, 11.1) == 267_751

    def test_an_unknown_premium_projects_nothing(self):
        assert project_premium_cents(None, 11.1) is None

    def test_an_unknown_change_projects_nothing(self):
        assert project_premium_cents(241_000, None) is None
