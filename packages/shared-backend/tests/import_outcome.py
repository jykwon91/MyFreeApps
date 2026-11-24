"""A caller's own record holding an exception, for the scrubbing tests."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass
class ImportOutcome:
    """How importing one row went: the row, and the error it failed with, if any."""

    row: int
    error: BaseException | None
