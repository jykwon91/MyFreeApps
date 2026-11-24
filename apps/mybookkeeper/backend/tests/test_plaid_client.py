"""The Plaid HTTP seam, with httpx answered by a ``MockTransport``.

Pinned here: credentials ride in the body, a refusal keeps Plaid's
error_type / error_code / request_id, a network failure and a malformed body
become ``PlaidApiError`` too, sync pages are joined and restarted from the
first cursor when Plaid reports a mutation mid-pagination, a Link token in
update mode asks for no products, and nothing is sent when Plaid is not set up.
"""
from __future__ import annotations

import json
from collections.abc import Callable, Iterator
from contextlib import contextmanager
from typing import Any
from unittest.mock import patch

import httpx
import pytest

from app.core.config import settings
from app.core.plaid_not_configured_error import PlaidNotConfiguredError
from app.services.plaid import plaid_client
from app.services.plaid.plaid_api_error import PlaidApiError

pytestmark = pytest.mark.asyncio

_REAL_ASYNC_CLIENT = httpx.AsyncClient
_Handler = Callable[[httpx.Request], httpx.Response]


@contextmanager
def _plaid(handler: _Handler, *, client_id: str = "client-1", secret: str = "secret-1") -> Iterator[list[dict[str, Any]]]:
    sent: list[dict[str, Any]] = []

    def _record(request: httpx.Request) -> httpx.Response:
        sent.append({"path": request.url.path, **json.loads(request.content)})
        return handler(request)

    def _client(**kwargs: Any) -> httpx.AsyncClient:
        return _REAL_ASYNC_CLIENT(transport=httpx.MockTransport(_record), **kwargs)

    with (
        patch.object(settings, "plaid_client_id", client_id),
        patch.object(settings, "plaid_secret", secret),
        patch.object(settings, "plaid_env", "sandbox"),
        patch.object(settings, "plaid_redirect_uri", "https://books.example/plaid-oauth"),
        patch.object(settings, "frontend_url", "https://books.example"),
        patch.object(plaid_client.httpx, "AsyncClient", _client),
    ):
        yield sent


def _page(*, cursor: str, has_more: bool, added: list[str] | None = None) -> dict[str, Any]:
    return {
        "added": [
            {"transaction_id": t, "account_id": "acc-1", "amount": 1.0, "date": "2026-11-02", "name": t}
            for t in (added or [])
        ],
        "modified": [], "removed": [], "accounts": [],
        "next_cursor": cursor, "has_more": has_more,
    }


async def test_a_refusal_keeps_plaids_codes() -> None:
    def handler(_: httpx.Request) -> httpx.Response:
        return httpx.Response(400, json={
            "error_type": "ITEM_ERROR", "error_code": "ITEM_LOGIN_REQUIRED",
            "error_message": "the login details have changed", "request_id": "req-9",
        })

    with _plaid(handler), pytest.raises(PlaidApiError) as raised:
        await plaid_client.get_accounts("access-1")

    assert (raised.value.status_code, raised.value.error_type, raised.value.error_code, raised.value.request_id) == (
        400, "ITEM_ERROR", "ITEM_LOGIN_REQUIRED", "req-9",
    )


async def test_credentials_go_in_the_body_to_the_sandbox_host() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.host == "sandbox.plaid.com"
        return httpx.Response(200, json={"accounts": [], "request_id": "r"})

    with _plaid(handler) as sent:
        await plaid_client.get_accounts("access-1")

    assert sent[0] == {
        "path": "/accounts/get", "client_id": "client-1", "secret": "secret-1", "access_token": "access-1",
    }


async def test_a_network_failure_is_a_plaid_error_not_a_crash() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("no route", request=request)

    with _plaid(handler), pytest.raises(PlaidApiError) as raised:
        await plaid_client.remove_item("access-1")
    assert raised.value.error_code == "NETWORK_ERROR"


async def test_a_malformed_success_body_is_a_plaid_error() -> None:
    with _plaid(lambda _: httpx.Response(200, json={"unexpected": True})), pytest.raises(PlaidApiError) as raised:
        await plaid_client.exchange_public_token("public-1")
    assert raised.value.error_code == "MALFORMED_RESPONSE"


async def test_a_non_json_error_body_still_raises_with_unknown_codes() -> None:
    with _plaid(lambda _: httpx.Response(502, text="bad gateway")), pytest.raises(PlaidApiError) as raised:
        await plaid_client.remove_item("access-1")
    assert (raised.value.status_code, raised.value.error_code) == (502, "UNKNOWN")


async def test_nothing_is_sent_when_plaid_is_not_set_up() -> None:
    with _plaid(lambda _: httpx.Response(200, json={})) as sent, pytest.raises(PlaidNotConfiguredError):
        with patch.object(settings, "plaid_secret", ""):
            await plaid_client.get_accounts("access-1")
    assert sent == []


async def test_sync_joins_every_page_and_returns_the_last_cursor() -> None:
    pages = iter([
        _page(cursor="c-1", has_more=True, added=["t-1"]),
        _page(cursor="c-2", has_more=False, added=["t-2"]),
    ])
    with _plaid(lambda _: httpx.Response(200, json=next(pages))) as sent:
        batch = await plaid_client.sync_transactions("access-1", None)

    assert [t.transaction_id for t in batch.added] == ["t-1", "t-2"]
    assert batch.next_cursor == "c-2"
    assert "cursor" not in sent[0]
    assert sent[1]["cursor"] == "c-1"


async def test_a_mutation_mid_pagination_restarts_from_the_first_cursor() -> None:
    answers = iter([
        httpx.Response(200, json=_page(cursor="c-1", has_more=True, added=["t-stale"])),
        httpx.Response(400, json={"error_type": "TRANSACTIONS_ERROR", "error_code": "TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION"}),
        httpx.Response(200, json=_page(cursor="c-9", has_more=False, added=["t-fresh"])),
    ])
    with _plaid(lambda _: next(answers)) as sent:
        batch = await plaid_client.sync_transactions("access-1", "c-0")

    assert [t.transaction_id for t in batch.added] == ["t-fresh"]
    assert [call.get("cursor") for call in sent] == ["c-0", "c-1", "c-0"]


async def test_link_token_for_a_new_connection_asks_for_transactions() -> None:
    answer = {"link_token": "link-1", "expiration": "2026-11-23T12:00:00Z", "request_id": "r"}
    with _plaid(lambda _: httpx.Response(200, json=answer)) as sent:
        token = await plaid_client.create_link_token(client_user_id="user-1")

    assert token.link_token == "link-1"
    body = sent[0]
    assert body["products"] == ["transactions"]
    assert body["redirect_uri"] == "https://books.example/plaid-oauth"
    assert body["webhook"] == "https://books.example/api/plaid/webhook"
    assert "access_token" not in body


async def test_link_token_in_update_mode_asks_for_no_products() -> None:
    answer = {"link_token": "link-2", "expiration": "2026-11-23T12:00:00Z"}
    with _plaid(lambda _: httpx.Response(200, json=answer)) as sent:
        await plaid_client.create_link_token(client_user_id="user-1", access_token="access-1")
    assert sent[0]["access_token"] == "access-1"
    assert "products" not in sent[0]


async def test_no_webhook_is_registered_from_a_plain_http_origin() -> None:
    answer = {"link_token": "link-3", "expiration": "2026-11-23T12:00:00Z"}
    with _plaid(lambda _: httpx.Response(200, json=answer)) as sent:
        with patch.object(settings, "frontend_url", "http://localhost:5173"):
            await plaid_client.create_link_token(client_user_id="user-1")
    assert "webhook" not in sent[0]
