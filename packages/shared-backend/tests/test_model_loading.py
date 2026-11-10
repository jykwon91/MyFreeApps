"""Unit tests for load_all_models."""
import importlib
import sys
from pathlib import Path

import pytest

from platform_shared.testing.model_loading import load_all_models


def _write(path: Path, body: str = "") -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(body)


@pytest.fixture
def models_package(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    name = f"fake_models_{tmp_path.name.replace('-', '_')}"
    root = tmp_path / name
    _write(root / "__init__.py")
    _write(root / "top.py", "LOADED_TOP = True")
    _write(root / "nested" / "__init__.py")
    _write(root / "nested" / "inner.py", "LOADED_INNER = True")
    _write(root / "no_init" / "orphan.py", "LOADED_ORPHAN = True")
    monkeypatch.syspath_prepend(str(tmp_path))
    importlib.invalidate_caches()
    yield name, root
    for module in [m for m in sys.modules if m == name or m.startswith(name + ".")]:
        del sys.modules[module]


def test_every_file_is_imported_including_folders_without_init(models_package) -> None:
    name, _ = models_package
    load_all_models(importlib.import_module(name))
    for module in ("top", "nested.inner", "no_init.orphan"):
        assert f"{name}.{module}" in sys.modules


def test_an_import_error_surfaces(models_package) -> None:
    name, root = models_package
    _write(root / "broken.py", "raise ImportError('boom')")
    with pytest.raises(ImportError, match="boom"):
        load_all_models(importlib.import_module(name))
