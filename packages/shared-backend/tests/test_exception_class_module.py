"""exception_class_module: an exception class's module, as Sentry names it."""

from __future__ import annotations

import pytest

from platform_shared.core.exception_class_module import exception_class_module


class _AppError(Exception):
    """An app's own error class."""


def test_a_class_has_the_module_it_was_defined_in() -> None:
    assert exception_class_module(_AppError) == _AppError.__module__


def test_a_module_set_on_the_class_is_used() -> None:
    cls = type("Error", (Exception,), {"__module__": "asyncpg.exceptions"})
    assert exception_class_module(cls) == "asyncpg.exceptions"


@pytest.mark.parametrize(
    "cls", [ValueError, KeyboardInterrupt], ids=["exception", "base-exception"]
)
def test_a_builtin_class_has_none(cls: type[BaseException]) -> None:
    """Sentry sends ``module: null`` for one."""
    assert exception_class_module(cls) is None


def test_a_module_that_is_not_a_string_is_none() -> None:
    cls = type("Error", (Exception,), {"__module__": None})
    assert exception_class_module(cls) is None
