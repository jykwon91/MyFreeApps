"""One transfer row for money you sent yourself, when the two banks show it at
different amounts.

Exact-amount legs are paired as they sync (``plaid_transaction_applier``).
Legs that differ by a fee ($680.00 out of Wise, $678.87 into Chase) are paired
here, after every sync, by the rule in ``self_transfer`` — which also folds in
pairs stored before the rule existed, and does nothing once none are left.

The row out is kept: it becomes the transfer, from the account the money left
to the one it reached, at the amount that left. The row in is soft-deleted as a
``duplicate`` (which can be restored); it keeps its bank id, so a later sync
never brings it back. The fee itself is not kept as an expense: it exists on
no bank row of its own, and a row made up for it would be one no later bank
edit or withdrawal could reach.

A row in that is already filed as a tenant's payment is left for the person,
and a row out to a payee the person said is a mortgage or a loan
(``loan_payees``) is never paired: that money went to a lender.
"""
from __future__ import annotations

import datetime as _dt
import logging
import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.payee_keys import payee_key
from app.core.plaid_constants import PLAID_TRANSFER_MATCH_WINDOW_DAYS
from app.core.tax_total_inputs import tax_total_inputs
from app.repositories.tax import tax_return_repo
from app.repositories.transactions import loan_payee_repo, self_transfer_repo, transaction_repo
from app.repositories.user import user_repo
from app.services.transactions import self_transfer
from app.services.transactions.transfer_merge import merge_into_transfer

logger = logging.getLogger(__name__)

_WINDOW = _dt.timedelta(days=PLAID_TRANSFER_MATCH_WINDOW_DAYS)


async def merge_stored_self_transfers(db: AsyncSession, *, organization_id: uuid.UUID) -> int:
    """Pair money sent to yourself across two accounts. Returns how many
    transfers were made."""
    holder_names = await user_repo.holder_names(
        db, user_ids=await self_transfer_repo.list_account_holder_ids(db, organization_id=organization_id),
    )
    if not holder_names:
        return 0
    loan_payees = await loan_payee_repo.kinds_by_payee(db, organization_id=organization_id)
    sent = [
        leg for leg in await self_transfer_repo.list_sent_legs(
            db, organization_id=organization_id, holder_names=holder_names,
        )
        if payee_key(leg.vendor, leg.description) not in loan_payees
    ]
    if not sent:
        return 0
    received = await self_transfer_repo.list_received_legs(
        db,
        organization_id=organization_id,
        holder_names=holder_names,
        date_from=min(leg.transaction_date for leg in sent) - _WINDOW,
        date_to=max(leg.transaction_date for leg in sent) + _WINDOW,
    )
    merged = 0
    for out, into in self_transfer.unambiguous_pairs(sent, received):
        if await _merge(db, organization_id=organization_id, out_id=out.id, into_id=into.id):
            merged += 1
    if merged:
        logger.info("Paired %d transfers sent to self for org %s", merged, organization_id)
    return merged


async def _merge(
    db: AsyncSession, *, organization_id: uuid.UUID, out_id: uuid.UUID, into_id: uuid.UUID,
) -> bool:
    locked = {row.id: row for row in await transaction_repo.lock_live_transactions(
        db, [out_id, into_id], organization_id,
    )}
    out, into = locked.get(out_id), locked.get(into_id)
    if out is None or into is None or into.account_id is None:
        return False
    if into.applicant_id is not None:
        logger.info("Row %s pairs with %s but is filed as a tenant's payment; left as is", into.id, out.id)
        return False
    old_tax_inputs = tax_total_inputs(out)
    merge_into_transfer(out, other_account_id=into.account_id, other_date=into.transaction_date)
    await transaction_repo.update(db, out)
    await tax_return_repo.flag_unfiled_if_totals_moved(db, out, old_tax_inputs)
    await transaction_repo.soft_delete_transactions(db, [into])
    return True
