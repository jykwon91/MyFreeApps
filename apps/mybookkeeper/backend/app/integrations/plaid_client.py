"""Plaid API client wrapper. Returns None gracefully when plaid-python is not installed."""
import logging
import uuid
from dataclasses import dataclass

from app.core.config import settings

logger = logging.getLogger(__name__)

try:
    import plaid
    from plaid.api import plaid_api
    from plaid.model.country_code import CountryCode
    from plaid.model.link_token_create_request import LinkTokenCreateRequest
    from plaid.model.link_token_create_request_user import LinkTokenCreateRequestUser
    from plaid.model.item_public_token_exchange_request import ItemPublicTokenExchangeRequest
    from plaid.model.transactions_sync_request import TransactionsSyncRequest
    from plaid.model.accounts_get_request import AccountsGetRequest
    from plaid.model.products import Products

    _PLAID_AVAILABLE = True
except ImportError:
    _PLAID_AVAILABLE = False
    logger.info("plaid-python not installed; Plaid integration disabled")


_ENVIRONMENT_MAP = {
    "sandbox": "https://sandbox.plaid.com",
    "development": "https://development.plaid.com",
    "production": "https://production.plaid.com",
}

_client: object | None = None


@dataclass
class PlaidSyncResult:
    added: list[dict]
    modified: list[dict]
    removed: list[str]
    next_cursor: str
    has_more: bool


@dataclass
class PlaidAccountInfo:
    account_id: str
    name: str
    official_name: str | None
    account_type: str
    account_subtype: str | None
    mask: str | None


@dataclass
class PlaidExchangeResult:
    access_token: str
    item_id: str


@dataclass
class PlaidLinkTokenResult:
    link_token: str
    expiration: str


def _is_configured() -> bool:
    return bool(settings.plaid_client_id and settings.plaid_secret)


def get_plaid_client() -> object | None:
    """Return a configured PlaidApi instance, or None if unavailable."""
    global _client
    if not _PLAID_AVAILABLE or not _is_configured():
        return None
    if _client is not None:
        return _client

    env_url = _ENVIRONMENT_MAP.get(settings.plaid_environment, _ENVIRONMENT_MAP["sandbox"])
    configuration = plaid.Configuration(
        host=env_url,
        api_key={
            "clientId": settings.plaid_client_id,
            "secret": settings.plaid_secret,
        },
    )
    api_client = plaid.ApiClient(configuration)
    _client = plaid_api.PlaidApi(api_client)
    return _client


def create_link_token(user_id: uuid.UUID, org_id: uuid.UUID) -> PlaidLinkTokenResult | None:
    """Create a Plaid Link token for the frontend widget."""
    client = get_plaid_client()
    if client is None:
        return None

    request = LinkTokenCreateRequest(
        products=[Products("transactions")],
        client_name="MyBookkeeper",
        country_codes=[CountryCode("US")],
        language="en",
        user=LinkTokenCreateRequestUser(client_user_id=str(user_id)),
        webhook=settings.plaid_webhook_url or None,
    )
    response = client.link_token_create(request)
    return PlaidLinkTokenResult(
        link_token=response["link_token"],
        expiration=response["expiration"],
    )


def exchange_public_token(public_token: str) -> PlaidExchangeResult | None:
    """Exchange a Plaid public token for an access token and item ID."""
    client = get_plaid_client()
    if client is None:
        return None

    request = ItemPublicTokenExchangeRequest(public_token=public_token)
    response = client.item_public_token_exchange(request)
    return PlaidExchangeResult(
        access_token=response["access_token"],
        item_id=response["item_id"],
    )


def sync_transactions(access_token: str, cursor: str | None) -> PlaidSyncResult | None:
    """Call Plaid's /transactions/sync endpoint. Returns added/modified/removed transactions."""
    client = get_plaid_client()
    if client is None:
        return None

    added: list[dict] = []
    modified: list[dict] = []
    removed: list[str] = []
    has_more = True
    current_cursor = cursor or ""

    while has_more:
        request = TransactionsSyncRequest(
            access_token=access_token,
            cursor=current_cursor,
        )
        response = client.transactions_sync(request)

        for txn in response["added"]:
            added.append(_serialize_plaid_txn(txn))
        for txn in response["modified"]:
            modified.append(_serialize_plaid_txn(txn))
        for txn_removed in response["removed"]:
            removed.append(txn_removed["transaction_id"])

        has_more = response["has_more"]
        current_cursor = response["next_cursor"]

    return PlaidSyncResult(
        added=added,
        modified=modified,
        removed=removed,
        next_cursor=current_cursor,
        has_more=False,
    )


def get_accounts(access_token: str) -> list[PlaidAccountInfo] | None:
    """Return list of accounts for an item."""
    client = get_plaid_client()
    if client is None:
        return None

    request = AccountsGetRequest(access_token=access_token)
    response = client.accounts_get(request)

    return [
        PlaidAccountInfo(
            account_id=acc["account_id"],
            name=acc["name"],
            official_name=acc.get("official_name"),
            account_type=str(acc["type"]),
            account_subtype=str(acc["subtype"]) if acc.get("subtype") else None,
            mask=acc.get("mask"),
        )
        for acc in response["accounts"]
    ]


def _serialize_plaid_txn(txn: object) -> dict:
    """Convert a Plaid transaction object to a plain dict."""
    return {
        "transaction_id": txn["transaction_id"],
        "account_id": txn["account_id"],
        "amount": float(txn["amount"]),
        "date": str(txn["date"]),
        "name": txn.get("name", ""),
        "merchant_name": txn.get("merchant_name"),
        "pending": txn.get("pending", False),
        "personal_finance_category": _extract_category(txn),
        "payment_channel": txn.get("payment_channel"),
    }


def _extract_category(txn: object) -> str | None:
    """Extract the primary personal finance category from a Plaid transaction."""
    pfc = txn.get("personal_finance_category")
    if pfc and isinstance(pfc, dict):
        return pfc.get("primary")
    if pfc and hasattr(pfc, "primary"):
        return pfc.primary
    return None
