"""Raised when two writes to the same template collide."""
from __future__ import annotations


class TemplateWriteConflictError(RuntimeError):
    """Another request changed the template's files at the same time."""
