"""Real database exceptions carrying a fake email address, for the scrubbing tests.

The asyncpg ones are built the way a failed statement builds them, without a
server: asyncpg's own error (``PostgresError.new`` from the fields a server
sends, or the ``DataError`` its argument encoder raises from the codec's
error), the error SQLAlchemy's asyncpg adapter translates it to, and
``DBAPIError.instance`` wrapping that, each raised from the one before. The
SQLite ones come from real failing statements.
"""

from __future__ import annotations

import contextlib
from typing import Final

import asyncpg
from sqlalchemy import create_engine, text
from sqlalchemy.dialects.postgresql.asyncpg import AsyncAdapt_asyncpg_dbapi
from sqlalchemy.exc import (
    DBAPIError,
    IntegrityError,
    PendingRollbackError,
    StatementError,
)
from sqlalchemy.orm import Session

from tests.probe_base import ProbeBase
from tests.probe_user import ProbeUser

PROBE_VALUE: Final = "dana.probe@example.test"
# The same with a ', which repr escapes in a text that also holds a ".
PROBE_VALUE_WITH_APOSTROPHE: Final = "dana.probe'x@example.test"
# What the tests search everything sent for: either half alone still gives
# the address away.
PROBE_FRAGMENTS: Final = ("dana.probe", "example.test")

PROBE_TABLE: Final = "probe_users"
UNIQUE_CONSTRAINT: Final = "probe_users_email_key"
CHECK_CONSTRAINT: Final = "probe_users_n_check"
INSERT_SQL: Final = (
    "INSERT INTO probe_users (email, n) VALUES ($1::VARCHAR, $2::INTEGER)"
)
INSERT_OWNER_SQL: Final = (
    "INSERT INTO probe_users (email, owner_id) VALUES ($1::VARCHAR, $2::UUID)"
)
SQLITE_INSERT_SQL: Final = "INSERT INTO probe_users (email, n) VALUES (?, ?)"
# A value sent as text and cast by the server, which rejects it in its message.
CAST_SQL: Final = "SELECT CAST(CAST($1 AS text) AS uuid)"

_ADAPTER: Final = AsyncAdapt_asyncpg_dbapi(asyncpg)


def unique_violation() -> DBAPIError:
    """``DETAIL:  Key (email)=(<value>) already exists.``"""
    return _statement_failure(
        asyncpg.exceptions.PostgresError.new(
            {
                "S": "ERROR",
                "C": "23505",
                "M": f'duplicate key value violates unique constraint "{UNIQUE_CONSTRAINT}"',
                "D": f"Key (email)=({PROBE_VALUE}) already exists.",
                "s": "pg_temp_3",
                "t": PROBE_TABLE,
                "n": UNIQUE_CONSTRAINT,
            }
        ),
        INSERT_SQL,
        (PROBE_VALUE, 1),
    )


def check_violation() -> DBAPIError:
    """``DETAIL:  Failing row contains (<value>.2, -1).``: the whole row."""
    return _statement_failure(
        asyncpg.exceptions.PostgresError.new(
            {
                "S": "ERROR",
                "C": "23514",
                "M": (
                    f'new row for relation "{PROBE_TABLE}" violates check '
                    f'constraint "{CHECK_CONSTRAINT}"'
                ),
                "D": f"Failing row contains ({PROBE_VALUE}.2, -1).",
                "s": "pg_temp_3",
                "t": PROBE_TABLE,
                "n": CHECK_CONSTRAINT,
            }
        ),
        INSERT_SQL,
        (f"{PROBE_VALUE}.2", -1),
    )


def not_null_violation() -> DBAPIError:
    """A violation Postgres names a column for, with the rest of the row in DETAIL."""
    return _statement_failure(
        asyncpg.exceptions.PostgresError.new(
            {
                "S": "ERROR",
                "C": "23502",
                "M": (
                    f'null value in column "n" of relation "{PROBE_TABLE}" '
                    "violates not-null constraint"
                ),
                "D": f"Failing row contains ({PROBE_VALUE}, null).",
                "s": "pg_temp_3",
                "t": PROBE_TABLE,
                "c": "n",
            }
        ),
        INSERT_SQL,
        (PROBE_VALUE, None),
    )


def bad_input() -> DBAPIError:
    """asyncpg refusing an argument before sending it:
    ``invalid input for query argument $2: '<value>' (invalid UUID '<value>': ...)``,
    raised from the UUID codec's ``ValueError``, which holds the value too."""
    return _statement_failure(
        _argument_encoding_failure(),
        INSERT_OWNER_SQL,
        (PROBE_VALUE, PROBE_VALUE),
    )


