"""Unit tests for applicant_stage_service.

Tests:
- _validate_new_stage: valid stage passes, invalid raises InvalidStageError
- _validate_transition: allowed transitions pass; invalid transitions raise
  InvalidTransitionError; terminal stage (lease_signed) raises
- ALLOWED_TRANSITIONS completeness: every APPLICANT_STAGE has an entry
"""
from __future__ import annotations

import pytest

from app.core.applicant_enums import APPLICANT_STAGES
from app.services.applicants.applicant_stage_service import (
    ALLOWED_TRANSITIONS,
    InvalidStageError,
    InvalidTransitionError,
    _validate_new_stage,
    _validate_transition,
)


class TestValidateNewStage:
    def test_all_known_stages_pass(self) -> None:
        for stage in APPLICANT_STAGES:
            _validate_new_stage(stage)  # must not raise

    def test_unknown_stage_raises(self) -> None:
        with pytest.raises(InvalidStageError, match="Unknown stage"):
            _validate_new_stage("banana_split")

    def test_empty_string_raises(self) -> None:
        with pytest.raises(InvalidStageError):
            _validate_new_stage("")


class TestValidateTransition:
    def test_lead_to_approved(self) -> None:
        _validate_transition("lead", "approved")

    def test_lead_to_declined(self) -> None:
        _validate_transition("lead", "declined")

    def test_declined_to_lead(self) -> None:
        """Un-decline is explicitly allowed."""
        _validate_transition("declined", "lead")

    def test_screening_failed_to_approved(self) -> None:
        """Host override: bypass failed screening."""
        _validate_transition("screening_failed", "approved")

    def test_lease_signed_is_terminal(self) -> None:
        with pytest.raises(InvalidTransitionError, match="terminal"):
            _validate_transition("lease_signed", "lead")

    def test_invalid_pair_raises(self) -> None:
        with pytest.raises(InvalidTransitionError, match="Cannot transition"):
            _validate_transition("lead", "lease_signed")

    def test_same_stage_is_invalid(self) -> None:
        with pytest.raises(InvalidTransitionError):
            _validate_transition("approved", "approved")


class TestAllowedTransitionsCompleteness:
    def test_every_stage_has_an_entry(self) -> None:
        missing = [s for s in APPLICANT_STAGES if s not in ALLOWED_TRANSITIONS]
        assert not missing, f"Missing entries in ALLOWED_TRANSITIONS: {missing}"

    def test_all_target_stages_are_valid(self) -> None:
        valid = set(APPLICANT_STAGES)
        for src, targets in ALLOWED_TRANSITIONS.items():
            for tgt in targets:
                assert tgt in valid, (
                    f"ALLOWED_TRANSITIONS[{src!r}] references unknown stage {tgt!r}"
                )
