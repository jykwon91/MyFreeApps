"""One configured WoW feature-request triage token and its label."""
from dataclasses import dataclass


@dataclass(frozen=True)
class TriageToken:
    # Names the caller in logs and audit_logs ("browser", "cli", "default").
    label: str
    # The secret itself — never logged, never put in a response.
    token: str

    def __repr__(self) -> str:
        return f"TriageToken(label={self.label!r}, token=<redacted>)"
