"""Tests for insurance-policy cross-field validation.

The PATCH path is the interesting one: a partial payload can leave the stored
row inconsistent using a value it never sent, so the rule has to run against the
merged state rather than the payload.
"""
from __future__ import annotations

from types import SimpleNamespace

import pytest

from app.schemas.insurance.insurance_policy_validation import validate_policy_fields
from app.services.insurance._merged_policy import MergedPolicy


def _model(premium_cents: int | None, premium_frequency: str | None) -> SimpleNamespace:
    return SimpleNamespace(
        premium_cents=premium_cents, premium_frequency=premium_frequency,
    )


class TestValidatePolicyFieldsOnCreate:
    def test_accepts_a_complete_pair(self) -> None:
        model = _model(11200, "monthly")
        assert validate_policy_fields(model) is model

    def test_accepts_neither_half_set(self) -> None:
        model = _model(None, None)
        assert validate_policy_fields(model) is model

    def test_rejects_an_amount_without_a_frequency(self) -> None:
        with pytest.raises(ValueError, match="must be set together"):
            validate_policy_fields(_model(11200, None))

    def test_rejects_a_frequency_without_an_amount(self) -> None:
        with pytest.raises(ValueError, match="must be set together"):
            validate_policy_fields(_model(None, "monthly"))

    def test_rejects_an_unknown_frequency(self) -> None:
        with pytest.raises(ValueError, match="premium_frequency must be one of"):
            validate_policy_fields(_model(11200, "fortnightly"))


class TestValidatePolicyFieldsPartial:
    def test_allows_a_lone_amount_the_stored_row_will_complete(self) -> None:
        model = _model(11200, None)
        assert validate_policy_fields(model, partial=True) is model

    def test_allows_a_lone_frequency(self) -> None:
        model = _model(None, "monthly")
        assert validate_policy_fields(model, partial=True) is model

    def test_still_rejects_an_unknown_frequency(self) -> None:
        with pytest.raises(ValueError, match="premium_frequency must be one of"):
            validate_policy_fields(_model(None, "fortnightly"), partial=True)


class TestMergedPolicy:
    def test_takes_the_payload_value_when_the_field_is_present(self) -> None:
        stored = _model(11200, "monthly")
        merged = MergedPolicy(stored, {"premium_cents": 12550})
        assert merged.premium_cents == 12550
        assert merged.premium_frequency == "monthly"

    def test_falls_back_to_the_stored_value_when_the_field_is_absent(self) -> None:
        stored = _model(11200, "monthly")
        merged = MergedPolicy(stored, {})
        assert merged.premium_cents == 11200
        assert merged.premium_frequency == "monthly"

    def test_an_explicit_none_clears_rather_than_falls_back(self) -> None:
        # "Not sent" and "sent as null" mean different things on a PATCH.
        stored = _model(11200, "monthly")
        merged = MergedPolicy(stored, {"premium_frequency": None})
        assert merged.premium_frequency is None
        assert merged.premium_cents == 11200

    def test_clearing_one_half_is_caught_by_the_full_rule(self) -> None:
        stored = _model(11200, "monthly")
        merged = MergedPolicy(stored, {"premium_frequency": None})
        with pytest.raises(ValueError, match="must be set together"):
            validate_policy_fields(merged)

    def test_clearing_both_halves_together_is_allowed(self) -> None:
        stored = _model(11200, "monthly")
        merged = MergedPolicy(
            stored, {"premium_cents": None, "premium_frequency": None},
        )
        assert validate_policy_fields(merged) is merged

    def test_changing_only_the_frequency_keeps_the_stored_amount(self) -> None:
        stored = _model(11200, "monthly")
        merged = MergedPolicy(stored, {"premium_frequency": "annual"})
        assert validate_policy_fields(merged) is merged
        assert merged.premium_cents == 11200
