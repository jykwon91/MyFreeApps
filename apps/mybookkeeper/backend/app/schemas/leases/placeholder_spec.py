"""Plain-value description of one lease-template placeholder row."""
from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class PlaceholderSpec:
    key: str
    display_label: str
    input_type: str
    required: bool
    default_source: str | None
    computed_expr: str | None
    display_order: int
