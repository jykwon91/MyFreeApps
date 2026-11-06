"""Thin HTTP client for ``/wow/feature-requests/triage``.

Every write sends ``If-Match`` with the story's ``updated_at``; a 412 means the
story changed since it was read (a vote, or another triage run) and the plan
must be re-read. Errors carry the status and the API's ``detail`` — never the
token.
"""
from __future__ import annotations

from typing import Any

import httpx

from scripts.wow_feature_triage.triage_api_error import TriageApiError
from scripts.wow_feature_triage.triage_connection import TriageConfig

TRIAGE_PATH = "/wow/feature-requests/triage"
TOKEN_HEADER = "X-MGA-Triage-Token"
TIMEOUT_SECONDS = 30.0


class TriageClient:
    def __init__(self, config: TriageConfig, *, transport: httpx.BaseTransport | None = None) -> None:
        self._http = httpx.Client(
            base_url=f"{config.base_url}{TRIAGE_PATH}",
            headers={TOKEN_HEADER: config.token},
            timeout=TIMEOUT_SECONDS,
            transport=transport,
        )

    def close(self) -> None:
        self._http.close()

    def __enter__(self) -> "TriageClient":
        return self

    def __exit__(self, *_exc: object) -> None:
        self.close()

    def _send(self, action: str, method: str, path: str, **kwargs: Any) -> dict[str, Any]:
        response = self._http.request(method, path, **kwargs)
        if response.status_code >= 400:
            try:
                detail: object = response.json().get("detail")
            except ValueError:
                detail = response.text[:200]
            raise TriageApiError(response.status_code, detail, action=action)
        return response.json()

    def inbox(self) -> dict[str, Any]:
        return self._send("inbox", "GET", "/inbox")

    def stories(self, statuses: list[str] | None = None) -> list[dict[str, Any]]:
        params = [("status", s) for s in statuses or []]
        return self._send("stories", "GET", "/stories", params=params)["items"]

    def patch(self, story_id: str, changes: dict[str, Any], *, version: str) -> dict[str, Any]:
        return self._send(
            f"patch {story_id}", "PATCH", f"/stories/{story_id}", json=changes, headers={"If-Match": version}
        )

    def merge(self, story_id: str, into_story_id: str, *, version: str) -> dict[str, Any]:
        return self._send(
            f"merge {story_id}",
            "POST",
            f"/stories/{story_id}/merge",
            json={"into_story_id": into_story_id},
            headers={"If-Match": version},
        )

    def mark_triaged(self, submission_ids: list[str]) -> dict[str, Any]:
        return self._send(
            "mark-triaged", "POST", "/submissions/mark-triaged", json={"submission_ids": submission_ids}
        )
