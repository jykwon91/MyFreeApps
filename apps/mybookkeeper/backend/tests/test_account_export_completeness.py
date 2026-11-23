"""Guard: every user- or workspace-scoped table AND column is exported, or excluded with a reason.

A table counts as scoped when it has a ``user_id`` or ``organization_id``
column, or a chain of foreign keys that leads to ``users`` or
``organizations``. Add such a table and this test fails until it is exported
(a mapper in ``EXPORT_MAPPERS`` plus a source in ``ACCOUNT_EXPORT_SOURCES``) or
listed in ``EXPORT_EXCLUDED_TABLES``. Likewise every model column of an
exported table must appear in its mapper's output or in ``EXPORT_EXCLUDED_COLUMNS``.
"""
import app.models  # noqa: F401  (registers every table on Base.metadata)
from app.core.account_export_constants import (
    EXPORT_EXCLUDED_COLUMNS,
    EXPORT_EXCLUDED_TABLES,
)
from app.core.account_export_scope import AccountExportScope
from app.core.pii import PII_FIELD_IDS
from app.db.base import Base
from app.mappers.export.account_export_mapper_registry import EXPORT_MAPPERS
from app.models.user.user import User
from app.repositories.user.account_export_sources import ACCOUNT_EXPORT_SOURCES

_ROOT_TABLES = {"users", "organizations"}
_SCOPE_COLUMNS = {"user_id", "organization_id"}


def _scoped_tables() -> set[str]:
    scoped = set(_ROOT_TABLES) | {
        table.name
        for table in Base.metadata.tables.values()
        if _SCOPE_COLUMNS & {column.name for column in table.columns}
    }
    grew = True
    while grew:
        grew = False
        for table in Base.metadata.tables.values():
            if table.name in scoped:
                continue
            if {fk.column.table.name for fk in table.foreign_keys} & scoped:
                scoped.add(table.name)
                grew = True
    return scoped


def _columns(table_name: str) -> set[str]:
    return {column.name for column in Base.metadata.tables[table_name].columns}


def test_every_scoped_table_is_exported_or_excluded() -> None:
    missing = _scoped_tables() - set(EXPORT_MAPPERS) - set(EXPORT_EXCLUDED_TABLES)
    assert not missing, f"Tables with user or workspace data missing from the export: {sorted(missing)}"


def test_no_table_is_both_exported_and_excluded() -> None:
    assert not set(EXPORT_MAPPERS) & set(EXPORT_EXCLUDED_TABLES)


def test_every_table_exclusion_has_a_reason() -> None:
    assert all(reason.strip() for reason in EXPORT_EXCLUDED_TABLES.values())


def test_named_tables_exist() -> None:
    named = set(EXPORT_MAPPERS) | set(EXPORT_EXCLUDED_TABLES) | set(EXPORT_EXCLUDED_COLUMNS)
    stale = named - set(Base.metadata.tables)
    assert not stale, f"Export constants name tables that no longer exist: {sorted(stale)}"


def test_every_mapper_is_registered_under_its_own_table() -> None:
    assert all(mapper.table_name == name for name, mapper in EXPORT_MAPPERS.items())


def test_every_exported_table_has_a_column_policy() -> None:
    assert set(EXPORT_EXCLUDED_COLUMNS) == set(EXPORT_MAPPERS)


def test_every_exported_table_has_exactly_one_source() -> None:
    """The user's own row comes from the request; every other table is read by the repository."""
    source_tables = [source.model.__table__.name for source in ACCOUNT_EXPORT_SOURCES]
    assert len(source_tables) == len(set(source_tables))
    assert set(source_tables) == set(EXPORT_MAPPERS) - {User.__tablename__}


