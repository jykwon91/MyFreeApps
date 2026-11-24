"""The seam to Plaid's HTTP API.

Async ``httpx`` rather than the ``plaid-python`` SDK: the SDK is synchronous
(every call would block the event loop or need a thread) and returns generated
model objects; Plaid's API is plain JSON POSTs with a documented error body,
which this module parses into ``PlaidApiError`` so no failure loses its codes.
Responses are validated into the ``app.schemas.plaid.wire`` models.

Tests mock this module's functions — it is the only place that talks to Plaid.
Access tokens are passed in and never logged.
"""
from __future__ import annotations

import logging
from typing import Any

import httpx
from pydantic import BaseModel, ValidationError

from app.core.config import settings
from app.core.plaid_constants import (
    PLAID_CLIENT_NAME,
    PLAID_COUNTRY_CODES,
    PLAID_ENVIRONMENT_URLS,
    PLAID_ERROR_MUTATION_DURING_PAGINATION,
    PLAID_HTTP_TIMEOUT_SECONDS,
    PLAID_LANGUAGE,
    PLAID_PRODUCTS,
    PLAID_SYNC_MAX_RESTARTS,
    PLAID_SYNC_PAGE_SIZE,
    PLAID_TRANSACTIONS_DAYS_REQUESTED,
    PLAID_WEBHOOK_PATH,
)
from app.core.plaid_not_configured_error import PlaidNotConfiguredError
from app.schemas.plaid.plaid_sync_batch import PlaidSyncBatch
from app.schemas.plaid.wire.plaid_wire_account import PlaidWireAccount
from app.schemas.plaid.wire.plaid_wire_accounts_response import PlaidWireAccountsResponse
from app.schemas.plaid.wire.plaid_wire_error import PlaidWireError
from app.schemas.plaid.wire.plaid_wire_exchange_response import PlaidWireExchangeResponse
from app.schemas.plaid.wire.plaid_wire_link_token_response import PlaidWireLinkTokenResponse
from app.schemas.plaid.wire.plaid_wire_sync_page import PlaidWireSyncPage
from app.schemas.plaid.wire.plaid_wire_transaction import PlaidWireTransaction
from app.schemas.plaid.wire.plaid_wire_verification_key import PlaidWireVerificationKey
from app.services.plaid.plaid_api_error import PlaidApiError

logger = logging.getLogger(__name__)

# Plaid answered 2xx with a body that isn't what its docs describe.
_MALFORMED_RESPONSE = "MALFORMED_RESPONSE"
# The request never got an answer (DNS, TLS, timeout).
_NETWORK_ERROR = "NETWORK_ERROR"


def is_configured() -> bool:
    return bool(settings.plaid_client_id and settings.plaid_secret)


def _webhook_url() -> str | None:
    """Plaid only delivers to a public https origin; local dev gets none."""
    origin = settings.frontend_url.rstrip("/")
    return f"{origin}{PLAID_WEBHOOK_PATH}" if origin.startswith("https://") else None


async def _post(endpoint: str, body: dict[str, Any]) -> dict[str, Any]:
    if not is_configured():
        raise PlaidNotConfiguredError(
            "PLAID_CLIENT_ID and PLAID_SECRET are not set; bank sync is unavailable.",
        )
    url = f"{PLAID_ENVIRONMENT_URLS[settings.plaid_env]}{endpoint}"
    payload = {"client_id": settings.plaid_client_id, "secret": settings.plaid_secret, **body}
    try:
        async with httpx.AsyncClient(timeout=PLAID_HTTP_TIMEOUT_SECONDS) as client:
            response = await client.post(url, json=payload)
    except httpx.HTTPError as exc:
        logger.warning("Plaid %s unreachable: %s", endpoint, type(exc).__name__)
        raise PlaidApiError(
            endpoint=endpoint, status_code=0, error_type="API_ERROR",
            error_code=_NETWORK_ERROR, request_id=None,
        ) from exc
    if response.is_success:
        return response.json()
    try:
        error = PlaidWireError.model_validate(response.json())
    except (ValueError, ValidationError):
        error = PlaidWireError()
    logger.warning(
        "Plaid %s failed: status=%s error_type=%s error_code=%s request_id=%s",
        endpoint, response.status_code, error.error_type, error.error_code, error.request_id,
    )
    raise PlaidApiError(
        endpoint=endpoint,
        status_code=response.status_code,
        error_type=error.error_type,
        error_code=error.error_code,
        request_id=error.request_id,
    )


