"""Architecture test: route modules under app/api stay thin.

Routes delegate to services; data access (repositories, SQLAlchemy query
primitives, session factories) belongs below the service layer. The only
SQLAlchemy name a route may import is ``AsyncSession`` for the ``get_db``
dependency type annotation, which it passes straight to a service.
"""
from __future__ import annotations

import ast
from pathlib import Path

import pytest

API_DIR = Path(__file__).resolve().parent.parent / "app" / "api"
ALLOWED_SQLALCHEMY = {("sqlalchemy.ext.asyncio", "AsyncSession")}
FORBIDDEN_DB_NAMES = {"AsyncSessionLocal", "async_session_maker"}


def _violations(path: Path) -> list[str]:
    found: list[str] = []
    for node in ast.walk(ast.parse(path.read_text())):
        if isinstance(node, ast.Import):
            for alias in node.names:
                if alias.name.split(".")[0] == "sqlalchemy":
                    found.append(f"line {node.lineno}: import {alias.name}")
                if alias.name.startswith("app.repositories"):
                    found.append(f"line {node.lineno}: import {alias.name}")
        elif isinstance(node, ast.ImportFrom) and node.module:
            if node.module.startswith("app.repositories"):
                found.append(f"line {node.lineno}: from {node.module} import ...")
            elif node.module.split(".")[0] == "sqlalchemy":
                for alias in node.names:
                    if (node.module, alias.name) not in ALLOWED_SQLALCHEMY:
                        found.append(
                            f"line {node.lineno}: from {node.module} import {alias.name}"
                        )
            elif node.module == "app.repositories" or node.module == "app":
                for alias in node.names:
                    if alias.name == "repositories":
                        found.append(f"line {node.lineno}: from {node.module} import repositories")
            else:
                for alias in node.names:
                    if alias.name in FORBIDDEN_DB_NAMES:
                        found.append(f"line {node.lineno}: imports {alias.name}")
    return found


@pytest.mark.parametrize(
    "path", sorted(API_DIR.rglob("*.py")), ids=lambda p: str(p.relative_to(API_DIR)),
)
def test_api_module_has_no_data_access_imports(path: Path) -> None:
    assert _violations(path) == [], (
        f"{path.name} reaches below the service layer; move the data access "
        "into app/services and call it from the route"
    )
