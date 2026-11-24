"""The module an exception class is named with."""

from __future__ import annotations

from platform_shared.core.database_error_constants import BUILTIN_MODULES


def exception_class_module(cls: type[BaseException]) -> str | None:
    """``cls``'s module as Sentry and tracebacks name it, or None when they name the
    class alone: a builtin (``ValueError``, not ``builtins.ValueError``), or a class
    whose ``__module__`` isn't a string."""
    module = getattr(cls, "__module__", None)
    if not isinstance(module, str) or module in BUILTIN_MODULES:
        return None
    return module


__all__ = ["exception_class_module"]
