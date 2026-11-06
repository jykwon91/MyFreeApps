"""A triage API call that answered 4xx/5xx (status + the API's ``detail``)."""
from __future__ import annotations


class TriageApiError(Exception):
    def __init__(self, status_code: int, detail: object, *, action: str) -> None:
        super().__init__(f"{action}: HTTP {status_code} {detail}")
        self.status_code = status_code
        self.detail = detail
