"""Domain registries (languages / levels / scenarios / statuses) and their
CHECK constraints.

The registries in ``app/domain`` are the single source of truth. These tests
pin (a) the registry contents the product relies on and (b) that the model
CheckConstraints -- and the constraints actually present in the migrated
database -- allow exactly the registry values, so adding a language or
scenario without a migration fails CI.
"""
from __future__ import annotations

import re

import pytest
from sqlalchemy import CheckConstraint, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.languages import LANGUAGE_CODES, get_language, list_languages
from app.domain.levels import LEVEL_CODES, Level
from app.domain.scenarios import SCENARIO_SLUGS, get_scenario, list_scenarios
from app.domain.session_status import SESSION_STATUS_CODES
from app.domain.turn_status import TURN_STATUS_CODES
from app.models.tutor.tutor_session import TutorSession
from app.models.tutor.tutor_turn import TutorTurn

_EXPECTED_SCENARIO_ORDER = (
    "greetings",
    "repair-phrases",
    "about-me",
    "cafe",
    "paying",
    "directions",
    "likes-weekend",
    "appointment",
    "free-talk",
)

# constraint name -> registry values it must allow
_CONSTRAINT_REGISTRY: dict[str, tuple[str, ...]] = {
    "ck_tutor_session_language_code": LANGUAGE_CODES,
    "ck_tutor_session_scenario_slug": SCENARIO_SLUGS,
    "ck_tutor_session_level": LEVEL_CODES,
    "ck_tutor_session_status": SESSION_STATUS_CODES,
    "ck_tutor_turn_status": TURN_STATUS_CODES,
}


def _quoted_values(sql: str) -> set[str]:
    return set(re.findall(r"'([^']*)'", sql))


def _model_check_constraints() -> dict[str, str]:
    found: dict[str, str] = {}
    for table in (TutorSession.__table__, TutorTurn.__table__):
        for constraint in table.constraints:
            if isinstance(constraint, CheckConstraint):
                found[str(constraint.name)] = str(constraint.sqltext)
    return found


class TestLanguageRegistry:
    def test_only_spanish_is_supported(self) -> None:
        assert LANGUAGE_CODES == ("es",)

    def test_spanish_config(self) -> None:
        es = get_language("es")
        assert es is not None
        assert es.display_name == "Spanish"
        assert es.dialect_label == "Latin American"
        assert es.stt_locale == "es-MX"
        assert es.tts_locale == "es-MX"

    def test_unknown_language_is_none(self) -> None:
        assert get_language("fr") is None

    def test_language_config_is_frozen(self) -> None:
        es = list_languages()[0]
        with pytest.raises(AttributeError):
            es.code = "xx"  # type: ignore[misc]


class TestLevels:
    def test_levels(self) -> None:
        assert LEVEL_CODES == ("beginner", "some_phrases", "conversational")
        assert Level("some_phrases") is Level.SOME_PHRASES


class TestScenarioRegistry:
    def test_scenarios_in_learning_path_order(self) -> None:
        assert tuple(s.slug for s in list_scenarios()) == _EXPECTED_SCENARIO_ORDER

    def test_orders_are_unique_and_contiguous(self) -> None:
        orders = [s.order for s in list_scenarios()]
        assert orders == list(range(1, len(orders) + 1))

    def test_guided_scenarios_have_goals_free_talk_does_not(self) -> None:
        for scenario in list_scenarios():
            if scenario.slug == "free-talk":
                assert scenario.goals == ()
            else:
                assert scenario.goals, f"{scenario.slug} has no goals"
                assert scenario.title and scenario.goal

    def test_slugs_fit_the_column(self) -> None:
        assert all(len(slug) <= 40 for slug in SCENARIO_SLUGS)

    def test_unknown_scenario_is_none(self) -> None:
        assert get_scenario("nope") is None


class TestCheckConstraintsMatchRegistries:
    def test_model_constraints_equal_registry_values(self) -> None:
        constraints = _model_check_constraints()
        for name, values in _CONSTRAINT_REGISTRY.items():
            assert name in constraints, f"missing CheckConstraint {name}"
            assert _quoted_values(constraints[name]) == set(values), (
                f"{name} drifted from its registry"
            )

    @pytest.mark.asyncio
    async def test_migrated_db_constraints_equal_registry_values(
        self, db: AsyncSession,
    ) -> None:
        """The migration froze the value lists; they must still match the
        registries. Failing here = a registry grew without a migration."""
        result = await db.execute(
            text(
                "SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint "
                "WHERE contype = 'c' AND conname = ANY(:names)"
            ),
            {"names": list(_CONSTRAINT_REGISTRY)},
        )
        db_constraints = {row[0]: row[1] for row in result.all()}
        for name, values in _CONSTRAINT_REGISTRY.items():
            assert name in db_constraints, f"{name} missing from the migrated schema"
            assert _quoted_values(db_constraints[name]) == set(values), (
                f"{name} in the database does not match the registry -- add a migration"
            )
