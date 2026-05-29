"""Guards the discovery fit-scorer rubric calibration (PR B of the trust fix).

These pin the *invariants* of the calibration — not exact wording — so an
accidental revert to the over-pessimistic rubric (the discovery "scores can't
be trusted" P0) fails CI. They assert on the `JOB_ANALYSIS_PROMPT` string only;
behavioural scoring is model-driven (the service does not recompute the verdict)
and is validated end-to-end against a live key / operator spot-check, not here.
"""
from __future__ import annotations

from app.services.extraction.prompts.job_analysis_prompt import JOB_ANALYSIS_PROMPT


def _section(start: str, end: str) -> str:
    s = JOB_ANALYSIS_PROMPT.index(start)
    e = JOB_ANALYSIS_PROMPT.index(end, s)
    return JOB_ANALYSIS_PROMPT[s:e]


class TestUndisclosedSalaryDoesNotVetoStrongFit:
    def test_strong_fit_accepts_undisclosed_and_no_target_salary(self) -> None:
        verdict = _section("# Verdict logic", "# Red / green flags")
        # strong_fit must explicitly accept undisclosed / no-target salary; only
        # an actual below_target blocks it.
        assert "not_disclosed" in verdict
        assert "no_target" in verdict
        assert "below_target" in verdict

    def test_old_salary_veto_phrasing_is_gone(self) -> None:
        # The exact pre-fix wording that made strong_fit unreachable for the
        # majority of (salary-less) JDs must never return.
        assert "salary in {in_range, above_target}" not in JOB_ANALYSIS_PROMPT

    def test_green_flag_count_no_longer_gates_strong_fit(self) -> None:
        assert "at least 2 items" not in JOB_ANALYSIS_PROMPT


class TestPriorExperienceIsDominantPositive:
    def test_prior_experience_drives_strong_skill_match(self) -> None:
        assert "previously held" in JOB_ANALYSIS_PROMPT

    def test_gap_carves_out_prior_experience(self) -> None:
        skill = _section("skill_match status:", "seniority status:")
        assert 'NOT assign "gap"' in skill
        assert "prior" in skill.lower()


class TestTieBreakRequiresConcreteNegative:
    def test_missing_data_is_neutral_not_negative(self) -> None:
        verdict = _section("# Verdict logic", "# Red / green flags")
        assert "concrete negative" in verdict
        assert "NEUTRAL" in verdict

    def test_blanket_pessimistic_tiebreak_is_gone(self) -> None:
        # The old unconditional "prefer the LESS optimistic one" is replaced by
        # a tie-break gated on a concrete negative signal.
        assert "prefer the LESS optimistic one" not in JOB_ANALYSIS_PROMPT
