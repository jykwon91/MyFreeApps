"""Where the triage API lives and the token to reach it."""
from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class TriageConfig:
    base_url: str
    token: str

    def __repr__(self) -> str:  # never leak the token into a traceback
        return f"TriageConfig(base_url={self.base_url!r}, token=<hidden>)"
