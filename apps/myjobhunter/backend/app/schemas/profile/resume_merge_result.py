"""Outcome of merging one resume parse into a user's profile."""
from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class ResumeMergeResult:
    """How many work history / education rows were added vs matched."""

    work_history_added: int
    work_history_matched: int
    education_added: int
    education_matched: int
