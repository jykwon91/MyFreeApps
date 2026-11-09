"""Plain-value description of a template file row about to be written."""
from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class NewTemplateFile:
    filename: str
    storage_key: str
    content_type: str
    size_bytes: int