def invalid_text_representation(value: str = PROBE_VALUE) -> DBAPIError:
    """Postgres rejecting text it was sent, in its message rather than a DETAIL line:
    ``invalid input syntax for type uuid: "<value>"``."""
    return _statement_failure(
        asyncpg.exceptions.PostgresError.new(
            {
                "S": "ERROR",
                "C": "22P02",
                "M": f'invalid input syntax for type uuid: "{value}"',
            }
        ),
        CAST_SQL,
        (value,),
    )


def statement_error_from_value_error() -> StatementError:
    """SQLAlchemy's error for a non-database exception raised while running a
    statement (a type processor rejecting a value, say). The ``ValueError``
    and the parameters both hold the value."""
    try:
        try:
            int(PROBE_VALUE)
        except ValueError as error:
            raise DBAPIError.instance(
                SQLITE_INSERT_SQL,
                (PROBE_VALUE, 1),
                error,
                _ADAPTER.Error,
                hide_parameters=False,
            ) from error
    except StatementError as wrapped:
        return wrapped
    raise AssertionError("int() accepted the address")


def sqlite_unique_violation() -> DBAPIError:
    """A real duplicate insert on SQLite, on an engine that shows its parameters."""
    engine = create_engine("sqlite://")
    insert = text("INSERT INTO probe_users (email, n) VALUES (:email, :n)")
    try:
        with engine.connect() as connection:
            connection.execute(
                text("CREATE TABLE probe_users (email TEXT UNIQUE, n INTEGER)")
            )
            connection.execute(insert, {"email": PROBE_VALUE, "n": 1})
            try:
                connection.execute(insert, {"email": PROBE_VALUE, "n": 1})
            except DBAPIError as error:
                return error
    finally:
        engine.dispose()
    raise AssertionError("the duplicate insert did not fail")


def sqlite_pending_rollback() -> PendingRollbackError:
    """What a session raises for the next statement after a failed flush that
    nobody rolled back. Not a database error and not chained to one, but its
    message repeats the failed flush's error, parameters and all."""
    engine = create_engine("sqlite://")
    ProbeBase.metadata.create_all(engine)
    try:
        with Session(engine) as session:
            session.add(ProbeUser(email=PROBE_VALUE))
            session.flush()
            session.add(ProbeUser(email=PROBE_VALUE))
            with contextlib.suppress(IntegrityError):
                session.flush()
            try:
                session.execute(text("SELECT 1"))
            except PendingRollbackError as error:
                return error
    finally:
        engine.dispose()
    raise AssertionError("the session ran a statement after a failed flush")


def driver_error_of(wrapped: DBAPIError) -> BaseException:
    """The asyncpg error beneath SQLAlchemy's wrapper and the adapter's error."""
    adapter_error = wrapped.orig
    assert adapter_error is not None
    assert adapter_error.__cause__ is not None
    return adapter_error.__cause__


def _argument_encoding_failure() -> asyncpg.exceptions.DataError:
    """What asyncpg's ``_encode_bind_msg`` raises for an argument its codec rejects."""
    try:
        try:
            raise ValueError(
                f"invalid UUID {PROBE_VALUE!r}: length must be between "
                f"32..36 characters, got {len(PROBE_VALUE)}"
            )
        except ValueError as codec_error:
            raise asyncpg.exceptions.DataError(
                f"invalid input for query argument $2: {PROBE_VALUE!r} ({codec_error})"
            ) from codec_error
    except asyncpg.exceptions.DataError as error:
        return error


def _statement_failure(
    driver_error: asyncpg.exceptions.PostgresError,
    statement: str,
    parameters: tuple[object, ...],
) -> DBAPIError:
    """``driver_error`` raised through the asyncpg adapter and SQLAlchemy's wrapper."""
    try:
        _raise_through_adapter(driver_error)
    except _ADAPTER.Error as adapter_error:
        try:
            raise DBAPIError.instance(
                statement,
                parameters,
                adapter_error,
                _ADAPTER.Error,
                hide_parameters=False,
            ) from adapter_error
        except DBAPIError as wrapped:
            return wrapped
    raise AssertionError("the adapter did not raise")


def _raise_through_adapter(driver_error: asyncpg.exceptions.PostgresError) -> None:
    """Raise ``driver_error`` translated as the adapter's ``_handle_exception`` does."""
    try:
        raise driver_error
    except asyncpg.exceptions.PostgresError as error:
        for cls in type(error).__mro__:
            translated_class = _ADAPTER._asyncpg_error_translate.get(cls)
            if translated_class is not None:
                translated = translated_class(f"{type(error)}: {error}")
                translated.pgcode = translated.sqlstate = error.sqlstate
                raise translated from error
        raise
