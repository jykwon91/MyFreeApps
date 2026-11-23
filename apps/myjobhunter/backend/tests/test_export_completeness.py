"""Guard: every user-owned table AND column is exported, or explicitly excluded with a reason.

A table counts as user-owned when it has a foreign key to ``users.id`` or, by
way of other tables, a chain of foreign keys that leads to ``users.id``. Add a
new table and this test fails until it is mapped into the export
(``EXPORTED_TABLE_SECTIONS``) or listed in ``EXPORT_EXCLUDED_TABLES``. Likewise every model column of an exported table
must appear in its mapper's output or in ``EXPORT_EXCLUDED_COLUMNS``.
"""
import app.models  # noqa: F401  (registers every table on Base.metadata)
from app.core.export_constants import (
    EXPORT_EXCLUDED_COLUMNS,
    EXPORT_EXCLUDED_TABLES,
    EXPORTED_TABLE_SECTIONS,
)
from app.db.base import Base
from app.services.user.export_mappers import EXPORT_MAPPERS

_USERS_TABLE = "users"


def _user_owned_tables() -> set[str]:
    owned = {_USERS_TABLE}
    grew = True
    while grew:
        grew = False
        for table in Base.metadata.tables.values():
            if table.name in owned:
                continue
            targets = {fk.column.table.name for fk in table.foreign_keys}
            if targets & owned:
                owned.add(table.name)
                grew = True
    return owned


def test_every_user_owned_table_is_exported_or_excluded() -> None:
    covered = set(EXPORTED_TABLE_SECTIONS) | set(EXPORT_EXCLUDED_TABLES)
    missing = _user_owned_tables() - covered
    assert not missing, f"User-owned tables missing from the data export: {sorted(missing)}"


def test_no_table_is_both_exported_and_excluded() -> None:
    assert not set(EXPORTED_TABLE_SECTIONS) & set(EXPORT_EXCLUDED_TABLES)


def test_every_exclusion_has_a_reason() -> None:
    assert all(reason.strip() for reason in EXPORT_EXCLUDED_TABLES.values())


def test_mapped_tables_exist() -> None:
    known = set(Base.metadata.tables)
    stale = (set(EXPORTED_TABLE_SECTIONS) | set(EXPORT_EXCLUDED_TABLES)) - known
    assert not stale, f"Export constants name tables that no longer exist: {sorted(stale)}"


def _model_for_table(table_name: str) -> type:
    for mapper in Base.registry.mappers:
        if mapper.local_table.name == table_name:
            return mapper.class_
    raise AssertionError(f"No model maps table {table_name}")


def _exported_keys(table_name: str) -> set[str]:
    return set(EXPORT_MAPPERS[table_name](_model_for_table(table_name)()))


def test_every_exported_table_has_a_mapper_and_column_policy() -> None:
    exported = set(EXPORTED_TABLE_SECTIONS)
    assert set(EXPORT_MAPPERS) == exported
    assert set(EXPORT_EXCLUDED_COLUMNS) == exported


def test_every_model_column_is_exported_or_excluded() -> None:
    problems: list[str] = []
    for table_name in EXPORTED_TABLE_SECTIONS:
        columns = {c.name for c in Base.metadata.tables[table_name].columns}
        decided = _exported_keys(table_name) | set(EXPORT_EXCLUDED_COLUMNS[table_name])
        undecided = columns - decided
        if undecided:
            problems.append(f"{table_name}: {sorted(undecided)}")
    assert not problems, f"Columns with no export decision (export them or list a reason): {problems}"


def test_exported_keys_are_real_columns_not_excluded() -> None:
    problems: list[str] = []
    for table_name in EXPORTED_TABLE_SECTIONS:
        columns = {c.name for c in Base.metadata.tables[table_name].columns}
        excluded = set(EXPORT_EXCLUDED_COLUMNS[table_name])
        keys = _exported_keys(table_name)
        if keys - columns:
            problems.append(f"{table_name}: exports non-columns {sorted(keys - columns)}")
        if keys & excluded:
            problems.append(f"{table_name}: both exported and excluded {sorted(keys & excluded)}")
        if excluded - columns:
            problems.append(f"{table_name}: excludes non-columns {sorted(excluded - columns)}")
    assert not problems, problems


def test_every_column_exclusion_has_a_reason() -> None:
    assert all(
        reason.strip() for columns in EXPORT_EXCLUDED_COLUMNS.values() for reason in columns.values()
    )
