"""One page the model actually consulted during a research turn."""
from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class WebSource:
    url: str
    title: str | None = None
