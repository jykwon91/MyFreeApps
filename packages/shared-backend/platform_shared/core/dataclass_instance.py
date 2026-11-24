"""Whether a value is an instance of a dataclass."""

from __future__ import annotations

import dataclasses
from typing import TYPE_CHECKING, TypeGuard

if TYPE_CHECKING:
    from _typeshed import DataclassInstance


def is_dataclass_instance(value: object) -> TypeGuard[DataclassInstance]:
    """True for an instance of a dataclass. False for anything else, a dataclass
    itself included."""
    return dataclasses.is_dataclass(value) and not isinstance(value, type)


__all__ = ["is_dataclass_instance"]
