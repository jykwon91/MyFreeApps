"""Read an app's audit configuration and model names from source, for the
conformance tests that check every app without importing it."""
from __future__ import annotations

import ast
from collections.abc import Iterator
from pathlib import Path


def audit_config_names(audit_py: Path, suffix: str) -> set[str]:
    """String names in ``audit_py``'s ``*<suffix>`` frozenset (``_SENSITIVE_FIELDS``,
    ``_SKIP_TABLES``, ``_SKIP_FIELDS``)."""
    tree = ast.parse(audit_py.read_text(encoding="utf-8"))
    names: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.AnnAssign | ast.Assign):
            targets = [node.target] if isinstance(node, ast.AnnAssign) else node.targets
            if any(isinstance(t, ast.Name) and t.id.endswith(suffix) for t in targets) and node.value:
                names |= {
                    c.value for c in ast.walk(node.value)
                    if isinstance(c, ast.Constant) and isinstance(c.value, str)
                }
    return names


def _model_classes(model_dirs: list[Path]) -> Iterator[ast.ClassDef]:
    for model_dir in model_dirs:
        for path in sorted(model_dir.rglob("*.py")):
            for node in ast.walk(ast.parse(path.read_text(encoding="utf-8"))):
                if isinstance(node, ast.ClassDef):
                    yield node


def model_table_names(model_dirs: list[Path]) -> set[str]:
    """Every literal ``__tablename__`` in the classes under ``model_dirs``."""
    return {
        stmt.value.value
        for cls in _model_classes(model_dirs)
        for stmt in cls.body
        if isinstance(stmt, ast.Assign)
        and any(isinstance(t, ast.Name) and t.id == "__tablename__" for t in stmt.targets)
        and isinstance(stmt.value, ast.Constant)
    }


def model_attribute_names(model_dirs: list[Path]) -> set[str]:
    """Every annotated class attribute under ``model_dirs``: the mapped column
    attributes, plus relationships, which the listener also never matches."""
    return {
        stmt.target.id
        for cls in _model_classes(model_dirs)
        for stmt in cls.body
        if isinstance(stmt, ast.AnnAssign) and isinstance(stmt.target, ast.Name)
    }
