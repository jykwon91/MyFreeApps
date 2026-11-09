"""A template upload that passed validation, with its text already extracted."""
from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class ValidatedTemplateFile:
    filename: str
    content: bytes
    content_type: str
    text: str
