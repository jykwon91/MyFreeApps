"""Apply one /transactions/sync batch to the ledger.

Order follows Plaid's guidance: added, then modified, then removed, so a row
added and withdrawn in the same batch ends up withdrawn.

* **Pending** rows are skipped until they post. In /transactions/sync a
  posting arrives as the pending id *removed* plus a new posted id *added*,
  often with a different amount (tips, holds). Storing pending rows would make
  totals move under the person and would throw away any filing they did on the
  pending row when it is replaced. The cost is a lag of a day or two.
* **Added** rows are de-duplicated three ways: a Plaid id already stored
  (deleted rows included — a row the person deleted stays deleted); a row a
  bank CSV import, a manual entry or an earlier connection already brought in
  for the same account, day, amount and direction (each such row absorbs one
  bank row per run); and the second leg of a transfer between two connected
  accounts, which turns the first leg into one transfer row instead of adding
  a second — the ledger keeps one row per transfer, so it is never counted
  twice. A row an email or document already brought in (a Zelle alert, a
  bill) is linked to the bank row instead of being stored twice, and pairs
  stored before that are folded together (``plaid_copy_reconciler``). Money
  you sent yourself that the two banks show at different amounts (a transfer
  service's fee) is paired after each batch (``plaid_transfer_reconciler``).
* **Modified** rows update only what the bank owns — date, amount, name. How
  the person filed the row is theirs and is never overwritten.
* **Payee rules** the person set up file each new row as it is stored
  (``rule_actions``). Rows already on file are never refiled by a sync.
* **Removed** rows are soft-deleted, through the same path every delete uses.
* **Income from a tenant** is then filed as their rent, or queued for rent
  review (``plaid_rent_attribution``) — every synced income row not yet read,
  not only this batch's.
"""
from __future__ import annotations

import datetime as _dt
import logging
import uuid
from collections.abc import Collection, Mapping

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.plaid_category_constants import PFC_TRANSFER_PRIMARIES
from app.core.plaid_constants import PLAID_MIN_TRANSACTION_YEAR, PLAID_TRANSFER_MATCH_WINDOW_DAYS
from app.core.spending_category_enums import TRANSACTION_SCOPE_PERSONAL
from app.core.tax_total_inputs import tax_total_inputs
from app.mappers import plaid_account_mapper, plaid_transaction_mapper
from app.models.financial_accounts.financial_account import FinancialAccount
from app.models.integrations.plaid_item import PlaidItem
from app.models.transactions.transaction import Transaction
from app.repositories.financial_accounts import financial_account_repo
from app.repositories.tax import tax_return_repo
from app.repositories.transactions import plaid_transaction_repo, transaction_repo
from app.schemas.plaid.plaid_apply_counts import PlaidApplyCounts
from app.schemas.plaid.plaid_sync_batch import PlaidSyncBatch
from app.schemas.plaid.wire.plaid_wire_transaction import PlaidWireTransaction
from app.services.classification import rule_actions, rule_engine
from app.services.net_worth import net_worth_service
from app.services.plaid import plaid_copy_reconciler, plaid_rent_attribution, plaid_transfer_reconciler
from app.services.transactions.bank_row_classifier import classify_bank_row
from app.services.transactions.transfer_merge import merge_into_transfer

logger = logging.getLogger(__name__)

_INCOME = "income"
_EXPENSE = "expense"
_OPPOSITE_DIRECTION = {_INCOME: _EXPENSE, _EXPENSE: _INCOME}


def _is_storable(txn: PlaidWireTransaction) -> bool:
    return (
        not txn.pending
        and txn.amount != 0
        and txn.date.year >= PLAID_MIN_TRANSACTION_YEAR
    )


async def apply_batch(
    db: AsyncSession,
    *,
    item: PlaidItem,
    batch: PlaidSyncBatch,
    accounts_by_plaid_id: Mapping[str, FinancialAccount],
    linked_account_ids: Collection[uuid.UUID],
    spending_category_ids: Mapping[str, uuid.UUID],
    today: _dt.date,
) -> PlaidApplyCounts:
    counts = PlaidApplyCounts()
    claimed: set[uuid.UUID] = set()
    for txn in batch.added:
        account = accounts_by_plaid_id.get(txn.account_id)
        if account is None or not _is_storable(txn):
            continue
        await _apply_added(
            db, txn, item=item, account=account, counts=counts, claimed=claimed,
            linked_account_ids=linked_account_ids,
            spending_category_ids=spending_category_ids,
        )
    for txn in batch.modified:
        if _is_storable(txn) and await _apply_modified(db, txn, organization_id=item.organization_id):
            counts.modified += 1
    counts.removed = await _apply_removed(
        db, organization_id=item.organization_id, transaction_ids=batch.removed,
    )
    counts.copies_merged = await plaid_copy_reconciler.merge_stored_copies(
        db, organization_id=item.organization_id,
    )
    counts.transfers_matched += await plaid_transfer_reconciler.merge_stored_self_transfers(
        db, organization_id=item.organization_id,
    )
    counts.attributed_as_rent = await plaid_rent_attribution.attribute_untriaged_income(
        db, organization_id=item.organization_id,
    )
    await _apply_balances(db, batch=batch, accounts_by_plaid_id=accounts_by_plaid_id, today=today)
    await net_worth_service.record_today(
        db, organization_id=item.organization_id, user_id=item.user_id, today=today,
    )
    return counts


