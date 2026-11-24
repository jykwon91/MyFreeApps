"""summarize_database_error: what a database error is sent as instead of its message."""

from __future__ import annotations

from collections.abc import Callable
from types import SimpleNamespace

import pytest

from platform_shared.core.database_error_summary import summarize_database_error
from tests.database_error_samples import (
    PROBE_VALUE,
    bad_input,
    check_violation,
    driver_error_of,
    not_null_violation,
    sqlite_unique_violation,
    statement_error_from_value_error,
    unique_violation,
)


@pytest.mark.parametrize(
    ("make_error", "summary"),
    [
        pytest.param(
            unique_violation,
            "sqlalchemy.exc.IntegrityError [database message withheld] "
            "cause=asyncpg.exceptions.UniqueViolationError sqlstate=23505 "
            "constraint=probe_users_email_key table=probe_users "
            "[SQL: INSERT INTO probe_users (email, n) VALUES ($1::VARCHAR, $2::INTEGER)]",
            id="unique-violation",
        ),
        pytest.param(
            check_violation,
            "sqlalchemy.exc.IntegrityError [database message withheld] "
            "cause=asyncpg.exceptions.CheckViolationError sqlstate=23514 "
            "constraint=probe_users_n_check table=probe_users "
            "[SQL: INSERT INTO probe_users (email, n) VALUES ($1::VARCHAR, $2::INTEGER)]",
            id="check-violation",
        ),
        pytest.param(
            not_null_violation,
            "sqlalchemy.exc.IntegrityError [database message withheld] "
            "cause=asyncpg.exceptions.NotNullViolationError sqlstate=23502 "
            "table=probe_users column=n "
            "[SQL: INSERT INTO probe_users (email, n) VALUES ($1::VARCHAR, $2::INTEGER)]",
            id="not-null-violation",
        ),
        pytest.param(
            bad_input,
            "sqlalchemy.exc.DBAPIError [database message withheld] "
            "cause=asyncpg.exceptions.DataError sqlstate=22000 "
            "[SQL: INSERT INTO probe_users (email, owner_id) VALUES ($1::VARCHAR, $2::UUID)]",
            id="bad-input",
        ),
        pytest.param(
            sqlite_unique_violation,
            "sqlalchemy.exc.IntegrityError [database message withheld] "
            "cause=sqlite3.IntegrityError sqlite_error=SQLITE_CONSTRAINT_UNIQUE "
            "[SQL: INSERT INTO probe_users (email, n) VALUES (?, ?)]",
            id="sqlite-unique-violation",
        ),
        pytest.param(
            statement_error_from_value_error,
            "sqlalchemy.exc.StatementError [database message withheld] "
            "cause=ValueError [SQL: INSERT INTO probe_users (email, n) VALUES (?, ?)]",
            id="statement-error",
        ),
    ],
)
def test_the_summary_keeps_classes_codes_names_and_sql(
    make_error: Callable[[], BaseException], summary: str
) -> None:
    assert summarize_database_error(make_error()) == summary


def test_a_driver_error_on_its_own() -> None:
    assert summarize_database_error(driver_error_of(unique_violation())) == (
        "asyncpg.exceptions.UniqueViolationError [database message withheld] "
        "sqlstate=23505 constraint=probe_users_email_key table=probe_users"
    )


def test_psycopg_diagnostics_are_read() -> None:
    psycopg_error_class = type(
        "UniqueViolation",
        (Exception,),
        {
            "__module__": "psycopg2.errors",
            "pgcode": "23505",
            "diag": SimpleNamespace(
                constraint_name="probe_users_email_key",
                table_name="probe_users",
                column_name=None,
            ),
        },
    )
    error = psycopg_error_class(
        'duplicate key value violates unique constraint "probe_users_email_key"\n'
        f"DETAIL:  Key (email)=({PROBE_VALUE}) already exists.\n"
    )
    assert summarize_database_error(error) == (
        "psycopg2.errors.UniqueViolation [database message withheld] "
        "sqlstate=23505 constraint=probe_users_email_key table=probe_users"
    )
