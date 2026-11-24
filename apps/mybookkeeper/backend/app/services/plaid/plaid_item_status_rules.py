"""What a Plaid error does to a connection's status. Pure.

The codes are always stored so the reason is visible. The status only changes
when the item itself is broken: re-auth codes → ``login_required``; any other
``ITEM_ERROR`` → ``error``. Transient failures (rate limits, a Plaid outage,
the network) leave the status alone so the next run simply tries again.
"""
from __future__ import annotations

from app.core.plaid_constants import PLAID_REAUTH_ERROR_CODES
from app.core.plaid_item_enums import PLAID_ITEM_STATUS_ERROR, PLAID_ITEM_STATUS_LOGIN_REQUIRED
from app.models.integrations.plaid_item import PlaidItem

_ITEM_ERROR_TYPE = "ITEM_ERROR"


def record_error(item: PlaidItem, *, error_type: str, error_code: str) -> None:
    item.error_type = error_type
    item.error_code = error_code
    if error_code in PLAID_REAUTH_ERROR_CODES:
        item.status = PLAID_ITEM_STATUS_LOGIN_REQUIRED
    elif error_type == _ITEM_ERROR_TYPE:
        item.status = PLAID_ITEM_STATUS_ERROR
