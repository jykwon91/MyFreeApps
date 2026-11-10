"""Assertions an app's account-deletion guard test calls with its own metadata."""
from collections.abc import Collection, Mapping

from sqlalchemy import MetaData

from platform_shared.testing.account_deletion_schema import (
    entries_without_reason,
    foreign_keys_blocking_user_deletion,
    foreign_keys_not_cascading,
    missing_columns,
    stored_file_suspects,
)


def assert_user_foreign_keys_safe(metadata: MetaData, user_table: str) -> None:
    """Every FK to the user cascades and nothing else blocks the user's delete."""
    not_cascading = foreign_keys_not_cascading(metadata, user_table)
    assert not_cascading == [], (
        f"These foreign keys to {user_table} do not ON DELETE CASCADE: {not_cascading}. "
        "Deleting a user would fail or orphan their rows. Make them cascade, or decide "
        "explicitly what account deletion does with that data."
    )
    blocking = foreign_keys_blocking_user_deletion(metadata, user_table)
    assert blocking == [], (
        f"These foreign keys would block deleting a {user_table} row (RESTRICT, NO ACTION "
        f"or no ondelete, pointing into data the delete cascades to): {blocking}. Make "
        "them CASCADE or SET NULL, or clear those rows during account deletion."
    )


def assert_account_deletion_schema(
    metadata: MetaData,
    user_table: str,
    *,
    not_stored_files: Mapping[str, str],
    covered_by_cleanup: Collection[str] = (),
) -> None:
    """Run every schema guard for one app.

    ``not_stored_files`` maps ``table.column`` to why that column is not a stored
    file. ``covered_by_cleanup`` lists columns account deletion already removes.
    """
    assert_user_foreign_keys_safe(metadata, user_table)

    assert entries_without_reason(not_stored_files) == [], "Every exclusion needs a reason"
    stale = missing_columns(metadata, [*not_stored_files, *covered_by_cleanup])
    assert stale == [], f"These excused or covered columns no longer exist: {stale}"

    suspects = stored_file_suspects(
        metadata, excused={*not_stored_files, *covered_by_cleanup},
    )
    assert suspects == [], (
        f"These columns look like stored-file references: {suspects}. If one IS a stored "
        "file, wire prepare_deletion and an account_files_repo (see apps/myjobhunter) using "
        "platform_shared.services.stored_file_removal.remove_stored_files so account "
        "deletion removes the file. If it is not a file, add table.column to "
        "NOT_STORED_FILE_COLUMNS with a reason."
    )
