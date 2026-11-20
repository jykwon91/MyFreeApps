"""Guard: every user-owned table is exported, or explicitly excluded with a reason.

A table counts as user-owned when it has a foreign key to ``users.id`` or, by
way of other tables, a chain of foreign keys that leads to ``users.id``. Add a
new table and this test fails until it is mapped into the export
(``EXPORTED_TABLE_SECTIONS``) or listed in ``EXPORT_EXCLUDED_TABLES``.
"""
import app.models  # noqa: F401  (registers every table on Base.metadata)
from app.core.export_constants import EXPORT_EXCLUDED_TABLES, EXPORTED_TABLE_SECTIONS
from app.db.base import Base

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