def test_child_sources_follow_their_parent_by_a_real_foreign_key() -> None:
    seen: set[str] = set()
    for source in ACCOUNT_EXPORT_SOURCES:
        table = source.model.__table__
        if source.scope is AccountExportScope.CHILD:
            assert source.parent is not None and source.parent_fk is not None
            parent_table = source.parent.__table__.name
            assert parent_table in seen, f"{table.name} is read before its parent {parent_table}"
            fk_targets = {fk.column.table.name for fk in table.c[source.parent_fk].foreign_keys}
            assert parent_table in fk_targets, f"{table.name}.{source.parent_fk} does not reference {parent_table}"
        seen.add(table.name)


def test_scoped_sources_have_their_scope_columns() -> None:
    required = {
        AccountExportScope.WORKSPACE: {"organization_id"},
        AccountExportScope.WORKSPACE_MEMBER: {"organization_id", "user_id"},
        AccountExportScope.USER: {"user_id"},
    }
    for source in ACCOUNT_EXPORT_SOURCES:
        table_name = source.model.__table__.name
        assert required.get(source.scope, set()) <= _columns(table_name), table_name


def _exported_keys(table_name: str) -> set[str]:
    mapper = EXPORT_MAPPERS[table_name]
    return set(mapper(mapper.model()))


def test_every_model_column_is_exported_or_excluded() -> None:
    problems: list[str] = []
    for table_name, mapper in EXPORT_MAPPERS.items():
        decided = set(mapper.columns) | set(mapper.transformed_columns) | set(EXPORT_EXCLUDED_COLUMNS[table_name])
        undecided = _columns(table_name) - decided
        if undecided:
            problems.append(f"{table_name}: {sorted(undecided)}")
    assert not problems, f"Columns with no export decision (export them or list a reason): {problems}"


def test_mapper_output_and_exclusions_name_real_columns_without_overlap() -> None:
    problems: list[str] = []
    for table_name, mapper in EXPORT_MAPPERS.items():
        columns = _columns(table_name)
        excluded = set(EXPORT_EXCLUDED_COLUMNS[table_name])
        exported = set(mapper.columns)
        transformed = set(mapper.transformed_columns)
        transformed_keys = {t.exported_as for t in mapper.transformed_columns.values()}
        if _exported_keys(table_name) != exported | transformed_keys or exported & transformed_keys:
            problems.append(f"{table_name}: output keys differ from the declared columns")
        if (exported | transformed | excluded) - columns:
            problems.append(f"{table_name}: names non-columns {sorted((exported | transformed | excluded) - columns)}")
        if exported & excluded or transformed & excluded or exported & transformed:
            problems.append(f"{table_name}: a column is decided twice")
    assert not problems, problems


def test_every_column_exclusion_has_a_reason() -> None:
    assert all(
        reason.strip() for columns in EXPORT_EXCLUDED_COLUMNS.values() for reason in columns.values()
    )


def test_no_secret_column_is_exported() -> None:
    secret_markers = ("password", "totp_secret", "recovery_code", "token", "secret", "storage_key", "share_pin")
    leaked = [
        f"{table_name}.{column}"
        for table_name, mapper in EXPORT_MAPPERS.items()
        for column in (*mapper.columns, *(t.exported_as for t in mapper.transformed_columns.values()))
        if any(marker in column for marker in secret_markers) or column.endswith("_encrypted")
    ]
    assert not leaked, f"Secret-looking columns in the export: {leaked}"


# The app shows its owner these account numbers in full (the utility plan
# and mortgage responses carry them unmasked); the links hold the same
# numbers, learned from that user's bills.
_ACCOUNT_NUMBERS_THE_APP_SHOWS_IN_FULL = frozenset({
    "utility_plans.account_number",
    "mortgages.account_number",
    "utility_account_link.account_number",
})


def test_no_tax_id_column_is_exported_unmasked() -> None:
    unmasked = [
        f"{table_name}.{column}"
        for table_name, mapper in EXPORT_MAPPERS.items()
        for column in mapper.columns
        if column in PII_FIELD_IDS
        and f"{table_name}.{column}" not in _ACCOUNT_NUMBERS_THE_APP_SHOWS_IN_FULL
    ]
    assert not unmasked, f"Tax ID columns exported as stored instead of masked: {unmasked}"
