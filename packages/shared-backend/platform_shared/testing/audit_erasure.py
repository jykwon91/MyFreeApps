"""Test helpers for checking what an account deletion leaves in ``audit_logs``."""
from __future__ import annotations

from collections.abc import AsyncIterator, Callable, Iterable, Iterator
from contextlib import asynccontextmanager, contextmanager
from typing import Any
from unittest.mock import patch

from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from platform_shared.core.audit import (
    current_user_id,
    register_audit_listeners,
    register_sensitive_fields,
    register_skip_fields,
    register_skip_tables,
    reset_registry,
)
from platform_shared.db.models.audit_log import AuditLog
from platform_shared.testing.factories import hash_test_password

# The password of every user these helpers delete. Store users with
# ``hashed_password=TEST_ACCOUNT_PASSWORD_HASH`` so ``DELETE /users/me`` accepts it.
TEST_ACCOUNT_PASSWORD = "correct-horse-battery-staple"
TEST_ACCOUNT_PASSWORD_HASH = hash_test_password(TEST_ACCOUNT_PASSWORD)


@contextmanager
def audit_listener_attached(
    *,
    sensitive_fields: Iterable[str],
    skip_tables: Iterable[str],
    skip_fields: Iterable[str],
) -> Iterator[None]:
    """Attach the audit listener for one test, then put the app's registry back.

    The listener is process-global, so leaving it attached makes every later
    test write audit rows. ``reset_registry`` also clears the app's import-time
    registrations, which are re-applied from the sets passed in.
    """
    sensitive, tables, fields = list(sensitive_fields), list(skip_tables), list(skip_fields)
    register_audit_listeners()
    try:
        yield
    finally:
        reset_registry()
        register_sensitive_fields(sensitive)
        register_skip_tables(tables)
        register_skip_fields(fields)


async def audit_values(db: AsyncSession) -> list[str]:
    """Every non-null ``old_value`` and ``new_value`` in ``audit_logs``."""
    rows = (await db.execute(select(AuditLog.old_value, AuditLog.new_value))).all()
    return [value for row in rows for value in row if value is not None]


def assert_audit_erased(values: list[str], erased: Iterable[str], kept: Iterable[str]) -> None:
    """No value contains any of ``erased``; each of ``kept`` is still a whole value."""
    leaked = [text for text in erased if any(text in value for value in values)]
    assert not leaked, f"audit_logs still holds the deleted account's content: {leaked}"
    missing = [text for text in kept if text not in values]
    assert not missing, f"audit_logs lost another account's content: {missing}"


async def write_as(db: AsyncSession, user: Any | None, *rows: object) -> None:
    """Add ``rows`` and flush them with ``user`` as the audit actor.

    ``None`` writes with no actor, as a background worker does. Flushes twice:
    the listener adds its audit rows during the first flush. Pass no rows to
    flush edits already made to loaded objects.
    """
    token = current_user_id.set(None if user is None else str(user.id))
    try:
        db.add_all(list(rows))
        await db.flush()
        await db.flush()
    finally:
        current_user_id.reset(token)


async def last_audit_log_id(db: AsyncSession) -> int:
    """The highest ``audit_logs.id`` so far, for removing a test's rows afterwards."""
    return await db.scalar(select(func.coalesce(func.max(AuditLog.id), 0))) or 0


async def remove_committed_test_rows(
    db: AsyncSession, user_model: Any, user_ids: list[Any], after_audit_id: int,
) -> None:
    """Remove the users (and their cascade) and every audit row written after ``after_audit_id``.

    For suites whose ``db`` fixture only rolls back: the route's connection
    release commits, so a test's rows would otherwise outlive it.
    """
    await db.rollback()
    await db.execute(delete(user_model).where(user_model.id.in_(user_ids)))
    await db.execute(delete(AuditLog).where(AuditLog.id > after_audit_id))
    await db.commit()


async def delete_account_through_route(
    *,
    app: FastAPI,
    db: AsyncSession,
    user: Any,
    current_active_user: Callable[..., Any],
    get_db: Callable[..., Any],
    unit_of_work_path: str,
) -> int:
    """Call ``DELETE /users/me`` as ``user`` with the route's transaction on ``db``.

    Returns the response status. ``user`` must be stored with
    ``TEST_ACCOUNT_PASSWORD_HASH``; every step of the route runs for real.
    """

    @asynccontextmanager
    async def _unit_of_work() -> AsyncIterator[AsyncSession]:
        yield db
        await db.flush()

    async def _get_db() -> AsyncIterator[AsyncSession]:
        yield db

    app.dependency_overrides[current_active_user] = lambda: user
    app.dependency_overrides[get_db] = _get_db
    try:
        with patch(unit_of_work_path, _unit_of_work):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                response = await client.request(
                    "DELETE", "/users/me",
                    json={"password": TEST_ACCOUNT_PASSWORD, "confirm_email": user.email},
                )
    finally:
        app.dependency_overrides.clear()
    return response.status_code
