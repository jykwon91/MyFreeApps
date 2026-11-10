"""Pure schema checks that keep account deletion from leaving user data behind."""
from collections.abc import Collection, Iterable, Mapping

from sqlalchemy import ForeignKey, MetaData
from sqlalchemy.engine import Engine

from platform_shared.testing.account_deletion_constants import STORED_FILE_COLUMN_SUFFIXES

_NON_BLOCKING_ACTIONS = {"CASCADE", "SET NULL", "SET DEFAULT"}


def _all_foreign_keys(metadata: MetaData) -> Iterable[ForeignKey]:
    for table in metadata.tables.values():
        yield from table.foreign_keys


def _qualified_name(fk: ForeignKey) -> str:
    return f"{fk.parent.table.name}.{fk.parent.name}"


def _ondelete(fk: ForeignKey) -> str | None:
    return fk.ondelete.upper() if fk.ondelete else None


def tables_referencing(metadata: MetaData, table_name: str) -> set[str]:
    """Return the names of tables holding a foreign key to ``table_name``."""
    return {
        fk.parent.table.name
        for fk in _all_foreign_keys(metadata)
        if fk.column.table.name == table_name
    }


def tables_deleted_with(metadata: MetaData, table_name: str) -> set[str]:
    """Return ``table_name`` plus every table reachable by following ON DELETE CASCADE FKs."""
    reached = {table_name}
    frontier = [table_name]
    while frontier:
        current = frontier.pop()
        for fk in _all_foreign_keys(metadata):
            child = fk.parent.table.name
            if fk.column.table.name == current and _ondelete(fk) == "CASCADE" and child not in reached:
                reached.add(child)
                frontier.append(child)
    return reached


def foreign_keys_not_cascading(metadata: MetaData, user_table_name: str) -> list[str]:
    """Return ``table.column`` of every FK to the user table lacking ON DELETE CASCADE."""
    return sorted(
        _qualified_name(fk)
        for fk in _all_foreign_keys(metadata)
        if fk.column.table.name == user_table_name and _ondelete(fk) != "CASCADE"
    )


def foreign_keys_blocking_user_deletion(metadata: MetaData, user_table_name: str) -> list[str]:
    """Return ``table.column`` of FKs that can make deleting a user fail.

    Only FKs pointing into a table the delete reaches (the user table or
    anything cascaded from it) matter. Postgres checks them differently:

    - RESTRICT is checked immediately, row by row, so it can abort the delete
      even when the referencing table is also being cascaded (it depends on
      cascade order). Reported wherever the referencing table sits.
    - NO ACTION (or no ``ondelete``) is deferred to the end of the statement, so
      it is safe when the referencing rows are deleted by the same cascade.
      Reported only when the referencing table is outside the cascade set.
    - CASCADE, SET NULL and SET DEFAULT never block.
    """
    reached = tables_deleted_with(metadata, user_table_name)
    blocking: list[str] = []
    for fk in _all_foreign_keys(metadata):
        if fk.column.table.name not in reached:
            continue
        action = _ondelete(fk)
        if action == "RESTRICT" or (
            action not in _NON_BLOCKING_ACTIONS and fk.parent.table.name not in reached
        ):
            blocking.append(_qualified_name(fk))
    return sorted(blocking)


def _looks_like_stored_file(column_name: str, words: Iterable[str]) -> bool:
    return any(
        column_name == word.lstrip("_") or column_name.endswith("_" + word.lstrip("_"))
        for word in words
    )


def stored_file_suspects(
    metadata: MetaData,
    suffixes: Iterable[str] = STORED_FILE_COLUMN_SUFFIXES,
    excused: Collection[str] = (),
) -> list[str]:
    """Return ``table.column`` of columns that look like stored-file references.

    Columns listed in ``excused`` are skipped.
    """
    words = tuple(suffixes)
    return sorted(
        qualified
        for table in metadata.tables.values()
        for column in table.columns
        if _looks_like_stored_file(column.name, words)
        and (qualified := f"{table.name}.{column.name}") not in excused
    )


def missing_columns(metadata: MetaData, qualified_names: Collection[str]) -> list[str]:
    """Return the ``table.column`` names that no longer exist in ``metadata``."""
    existing = {f"{t.name}.{c.name}" for t in metadata.tables.values() for c in t.columns}
    return sorted(set(qualified_names) - existing)


def entries_without_reason(reasons: Mapping[str, str]) -> list[str]:
    """Return the keys whose reason is empty or whitespace."""
    return sorted(key for key, reason in reasons.items() if not reason.strip())


def reflect_schema(engine: Engine) -> MetaData:
    """Reflect the live (migrated) database schema."""
    metadata = MetaData()
    metadata.reflect(bind=engine)
    return metadata
