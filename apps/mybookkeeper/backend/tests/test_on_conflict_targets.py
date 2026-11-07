"""Every PostgreSQL upsert's conflict target must exist as the kind of object it names.

PostgreSQL resolves an ``ON CONFLICT`` target strictly:

- ``ON CONFLICT ON CONSTRAINT <name>`` accepts only a unique or exclusion
  *constraint*. A unique *index* with the same name is rejected at runtime with
  ``constraint ... does not exist``.
- ``ON CONFLICT (<columns>)`` needs a unique index or constraint on exactly
  those columns, or it fails with ``no unique or exclusion constraint matching
  the ON CONFLICT specification``.

The unit suite runs on SQLite, which checks neither. That gap let the
review-queue upsert name its unique index, so every booking email that needed
review raised instead of being queued.

This scans the app's source for ``on_conflict_do_nothing`` /
``on_conflict_do_update`` calls and checks each target against both the model
metadata and the Alembic migrations, which are what production actually ran.
"""
from __future__ import annotations

import ast
from dataclasses import dataclass
from pathlib import Path

from sqlalchemy import PrimaryKeyConstraint, Table, UniqueConstraint

from app.db.base import Base

_BACKEND_DIR = Path(__file__).resolve().parent.parent
_APP_DIR = _BACKEND_DIR / "app"
_MIGRATIONS_DIR = _BACKEND_DIR / "alembic" / "versions"
_UPSERT_METHODS = {"on_conflict_do_nothing", "on_conflict_do_update"}
_INSERT_FUNCS = {"pg_insert", "insert"}


@dataclass(frozen=True)
class _Upsert:
    where: str
    model: str | None
    constraint: str | None
    index_elements: frozenset[str] | None


def _call_name(node: ast.expr) -> str | None:
    if isinstance(node, ast.Name):
        return node.id
    if isinstance(node, ast.Attribute):
        return node.attr
    return None


def _insert_model(node: ast.expr) -> str | None:
    """Walk ``pg_insert(Model).values(...).on_conflict_...`` back to ``Model``."""
    while True:
        if isinstance(node, ast.Call):
            if _call_name(node.func) in _INSERT_FUNCS and node.args:
                return _call_name(node.args[0])
            node = node.func
        elif isinstance(node, ast.Attribute):
            node = node.value
        else:
            return None


def _string_list(node: ast.expr) -> frozenset[str] | None:
    if isinstance(node, (ast.List, ast.Tuple)) and all(
        isinstance(item, ast.Constant) and isinstance(item.value, str) for item in node.elts
    ):
        return frozenset(str(item.value) for item in node.elts)  # type: ignore[attr-defined]
    return None


def _upserts() -> list[_Upsert]:
    found: list[_Upsert] = []
    for path in sorted(_APP_DIR.rglob("*.py")):
        tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
        for node in ast.walk(tree):
            if not (
                isinstance(node, ast.Call)
                and isinstance(node.func, ast.Attribute)
                and node.func.attr in _UPSERT_METHODS
            ):
                continue
            keywords = {k.arg: k.value for k in node.keywords if k.arg}
            constraint = keywords.get("constraint")
            elements = keywords.get("index_elements")
            found.append(
                _Upsert(
                    where=f"{path.relative_to(_BACKEND_DIR)}:{node.lineno}",
                    model=_insert_model(node.func.value),
                    constraint=(
                        str(constraint.value)
                        if isinstance(constraint, ast.Constant)
                        else None
                    ),
                    index_elements=_string_list(elements) if elements is not None else None,
                )
            )
    return found


def _table_for(model: str | None) -> Table | None:
    for mapper in Base.registry.mappers:
        if mapper.class_.__name__ == model and isinstance(mapper.local_table, Table):
            return mapper.local_table
    return None


def _metadata_constraint_names() -> set[str]:
    return {
        constraint.name
        for table in Base.metadata.tables.values()
        for constraint in table.constraints
        if isinstance(constraint, (UniqueConstraint, PrimaryKeyConstraint))
        and isinstance(constraint.name, str)
    }


def _unique_column_sets(table: Table) -> set[frozenset[str]]:
    sets = {
        frozenset(column.name for column in constraint.columns)
        for constraint in table.constraints
        if isinstance(constraint, (UniqueConstraint, PrimaryKeyConstraint))
    }
    sets |= {
        frozenset(column.name for column in index.columns)
        for index in table.indexes
        if index.unique
    }
    return sets


def _migration_names() -> tuple[set[str], set[str]]:
    """Return ``(constraint names, unique index names)`` the migrations create."""
    constraints: set[str] = set()
    unique_indexes: set[str] = set()
    for path in sorted(_MIGRATIONS_DIR.glob("*.py")):
        tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
        for node in ast.walk(tree):
            if not isinstance(node, ast.Call):
                continue
            name = _call_name(node.func)
            keywords = {k.arg: k.value for k in node.keywords if k.arg}
            first = node.args[0] if node.args else None
            if name == "create_index" and isinstance(first, ast.Constant):
                unique = keywords.get("unique")
                if isinstance(unique, ast.Constant) and unique.value is True:
                    unique_indexes.add(str(first.value))
            elif name == "create_unique_constraint" and isinstance(first, ast.Constant):
                constraints.add(str(first.value))
            elif name in {"UniqueConstraint", "PrimaryKeyConstraint"}:
                named = keywords.get("name")
                if isinstance(named, ast.Constant):
                    constraints.add(str(named.value))
    return constraints, unique_indexes


class TestOnConflictTargets:
    def test_scan_finds_both_kinds_of_target(self) -> None:
        # Guards the scan itself: if it stops matching, the checks below
        # would pass vacuously.
        upserts = _upserts()
        assert any(u.constraint == "uq_blocklist_user_channel_listing" for u in upserts)
        assert any(
            u.index_elements == {"user_id", "email_message_id"} for u in upserts
        )

    def test_every_target_resolves_to_a_model(self) -> None:
        unresolved = [
            u.where
            for u in _upserts()
            if (u.constraint or u.index_elements) and _table_for(u.model) is None
        ]
        assert unresolved == []

    def test_named_targets_are_constraints_in_models_and_migrations(self) -> None:
        model_constraints = _metadata_constraint_names()
        migration_constraints, migration_unique_indexes = _migration_names()
        problems: list[str] = []
        for u in _upserts():
            if u.constraint is None:
                continue
            if u.constraint in migration_unique_indexes:
                problems.append(
                    f"{u.where}: {u.constraint!r} is created as a unique index, "
                    "not a constraint — use index_elements=[...]"
                )
            elif u.constraint not in migration_constraints:
                problems.append(
                    f"{u.where}: no migration creates constraint {u.constraint!r}"
                )
            if u.constraint not in model_constraints:
                problems.append(
                    f"{u.where}: {u.constraint!r} is not a unique or primary-key "
                    "constraint on any model"
                )
        assert problems == []

    def test_column_targets_match_a_unique_index_or_constraint(self) -> None:
        problems: list[str] = []
        for u in _upserts():
            if u.index_elements is None:
                continue
            table = _table_for(u.model)
            if table is None or u.index_elements not in _unique_column_sets(table):
                problems.append(
                    f"{u.where}: no unique index or constraint on "
                    f"{sorted(u.index_elements)}"
                )
        assert problems == []
