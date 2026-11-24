"""Raised for every non-2xx answer from Plaid, carrying Plaid's own codes.

Per the third-party-error-codes rule the codes are never thrown away: callers
route on ``error_code`` (``ITEM_LOGIN_REQUIRED`` → reconnect) and store it on
the item so the reason is visible without the logs.
"""
from __future__ import annotations


class PlaidApiError(Exception):
    def __init__(
        self,
        *,
        endpoint: str,
        status_code: int,
        error_type: str,
        error_code: str,
        request_id: str | None,
    ) -> None:
        super().__init__(f"Plaid {endpoint} failed: {error_type}/{error_code} (HTTP {status_code})")
        self.endpoint = endpoint
        self.status_code = status_code
        self.error_type = error_type
        self.error_code = error_code
        self.request_id = request_id
