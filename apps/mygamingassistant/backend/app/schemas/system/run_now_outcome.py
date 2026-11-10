"""What ``scheduler_service.run_now`` did with the requested job ids."""
from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class RunNowOutcome:
    # Moved to run now.
    started: list[str]
    # Running already: max_instances=1 would skip a second run, so the caller
    # keeps the request and asks again once the current run has finished.
    busy: list[str]