def _parse[T: BaseModel](model: type[T], endpoint: str, data: dict[str, Any]) -> T:
    try:
        return model.model_validate(data)
    except ValidationError as exc:
        logger.error("Plaid %s answered with an unexpected body: %s", endpoint, exc.errors()[:3])
        raise PlaidApiError(
            endpoint=endpoint, status_code=200, error_type="API_ERROR",
            error_code=_MALFORMED_RESPONSE, request_id=data.get("request_id"),
        ) from exc


async def create_link_token(
    *, client_user_id: str, access_token: str | None = None,
) -> PlaidWireLinkTokenResponse:
    """A Link token. With ``access_token`` it opens Link in update mode
    (reconnect an existing item) and asks for no products."""
    body: dict[str, Any] = {
        "client_name": PLAID_CLIENT_NAME,
        "country_codes": list(PLAID_COUNTRY_CODES),
        "language": PLAID_LANGUAGE,
        "user": {"client_user_id": client_user_id},
    }
    if access_token is None:
        body["products"] = list(PLAID_PRODUCTS)
        body["transactions"] = {"days_requested": PLAID_TRANSACTIONS_DAYS_REQUESTED}
    else:
        body["access_token"] = access_token
    webhook = _webhook_url()
    if webhook:
        body["webhook"] = webhook
    if settings.plaid_redirect_uri:
        body["redirect_uri"] = settings.plaid_redirect_uri
    endpoint = "/link/token/create"
    return _parse(PlaidWireLinkTokenResponse, endpoint, await _post(endpoint, body))


async def exchange_public_token(public_token: str) -> PlaidWireExchangeResponse:
    endpoint = "/item/public_token/exchange"
    data = await _post(endpoint, {"public_token": public_token})
    return _parse(PlaidWireExchangeResponse, endpoint, data)


async def get_accounts(access_token: str) -> list[PlaidWireAccount]:
    endpoint = "/accounts/get"
    data = await _post(endpoint, {"access_token": access_token})
    return _parse(PlaidWireAccountsResponse, endpoint, data).accounts


async def remove_item(access_token: str) -> None:
    await _post("/item/remove", {"access_token": access_token})


async def get_webhook_verification_key(key_id: str) -> PlaidWireVerificationKey:
    endpoint = "/webhook_verification_key/get"
    data = await _post(endpoint, {"key_id": key_id})
    return _parse(PlaidWireVerificationKey, endpoint, data.get("key") or {})


async def _sync_pages(access_token: str, cursor: str | None) -> PlaidSyncBatch:
    added: list[PlaidWireTransaction] = []
    modified: list[PlaidWireTransaction] = []
    removed: list[str] = []
    accounts: list[PlaidWireAccount] = []
    next_cursor = cursor or ""
    endpoint = "/transactions/sync"
    while True:
        body: dict[str, Any] = {"access_token": access_token, "count": PLAID_SYNC_PAGE_SIZE}
        if next_cursor:
            body["cursor"] = next_cursor
        page = _parse(PlaidWireSyncPage, endpoint, await _post(endpoint, body))
        added.extend(page.added)
        modified.extend(page.modified)
        removed.extend(r.transaction_id for r in page.removed)
        if page.accounts:
            accounts = page.accounts
        next_cursor = page.next_cursor
        if not page.has_more:
            return PlaidSyncBatch(
                added=added, modified=modified, removed=removed,
                accounts=accounts, next_cursor=next_cursor,
            )


async def sync_transactions(access_token: str, cursor: str | None) -> PlaidSyncBatch:
    """Every change since ``cursor`` (all history when None), all pages joined.

    Plaid requires restarting from the first cursor when the data changes
    mid-pagination; that is retried a few times before the error is raised.
    """
    for attempt in range(PLAID_SYNC_MAX_RESTARTS + 1):
        try:
            return await _sync_pages(access_token, cursor)
        except PlaidApiError as exc:
            if exc.error_code != PLAID_ERROR_MUTATION_DURING_PAGINATION or attempt == PLAID_SYNC_MAX_RESTARTS:
                raise
            logger.info("Plaid data changed mid-sync; restarting from the first cursor")
    raise AssertionError("unreachable")
