"""Every system event type the app writes must be one the database accepts.

``record_event`` swallows write failures, so a type missing from
``SYSTEM_EVENT_TYPES`` (and so from ``ck_system_events_event_type``) is lost
without any error. The lease-email and taxpayer-PII events were lost that way.
"""
import ast
from pathlib import Path

import pytest
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.system_event_enums import SYSTEM_EVENT_TYPES
from app.repositories import system_event_repo

_APP_DIR = Path(__file__).resolve().parent.parent / "app"
_WRITERS = {"record_event", "record"}


def _writer_name(call: ast.Call) -> str | None:
    func = call.func
    if isinstance(func, ast.Name) and func.id == "record_event":
        return func.id
    if isinstance(func, ast.Attribute) and func.attr in _WRITERS:
        owner = func.value
        if func.attr == "record_event" or (
            isinstance(owner, ast.Name) and owner.id == "system_event_repo"
        ):
            return func.attr
    return None


def _event_type_arg(call: ast.Call) -> ast.expr | None:
    for kw in call.keywords:
        if kw.arg == "event_type":
            return kw.value
    # record_event(org_id, event_type, ...) / system_event_repo.record(db, org_id, event_type, ...)
    index = 1 if _writer_name(call) == "record_event" else 2
    return call.args[index] if len(call.args) > index else None


def _written_event_types() -> list[tuple[str, int, ast.expr | None]]:
    found: list[tuple[str, int, ast.expr | None]] = []
    for path in _APP_DIR.rglob("*.py"):
        if path.match("**/repositories/system/system_event_repo.py") or path.match(
            "**/services/system/event_service.py"
        ):
            continue
        tree = ast.parse(path.read_text(), filename=str(path))
        for node in ast.walk(tree):
            if isinstance(node, ast.Call) and _writer_name(node) is not None:
                rel = str(path.relative_to(_APP_DIR.parent))
                found.append((rel, node.lineno, _event_type_arg(node)))
    return found


def test_the_scan_finds_the_known_writers() -> None:
    files = {f for f, _, _ in _written_event_types()}
    assert "app/services/leases/lease_email_service.py" in files
    assert "app/services/organization/taxpayer_profile_service.py" in files


def _literal_values(arg: ast.expr | None) -> list[str] | None:
    """The string literals an event-type argument can be, or None if it isn't only literals."""
    if isinstance(arg, ast.Constant) and isinstance(arg.value, str):
        return [arg.value]
    if isinstance(arg, ast.IfExp):
        body, orelse = _literal_values(arg.body), _literal_values(arg.orelse)
        if body is not None and orelse is not None:
            return body + orelse
    return None


def test_every_written_event_type_is_allowed() -> None:
    problems = []
    for file, line, arg in _written_event_types():
        values = _literal_values(arg)
        if values is None:
            problems.append(f"{file}:{line} passes an event type that isn't a literal")
            continue
        problems.extend(
            f"{file}:{line} writes {v!r}, not in SYSTEM_EVENT_TYPES"
            for v in values if v not in SYSTEM_EVENT_TYPES
        )
    assert problems == []


def test_event_types_are_unique() -> None:
    assert len(SYSTEM_EVENT_TYPES) == len(set(SYSTEM_EVENT_TYPES))


@pytest.mark.asyncio
@pytest.mark.parametrize("event_type", SYSTEM_EVENT_TYPES)
async def test_every_allowed_type_is_stored(db: AsyncSession, event_type: str) -> None:
    event = await system_event_repo.record(db, None, event_type, "info", "stored")

    assert event.id is not None


@pytest.mark.asyncio
async def test_an_unknown_type_is_rejected(db: AsyncSession) -> None:
    with pytest.raises(IntegrityError):
        await system_event_repo.record(db, None, "not_a_real_type", "info", "rejected")
