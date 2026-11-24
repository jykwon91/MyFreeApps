"""The Sentry hooks on errors a real Postgres raises, through the shared engine factory.

The table is a TEMP table on the test's own connection, gone when it closes.
"""

from __future__ import annotations

from collections.abc import AsyncIterator, Mapping

import pytest
import pytest_asyncio
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError
from sqlalchemy.ext.asyncio import AsyncConnection
from sqlalchemy.sql.elements import TextClause

from platform_shared.core.database_error_summary import summarize_database_error
from platform_shared.db.session import create_session_factory
from tests.database_error_reporting import assert_probe_value_not_sent, report_every_way
from tests.database_error_samples import (
    CAST_SQL,
    CHECK_CONSTRAINT,
    PROBE_TABLE,
    PROBE_VALUE,
    UNIQUE_CONSTRAINT,
)
from tests.postgres_test_url import postgres_test_url
from tests.sentry_capture import sent_events

_INSERT = text(
    "INSERT INTO probe_users (email, n, owner_id) VALUES (:email, :n, :owner_id)"
)
_INSERT_SQL = "INSERT INTO probe_users (email, n, owner_id) VALUES ($1, $2, $3)"
_CAST = text("SELECT CAST(CAST(:value AS text) AS uuid)")


@pytest_asyncio.fixture()
async def probe_connection() -> AsyncIterator[AsyncConnection]:
    """A connection from the shared factory, whose TEMP table already holds the address."""
    factory = create_session_factory(postgres_test_url())
    try:
        async with factory.engine.connect() as connection:
            await connection.execute(
                text(
                    "CREATE TEMP TABLE probe_users "
                    "(email text UNIQUE, n integer CHECK (n > 0), owner_id uuid)"
                )
            )
            await connection.execute(
                _INSERT, {"email": PROBE_VALUE, "n": 1, "owner_id": None}
            )
            await connection.commit()
            yield connection
    finally:
        await factory.engine.dispose()


@pytest.mark.parametrize(
    ("statement", "parameters", "kept"),
    [
        pytest.param(
            _INSERT,
            {"email": PROBE_VALUE, "n": 1, "owner_id": None},
            (
                "sqlalchemy.exc.IntegrityError",
                "cause=asyncpg.exceptions.UniqueViolationError",
                "sqlstate=23505",
                f"constraint={UNIQUE_CONSTRAINT}",
                f"table={PROBE_TABLE}",
                f"[SQL: {_INSERT_SQL}]",
            ),
            id="unique-violation",
        ),
        pytest.param(
            _INSERT,
            {"email": f"{PROBE_VALUE}.2", "n": -1, "owner_id": None},
            (
                "sqlalchemy.exc.IntegrityError",
                "cause=asyncpg.exceptions.CheckViolationError",
                "sqlstate=23514",
                f"constraint={CHECK_CONSTRAINT}",
                f"table={PROBE_TABLE}",
                f"[SQL: {_INSERT_SQL}]",
            ),
            id="check-violation",
        ),
        pytest.param(
            _INSERT,
            {"email": f"{PROBE_VALUE}.3", "n": 1, "owner_id": PROBE_VALUE},
            (
                "sqlalchemy.exc.DBAPIError",
                "cause=asyncpg.exceptions.DataError",
                "sqlstate=22000",
                f"[SQL: {_INSERT_SQL}]",
            ),
            id="bad-input",
        ),
        # Postgres puts text it couldn't read in its message, not a DETAIL line.
        pytest.param(
            _CAST,
            {"value": PROBE_VALUE},
            (
                "sqlalchemy.exc.DBAPIError",
                "cause=asyncpg.exceptions.InvalidTextRepresentationError",
                "sqlstate=22P02",
                f"[SQL: {CAST_SQL}]",
            ),
            id="invalid-text-representation",
        ),
    ],
)
async def test_a_postgres_error_reaches_sentry_without_its_values(
    probe_connection: AsyncConnection,
    statement: TextClause,
    parameters: Mapping[str, object],
    kept: tuple[str, ...],
) -> None:
    with pytest.raises(DBAPIError) as raised:
        await probe_connection.execute(statement, parameters)
    await probe_connection.rollback()
    error = raised.value
    # The factory hides the parameters, but Postgres's own text still holds
    # the value: what the hooks are for.
    assert "[SQL parameters hidden due to hide_parameters=True]" in str(error)
    assert PROBE_VALUE in str(error)

    transport = report_every_way(error)
    assert_probe_value_not_sent(transport)
    summary = sent_events(transport)[0]["exception"]["values"][-1]["value"]
    assert summary == summarize_database_error(error)
    for text_kept in kept:
        assert text_kept in summary
