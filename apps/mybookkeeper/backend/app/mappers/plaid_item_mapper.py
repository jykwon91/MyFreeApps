"""Turn a stored bank connection into what the Accounts page shows. Pure."""
from __future__ import annotations

from app.models.integrations.plaid_item import PlaidItem
from app.schemas.plaid.plaid_item_response import PlaidItemResponse


def to_response(item: PlaidItem, *, account_count: int) -> PlaidItemResponse:
    return PlaidItemResponse(
        id=item.id,
        institution_name=item.institution_name,
        status=item.status,
        error_code=item.error_code,
        last_synced_at=item.last_synced_at,
        investments_status=item.investments_status,
        holdings_synced_at=item.holdings_synced_at,
        account_count=account_count,
        created_at=item.created_at,
    )
