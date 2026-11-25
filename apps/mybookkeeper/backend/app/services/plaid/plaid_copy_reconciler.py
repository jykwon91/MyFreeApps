"""One row per payment when a bank sync and an email or document both bring it in.

Gmail and document extraction often file a payment days before the bank row
arrives (a Zelle alert, a bill, a receipt). The row on file is the one the
person has filed and edited, so it is the one kept: it takes on the bank's
identity (Plaid id, account) so later bank edits and withdrawals reach it.

* **On sync** — an added bank row that is the one match for a row on file is
  not stored again; the row on file is linked to it instead.
* **Already stored** — pairs a sync stored before this existed are folded
  through the duplicate merge path: the row on file survives and takes the
  bank identity, the synced copy is soft-deleted as a ``duplicate`` (which can
  be restored). Runs on every sync and does nothing once no pair is left.

A bank row with more than one possible match, either way, is left alone for
the duplicate review — two same-amount payments days apart are never guessed.
See ``plaid_copy_matcher`` for what counts as the same money.
"""
from __future__ import annotations

import datetime as _dt
import logging
import uuid
from collections.abc import Collection

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.plaid_constants import PLAID_COPY_MATCH_WINDOW_DAYS_P2P
from app.core.tax_total_inputs import tax_total_inputs
from app.mappers import plaid_transaction_mapper
from app.models.financial_accounts.financial_account import FinancialAccount
from app.models.transactions.transaction import Transaction
from app.repositories.tax import tax_return_repo
from app.repositories.transactions import plaid_copy_repo, transaction_repo
from app.schemas.plaid.wire.plaid_wire_transaction import PlaidWireTransaction
from app.schemas.transactions.bank_row_classification import BankRowClassification
from app.services.plaid.plaid_copy_matcher import only_copy, unambiguous_pairs
from app.services.transactions.duplicate_absorb import absorb_duplicates
from app.services.transactions.merge_conflict_error import MergeConflictError

logger = logging.getLogger(__name__)

# The widest window any rule uses; the matcher applies each rule's own.
_SEARCH_WINDOW = _dt.timedelta(days=PLAID_COPY_MATCH_WINDOW_DAYS_P2P)


async def link_existing_copy(
    db: AsyncSession,
    txn: PlaidWireTransaction,
    *,
    account: FinancialAccount,
    classification: BankRowClassification,
    exclude_ids: Collection[uuid.UUID],
) -> Transaction | None:
    """Link the one row on file that is this bank row, and return it; ``None``
    when there is none or more than one."""
    candidates = await plaid_copy_repo.list_unlinked_copies(
        db,
        organization_id=account.organization_id,
        account_id=account.id,
        amount=classification.amount,
        transaction_type=classification.transaction_type,
        date_from=txn.date - _SEARCH_WINDOW,
        date_to=txn.date + _SEARCH_WINDOW,
        exclude_ids=exclude_ids,
    )
    copy = only_copy(
        bank_date=txn.date,
        bank_texts=(plaid_transaction_mapper.description_for(txn), txn.name),
        candidates=candidates,
    )
    if copy is None:
        return None
    plaid_transaction_mapper.link_to_plaid(
        copy,
        transaction_id=txn.transaction_id,
        external_category=plaid_transaction_mapper.external_category_for(txn),
        account_id=account.id,
    )
    await transaction_repo.update(db, copy)
    return copy


async def merge_stored_copies(db: AsyncSession, *, organization_id: uuid.UUID) -> int:
    """Fold synced rows that are copies of a row on file into it. Returns how
    many were folded."""
    pairs = unambiguous_pairs(
        await plaid_copy_repo.list_synced_copy_pairs(db, organization_id=organization_id),
    )
    merged = 0
    for synced, on_file in pairs:
        if await _merge_pair(db, synced=synced, on_file=on_file):
            merged += 1
    if merged:
        logger.info("Folded %d synced copies into rows on file for org %s", merged, organization_id)
    return merged


async def _merge_pair(db: AsyncSession, *, synced: Transaction, on_file: Transaction) -> bool:
    locked = await transaction_repo.lock_live_transactions(
        db, [synced.id, on_file.id], on_file.organization_id,
    )
    if len(locked) != 2:
        return False
    old_tax_inputs = tax_total_inputs(on_file)
    plaid_id, external_category, account_id = synced.external_id, synced.external_category, synced.account_id
    try:
        await absorb_duplicates(db, on_file, [synced])
    except MergeConflictError:
        # The two rows name different tenants, vendors or activities: not
        # something to settle without the person.
        logger.warning("Synced row %s matches %s but they conflict; left for review", synced.id, on_file.id)
        return False
    # The Plaid id is unique per org, deleted rows included, so it leaves the
    # removed copy before the kept row takes it.
    synced.external_source = None
    synced.external_id = None
    await transaction_repo.flush(db)
    if plaid_id is not None:
        plaid_transaction_mapper.link_to_plaid(
            on_file, transaction_id=plaid_id, external_category=external_category, account_id=account_id,
        )
    await transaction_repo.update(db, on_file)
    await tax_return_repo.flag_unfiled_if_totals_moved(db, on_file, old_tax_inputs)
    return True
