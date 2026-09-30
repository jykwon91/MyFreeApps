"""CHECK-constraint value lists for the tutor tables.

Every ``String(N)`` enum-like column on ``tutor_session`` / ``tutor_turn`` gets
a ``CheckConstraint`` whose allowed values come from the Python domain
registries (``app/domain``) -- never a hand-typed second copy. The Alembic
migration freezes the values it shipped with; ``tests/test_domain_registries.py``
asserts the model constraints AND the migrated database constraints both match
the registries, so adding a language/scenario without a migration fails CI.
"""
from __future__ import annotations

from app.domain.languages import LANGUAGE_CODES
from app.domain.levels import LEVEL_CODES
from app.domain.scenarios import SCENARIO_SLUGS
from app.domain.session_status import SESSION_STATUS_CODES
from app.domain.turn_status import TURN_STATUS_CODES


def sql_in_list(values: tuple[str, ...]) -> str:
    """Render ``('a', 'b')`` for a CHECK ``col IN (...)`` clause."""
    return "(" + ", ".join(f"'{v}'" for v in values) + ")"


LANGUAGE_CODES_SQL = sql_in_list(LANGUAGE_CODES)
SCENARIO_SLUGS_SQL = sql_in_list(SCENARIO_SLUGS)
LEVEL_CODES_SQL = sql_in_list(LEVEL_CODES)
SESSION_STATUS_CODES_SQL = sql_in_list(SESSION_STATUS_CODES)
TURN_STATUS_CODES_SQL = sql_in_list(TURN_STATUS_CODES)
