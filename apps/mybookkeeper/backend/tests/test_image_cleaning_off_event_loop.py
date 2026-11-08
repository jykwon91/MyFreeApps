"""Photo re-encoding and report scanning never run on the event loop.

Re-encoding a photo of up to 144 megapixels (and the screening report's virus
scan) blocks for seconds; called directly inside an ``async def`` it stalls
every other request on the server. Async code must hand them to a worker
thread with ``asyncio.to_thread``.
"""
from __future__ import annotations

import ast
from pathlib import Path

import pytest

_SERVICES = Path(__file__).resolve().parents[1] / "app" / "services"
_BLOCKING = frozenset({
    "clean_attachment",
    "process_image",
    "process_report",
    "strip_metadata",
    "strip_photo_metadata",
})


def _called_name(call: ast.Call) -> str | None:
    if isinstance(call.func, ast.Name):
        return call.func.id
    if isinstance(call.func, ast.Attribute):
        return call.func.attr
    return None


def _direct_blocking_calls(path: Path) -> list[str]:
    found: list[str] = []
    for fn in ast.walk(ast.parse(path.read_text())):
        if not isinstance(fn, ast.AsyncFunctionDef):
            continue
        for node in ast.walk(fn):
            if isinstance(node, ast.Call) and _called_name(node) in _BLOCKING:
                found.append(f"{path.name}:{node.lineno} {fn.name} calls {_called_name(node)}()")
    return found


def test_no_async_service_calls_image_cleaning_directly() -> None:
    offenders = [hit for path in sorted(_SERVICES.rglob("*.py")) for hit in _direct_blocking_calls(path)]
    assert offenders == [], "use asyncio.to_thread:\n" + "\n".join(offenders)


@pytest.mark.parametrize("source", [
    "async def f(c):\n    return clean_attachment(c, ALLOWED)\n",
    "async def f(c):\n    return image_processor.process_image(c)\n",
])
def test_the_check_catches_a_direct_call(tmp_path: Path, source: str) -> None:
    path = tmp_path / "probe.py"
    path.write_text(source)
    assert _direct_blocking_calls(path)


def test_the_check_allows_to_thread(tmp_path: Path) -> None:
    path = tmp_path / "probe.py"
    path.write_text("async def f(c):\n    return await asyncio.to_thread(clean_attachment, c, ALLOWED)\n")
    assert _direct_blocking_calls(path) == []
