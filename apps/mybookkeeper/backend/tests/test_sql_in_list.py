"""``sql_in_list`` renders every enum CheckConstraint, so a private copy that
drifts from it would silently change a constraint."""
import ast
from pathlib import Path

from app.core.sql_in_list import sql_in_list

_APP = Path(__file__).resolve().parent.parent / "app"


def test_renders_a_quoted_in_list() -> None:
    assert sql_in_list(("a", "b_c")) == "('a', 'b_c')"


def test_renders_a_single_value() -> None:
    assert sql_in_list(("only",)) == "('only')"


def test_no_module_defines_its_own_copy() -> None:
    copies = [
        f"{path.relative_to(_APP)}:{node.lineno}"
        for path in _APP.rglob("*.py")
        if path.name != "sql_in_list.py"
        for node in ast.walk(ast.parse(path.read_text()))
        if isinstance(node, ast.FunctionDef) and node.name.lstrip("_") == "sql_in_list"
    ]
    assert copies == []