async def _apply_added(
    db: AsyncSession,
    txn: PlaidWireTransaction,
    *,
    item: PlaidItem,
    account: FinancialAccount,
    counts: PlaidApplyCounts,
    claimed: set[uuid.UUID],
    linked_account_ids: Collection[uuid.UUID],
    spending_category_ids: Mapping[str, uuid.UUID],
) -> None:
    existing = await plaid_transaction_repo.find_by_plaid_id(
        db, organization_id=item.organization_id, transaction_id=txn.transaction_id,
    )
    if existing is not None:
        return

    classification = classify_bank_row(
        plaid_transaction_mapper.description_for(txn), txn.amount, account.default_transaction_scope,
    )
    already_imported = await plaid_transaction_repo.find_existing_bank_row(
        db,
        organization_id=item.organization_id,
        account_id=account.id,
        transaction_date=txn.date,
        amount=classification.amount,
        transaction_type=classification.transaction_type,
        connected_at=item.created_at,
        exclude_ids=claimed,
    )
    if already_imported is not None:
        claimed.add(already_imported.id)
        counts.matched_existing += 1
        return

    copy = await plaid_copy_reconciler.link_existing_copy(
        db, txn, account=account, classification=classification, exclude_ids=claimed,
    )
    if copy is not None:
        claimed.add(copy.id)
        counts.linked_existing += 1
        return

    external_category = plaid_transaction_mapper.external_category_for(txn)
    if external_category in PFC_TRANSFER_PRIMARIES:
        other_leg = await _find_other_leg(
            db, txn, account=account, transaction_type=classification.transaction_type,
            organization_id=item.organization_id,
            linked_account_ids=linked_account_ids, claimed=claimed,
        )
        if other_leg is not None:
            old_tax_inputs = tax_total_inputs(other_leg)
            merge_into_transfer(other_leg, other_account_id=account.id, other_date=txn.date)
            await transaction_repo.update(db, other_leg)
            await tax_return_repo.flag_unfiled_if_totals_moved(db, other_leg, old_tax_inputs)
            claimed.add(other_leg.id)
            counts.transfers_matched += 1
            return

    spending_category_id = None
    if account.default_transaction_scope == TRANSACTION_SCOPE_PERSONAL and classification.transaction_type == _EXPENSE:
        name = plaid_transaction_mapper.spending_category_name_for(txn.personal_finance_category)
        spending_category_id = spending_category_ids.get(name) if name else None
    row = plaid_transaction_mapper.new_transaction(
        txn, account=account, classification=classification,
        spending_category_id=spending_category_id,
    )
    await transaction_repo.create(db, row)
    counts.added += 1
    rule = await rule_engine.find_vendor_rule(db, item.organization_id, row.vendor)
    if rule is not None and await rule_actions.file_by_rule(db, row, rule):
        counts.filed_by_rule += 1


async def _find_other_leg(
    db: AsyncSession,
    txn: PlaidWireTransaction,
    *,
    account: FinancialAccount,
    transaction_type: str,
    organization_id: uuid.UUID,
    linked_account_ids: Collection[uuid.UUID],
    claimed: set[uuid.UUID],
) -> Transaction | None:
    opposite = _OPPOSITE_DIRECTION.get(transaction_type)
    other_accounts = [a for a in linked_account_ids if a != account.id]
    if opposite is None or not other_accounts:
        return None
    window = _dt.timedelta(days=PLAID_TRANSFER_MATCH_WINDOW_DAYS)
    candidates = await plaid_transaction_repo.list_transfer_counterparts(
        db,
        organization_id=organization_id,
        account_ids=other_accounts,
        amount=abs(txn.amount),
        transaction_type=opposite,
        date_from=txn.date - window,
        date_to=txn.date + window,
        external_categories=PFC_TRANSFER_PRIMARIES,
    )
    unclaimed = [c for c in candidates if c.id not in claimed]
    if not unclaimed:
        return None
    return min(unclaimed, key=lambda c: abs((c.transaction_date - txn.date).days))


async def _apply_modified(
    db: AsyncSession, txn: PlaidWireTransaction, *, organization_id: uuid.UUID,
) -> bool:
    rows = await plaid_transaction_repo.lock_live_by_plaid_ids(
        db, organization_id=organization_id, transaction_ids=[txn.transaction_id],
    )
    if not rows:
        # A row never stored (pending, unlinked account, matched to an import)
        # or since deleted by the person — nothing to update.
        return False
    row = rows[0]
    old_tax_inputs = tax_total_inputs(row)
    row.transaction_date = txn.date
    row.tax_year = txn.date.year
    row.amount = abs(txn.amount)
    row.vendor = plaid_transaction_mapper.vendor_for(txn)
    row.description = plaid_transaction_mapper.description_for(txn) or None
    await transaction_repo.update(db, row)
    await tax_return_repo.flag_unfiled_if_totals_moved(db, row, old_tax_inputs)
    return True


async def _apply_removed(
    db: AsyncSession, *, organization_id: uuid.UUID, transaction_ids: list[str],
) -> int:
    rows = await plaid_transaction_repo.lock_live_by_plaid_ids(
        db, organization_id=organization_id, transaction_ids=transaction_ids,
    )
    if rows:
        await transaction_repo.soft_delete_transactions(db, rows)
    return len(rows)


async def _apply_balances(
    db: AsyncSession,
    *,
    batch: PlaidSyncBatch,
    accounts_by_plaid_id: Mapping[str, FinancialAccount],
    today: _dt.date,
) -> None:
    for wire_account in batch.accounts:
        account = accounts_by_plaid_id.get(wire_account.account_id)
        cents = plaid_account_mapper.balance_cents_for(wire_account)
        if account is None or cents is None:
            continue
        await financial_account_repo.update_fields(
            db, account, {"current_balance_cents": cents, "balance_as_of": today},
        )
