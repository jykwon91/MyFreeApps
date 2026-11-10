"""Import every module of an app's models package."""
import importlib
from pathlib import Path
from types import ModuleType


def _module_names(package: ModuleType) -> list[str]:
    names: list[str] = []
    for search_path in package.__path__:
        root = Path(search_path)
        for path in sorted(root.rglob("*.py")):
            parts = path.relative_to(root).with_suffix("").parts
            if parts[-1] == "__init__":
                parts = parts[:-1]
            names.append(".".join((package.__name__, *parts)))
    return names


def load_all_models(package: ModuleType) -> None:
    """Import every ``.py`` file under ``package`` so each table registers on its metadata.

    Files are found on disk rather than via ``pkgutil.walk_packages``, so folders
    without an ``__init__.py`` are not skipped, and an import error surfaces
    instead of hiding a table. Apps whose runtime reads ``Base.metadata`` (e.g.
    MyBookkeeper) still need their own ``models/__init__`` completeness test:
    this only makes the metadata complete inside tests.
    """
    for name in _module_names(package):
        importlib.import_module(name)
