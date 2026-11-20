"""Outcome of merging one resume parse into a user's profile."""
from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class ResumeMergeResult:
    """How many work history / education rows were added, matched, and filled.

    ``*_filled`` counts the matched rows that had at least one empty field
    filled from the parse, so it is always <= ``*_matched``.
    """

    work_history_added: int
    work_history_matched: int
    work_history_filled: int
    education_added: int
    education_matched: int
    education_filled: int

    @property
    def work_history_changed(self) -> bool:
        """True when the merge inserted or modified any work history row."""
        return self.work_history_added > 0 or self.work_history_filled > 0
