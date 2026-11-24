"""Pull a bank connection's investment holdings.

Runs after every transactions sync, and alone on the ``HOLDINGS:
DEFAULT_UPDATE`` webhook. It never touches the transactions side: a bank
that won't give holdings (no investment accounts there, the person never
allowed it, the data isn't ready, this Plaid account isn't enabled for
Investments) is recorded on ``investments_status`` with Plaid's code and
logged, and the connection stays as healthy as its transactions say.

Only items with an investment-type account in MBK are asked: the first call
adds the Investments product to an item, and Plaid bills it from then on.

Balances are not written here. The account's balance stays the one the
transactions sync takes from Plaid; holdings are its breakdown, so net
worth counts each dollar once.
"""
from __future__ import annotations

import datetime as _dt
import logging
import uuid
from collections.abc import Mapping

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.financial_account_enums import INVESTMENT_ACCOUNT_TYPES
from app.core.plaid_item_enums import (
    PLAID_INVESTMENTS_STATUS_ACTIVE,
    PLAID_INVESTMENTS_STATUS_ERROR,
)
from app.core.plaid_not_configured_error import PlaidNotConfiguredError
from app.db.session import unit_of_work
from app.mappers import plaid_holding_mapper
from app.models.financial_accounts.financial_account import FinancialAccount
from app.models.integrations.plaid_item import PlaidItem
from app.repositories.financial_accounts import financial_account_repo
from app.repositories.investments import holding_repo, security_repo
from app.repositories.plaid import plaid_item_repo
from app.schemas.plaid.wire.plaid_wire_holdings_response import PlaidWireHoldingsResponse
from app.services.plaid import plaid_client
from app.services.plaid.plaid_api_error import PlaidApiError

logger = logging.getLogger(__name__)


def _investment_accounts(accounts: list[FinancialAccount]) -> dict[str, FinancialAccount]:
    return {
        a.plaid_account_id: a
        for a in accounts
        if a.plaid_account_id and a.account_type in INVESTMENT_ACCOUNT_TYPES
    }


async def sync_holdings(item_id: uuid.UUID) -> str | None:
    """Refresh one connection's holdings. Returns its ``investments_status``
    afterwards (None when it has no investment account, or is gone)."""
    async with unit_of_work() as db:
        item = await plaid_item_repo.lock(db, item_id)
        if item is None:
            return None
        accounts = _investment_accounts(await financial_account_repo.list_by_plaid_item(db, item.id))
        if not accounts:
            return item.investments_status
        try:
            response = await plaid_client.get_holdings(item.access_token)
        except PlaidApiError as exc:
            _record_refusal(item, exc)
            await db.flush()
            return item.investments_status

        await _apply(db, item=item, response=response, accounts_by_plaid_id=accounts)
        item.investments_status = PLAID_INVESTMENTS_STATUS_ACTIVE
        item.investments_error_code = None
        item.holdings_synced_at = _dt.datetime.now(_dt.timezone.utc)
        await db.flush()
        return item.investments_status


def _record_refusal(item: PlaidItem, exc: PlaidApiError) -> None:
    status = plaid_holding_mapper.investments_status_for(exc.error_code)
    item.investments_status = status
    item.investments_error_code = exc.error_code
    log = logger.error if status == PLAID_INVESTMENTS_STATUS_ERROR else logger.warning
    log(
        "Plaid holdings skipped for item %s: status=%s error_type=%s error_code=%s request_id=%s",
        item.id, status, exc.error_type, exc.error_code, exc.request_id,
    )


async def _apply(
    db: AsyncSession,
    *,
    item: PlaidItem,
    response: PlaidWireHoldingsResponse,
    accounts_by_plaid_id: Mapping[str, FinancialAccount],
) -> None:
    wanted = {h.security_id for h in response.holdings if h.account_id in accounts_by_plaid_id}
    security_ids: dict[str, uuid.UUID] = {}
    for wire in response.securities:
        if wire.security_id not in wanted:
            continue
        security = await security_repo.upsert_plaid(
            db,
            user_id=item.user_id,
            organization_id=item.organization_id,
            plaid_security_id=wire.security_id,
            fields=plaid_holding_mapper.security_fields(wire),
        )
        security_ids[wire.security_id] = security.id

    kept: list[uuid.UUID] = []
    for wire in response.holdings:
        account = accounts_by_plaid_id.get(wire.account_id)
        security_id = security_ids.get(wire.security_id)
        if account is None or security_id is None:
            continue
        holding = await holding_repo.upsert(
            db,
            user_id=item.user_id,
            organization_id=item.organization_id,
            financial_account_id=account.id,
            security_id=security_id,
            fields=plaid_holding_mapper.holding_fields(wire),
        )
        kept.append(holding.id)

    # A position the bank stopped reporting for an account it did report on was sold.
    reported = [
        accounts_by_plaid_id[a.account_id].id
        for a in response.accounts
        if a.account_id in accounts_by_plaid_id
    ]
    removed = await holding_repo.delete_others_in_accounts(
        db, financial_account_ids=reported, keep_ids=kept,
    )
    await security_repo.delete_unheld(db, user_id=item.user_id, organization_id=item.organization_id)
    logger.info(
        "Plaid holdings for item %s: holdings=%d removed=%d securities=%d",
        item.id, len(kept), removed, len(security_ids),
    )


async def sync_holdings_in_background(item_id: uuid.UUID) -> None:
    """For the transactions sync, the webhook and background tasks: never
    raises, so holdings can never fail anything else."""
    try:
        await sync_holdings(item_id)
    except PlaidNotConfiguredError:
        logger.error("Plaid holdings skipped for item %s: Plaid is not configured", item_id)
    except Exception:
        logger.exception("Plaid holdings sync failed for item %s", item_id)
