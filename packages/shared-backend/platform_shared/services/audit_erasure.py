"""Erase a deleted account's content from ``audit_logs``.

The audit listener copies every changed value into ``audit_logs``, and deleting
the user row adds a final snapshot of it (email, name). ``audit_logs`` has no
foreign key to anything, so none of that goes with the account. The shared
``DELETE /users/me`` route calls :func:`capture_deletion_scope` before the
app's ``prepare_deletion`` and :func:`erase_audit_history` after
``delete_account``, in the same transaction, so every app gets the erasure.

Erasing overwrites ``old_value`` and ``new_value`` with ``[erased]``; a NULL or
the listener's ``"***"`` mask is left as it is. The table, record id, field,
operation, actor and time stay, so the trail still shows that something changed.

1. Rows the deletion removed. Every audit row about the user row (and its
   deletion snapshot), every row cascading from it, and every row an app's
   ``prepare_deletion`` removed along the way (MBK deletes the workspaces the
   user created, with all their records) is erased, whoever wrote it: no
   actor (a background worker), the user, or someone else.
2. Rows the user deleted earlier. Every audit row the user wrote about a
   record that no longer exists is erased, except on the users table (an
   admin's edits describe other accounts) and on workspace tables (see
   :func:`~platform_shared.repositories.deletion_scope_repo.workspace_tables`).

Kept: the history of every row that still exists, whoever wrote it, including
the user's edits to shared or global rows (another member's workspace record,
an app-wide setting, a row that only lost its link to the user through SET
NULL). A surviving row is not the user's personal data. Also kept: the user's
rows about deleted records of a shared workspace, which are that workspace's
history. MBK only lets a user delete their account once nothing of theirs is
left in a workspace that survives.

Known limit: an audit row with no actor (written by a background worker) about
a record that was deleted before the account deletion is found by neither rule,
so it keeps its values.
"""
from __future__ import annotations

from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from platform_shared.core.audit import format_record_id
from platform_shared.repositories import audit_log_repo, deletion_scope_repo
from platform_shared.schemas.deletion_scope import DeletionScope


async def capture_deletion_scope(db: AsyncSession, user: Any) -> DeletionScope:
    """The rows that may go with ``user``, collected before anything is deleted."""
    rows = await deletion_scope_repo.collect_candidates(db, type(user).__table__, user.id)
    return DeletionScope(rows_by_table=rows)


async def erase_audit_history(db: AsyncSession, user: Any, scope: DeletionScope) -> None:
    """Erase the values of ``user``'s audit history once their rows are deleted."""
    user_table = type(user).__table__
    metadata = user_table.metadata
    actor_id = str(user.id)
    await audit_log_repo.write_pending(db)

    removed = await deletion_scope_repo.keep_removed(db, metadata, scope.rows_by_table)
    for table_name, pks in removed.items():
        record_ids = sorted(format_record_id(pk) for pk in pks)
        await audit_log_repo.erase_record_history(db, table_name, record_ids)

    kept_tables = deletion_scope_repo.workspace_tables(metadata) | {user_table.name}
    authored = await audit_log_repo.authored_records(db, actor_id, kept_tables)
    deleted_earlier = await deletion_scope_repo.missing_records(db, metadata, authored)
    for table_name, record_ids in deleted_earlier.items():
        await audit_log_repo.erase_authored(db, actor_id, table_name, record_ids)
