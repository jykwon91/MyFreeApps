"""Conformance test: ``<Toaster />`` is mounted exactly once, in ``src/App.tsx``.

The Toaster from ``@platform/ui`` must sit above the router so every route,
signed-in or public, shows toasts. Mounting it inside RootLayout (or any
other component) drops toasts fired on routes outside that layout, and a
second mount shows each toast twice.
"""
from __future__ import annotations

import re
from pathlib import Path

import pytest

_REPO_ROOT = Path(__file__).resolve().parents[3]
_TOASTER_MOUNT = re.compile(r"<Toaster(?=[\s/>])")
_SOURCE_SUFFIXES = {".ts", ".tsx", ".js", ".jsx"}
_TEST_SUFFIXES = (".test.", ".spec.")


def _is_test_file(path: Path, src: Path) -> bool:
    relative = path.relative_to(src)
    return "__tests__" in relative.parts or any(m in path.name for m in _TEST_SUFFIXES)


def has_toaster_mount(text: str) -> bool:
    """True if the source renders a ``<Toaster>`` element (not a mention in a comment)."""
    without_comments = re.sub(r"/\*.*?\*/|//[^\n]*", "", text, flags=re.DOTALL)
    return _TOASTER_MOUNT.search(without_comments) is not None


def toaster_mounts(src: Path) -> list[str]:
    """Paths (relative to ``src``) of non-test sources that mount a Toaster."""
    return sorted(
        path.relative_to(src).as_posix()
        for path in src.rglob("*")
        if path.is_file()
        and path.suffix in _SOURCE_SUFFIXES
        and not _is_test_file(path, src)
        and has_toaster_mount(path.read_text(encoding="utf-8"))
    )


def _frontend_sources() -> list[Path]:
    apps = sorted((_REPO_ROOT / "apps").glob("*/frontend/src"))
    return [*apps, _REPO_ROOT / "infra" / "templates" / "scaffold" / "frontend" / "src"]


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ("<Toaster />", True),
        ("<Toaster/>", True),
        ("<Toaster position=\"top\" />", True),
        ("<>\n  <Toaster>\n</>", True),
        ("import { Toaster } from \"@platform/ui\";", False),
        ("<ToasterProvider />", False),
        ("// <Toaster /> lives in App.tsx", False),
        ("/* <Toaster /> */", False),
        ("", False),
    ],
)
def test_has_toaster_mount_detection(text: str, expected: bool) -> None:
    assert has_toaster_mount(text) is expected


def test_toaster_mounts_ignores_test_files(tmp_path: Path) -> None:
    (tmp_path / "__tests__").mkdir()
    (tmp_path / "__tests__" / "a.tsx").write_text("<Toaster />")
    (tmp_path / "b.test.tsx").write_text("<Toaster />")
    (tmp_path / "App.tsx").write_text("<Toaster />")
    assert toaster_mounts(tmp_path) == ["App.tsx"]


def test_discovers_every_frontend() -> None:
    sources = _frontend_sources()
    assert len(sources) >= 7, f"expected the app frontends plus the scaffold, found {sources}"
    assert all(src.is_dir() for src in sources)


@pytest.mark.parametrize("src", _frontend_sources(), ids=lambda src: src.parts[-3])
def test_toaster_mounted_once_in_app_tsx(src: Path) -> None:
    mounts = toaster_mounts(src)
    assert mounts == ["App.tsx"], (
        f"{src.relative_to(_REPO_ROOT)}: <Toaster /> must be mounted exactly once, in src/App.tsx "
        f"above <RouterProvider />, so toasts show on every route (signed-in and public) and never "
        f"twice. Found mounts in: {mounts or 'no file'}. Fix: remove the <Toaster /> from those "
        f"files and render it in App.tsx next to <RouterProvider />."
    )
