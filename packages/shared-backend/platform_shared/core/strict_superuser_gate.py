"""Type of the dependency ``make_strict_superuser_gate`` returns."""
from __future__ import annotations

from collections.abc import Awaitable, Callable
from typing import Any, Protocol

from fastapi import Request


class StrictSuperuserGate(Protocol):
    """A FastAPI dependency that always enforces the strict superuser gate."""

    def __call__(self, *args: Any, **kwargs: Any) -> Awaitable[Any]: ...

    def when(
        self,
        predicate: Callable[[Request], Awaitable[bool]],
        *,
        after: Callable[..., Any],
    ) -> Callable[..., Awaitable[Any]]:
        """Dependency enforcing the gate only when ``await predicate(request)`` is True.

        ``after`` is resolved first so the caller is authorised before the
        predicate looks anything up.
        """
        ...
