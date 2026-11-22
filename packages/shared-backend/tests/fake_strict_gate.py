"""A stand-in strict gate with the ``when`` builder the admin router requires."""
from __future__ import annotations

from collections.abc import Callable
from typing import Any

from platform_shared.core.strict_superuser_gate import StrictSuperuserGate


def as_strict_gate(dependency: Callable[..., Any]) -> StrictSuperuserGate:
    """``when`` hands back the same dependency, so the stand-in gates every call."""
    dependency.when = lambda predicate, *, after: dependency  # type: ignore[attr-defined]
    return dependency  # type: ignore[return-value]
