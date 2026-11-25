"""Suspected duplicate transactions: find them, keep one, dismiss, or merge two."""
import uuid
from datetime import datetime, timezone

from app.core.context import RequestContext
from app.core.tags import schedule_e_line_after_category_change, transaction_type_for_category
from app.core.tax_total_inputs import tax_total_inputs
from app.core.tax_year_after_date_change import tax_year_after_date_change
from app.core.transaction_statuses import COUNTED_STATUS
from app.db.session import AsyncSessionLocal, unit_of_work
from app.models.transactions.transaction import Transaction
from app.repositories import transaction_repo
from app.repositories.tax import tax_return_repo
from app.schemas.transactions.duplicate import DuplicateMergeOverrides
from app.services.transactions.duplicate_absorb import absorb_duplicates
from app.services.transactions.merge_strategy import MERGEABLE_FIELDS, auto_pick_defaults
from app.services.transactions.personal_transfer_status import set_status
from app.services.transactions.scope_rules import apply_scope_rules
from app.services.transactions.transfer_rules import transfer_overrides


async def get_duplicate_pairs(
    ctx: RequestContext,
    *,
    limit: int = 100,
) -> list[tuple]:
    """Find suspected duplicate transaction pairs."""
    async with AsyncSessionLocal() as db:
        return await transaction_repo.find_duplicate_pairs(
            db, ctx.organization_id, limit=limit,
        )


async def keep_transaction(
    ctx: RequestContext,
    keep_id: uuid.UUID,
    delete_ids: list[uuid.UUID],
) -> dict[str, int]:
    """Keep one transaction and fold the others into it (see ``absorb_duplicates``)."""
    async with unit_of_work() as db:
        # One org-scoped, id-ordered lock over the kept row and the rows to delete.
        # Anything missing, in another org or already deleted is simply not in the set.
        locked = await transaction_repo.lock_live_transactions(
            db, [keep_id, *delete_ids], ctx.organization_id,
        )
        keep_txn = next((t for t in locked if t.id == keep_id), None)
        if keep_txn is None:
            raise ValueError("Transaction to keep not found")
        to_delete = [t for t in locked if t.id != keep_id]
        old_tax_inputs = tax_total_inputs(keep_txn)

        await absorb_duplicates(db, keep_txn, to_delete)

        keep_txn.duplicate_reviewed_at = datetime.now(timezone.utc)
        await tax_return_repo.flag_unfiled_if_totals_moved(db, keep_txn, old_tax_inputs)

        return {"kept": 1, "deleted": len(to_delete)}


async def dismiss_duplicates(
    ctx: RequestContext,
    transaction_ids: list[uuid.UUID],
) -> dict[str, int]:
    """Mark transactions as reviewed (not duplicates)."""
    async with unit_of_work() as db:
        reviewed = await transaction_repo.mark_duplicate_reviewed(
            db, transaction_ids, ctx.organization_id,
        )
        return {"reviewed": reviewed}


async def merge_transactions(
    ctx: RequestContext,
    transaction_a_id: uuid.UUID,
    transaction_b_id: uuid.UUID,
    surviving_id: uuid.UUID,
    field_overrides: DuplicateMergeOverrides,
) -> Transaction:
    """Merge two duplicate transactions into one surviving record.

    Field values are chosen per MERGEABLE_FIELDS: use the override when provided,
    otherwise fall back to auto_pick_defaults heuristics. Tags are always unioned
    from both transactions regardless of overrides. transaction_type follows the
    merged category; tax_year and schedule_e_line follow the date and category
    only when those changed and weren't chosen by hand. The non-surviving
    transaction is folded into the survivor by ``absorb_duplicates``.
    """
    if transaction_a_id == transaction_b_id:
        raise ValueError("A transaction can't be merged with itself")
    if surviving_id not in (transaction_a_id, transaction_b_id):
        raise ValueError("surviving_id must be one of transaction_a_id or transaction_b_id")

    async with unit_of_work() as db:
        # Lock both live rows, as keep does: a row deleted in another tab, or by a merge
        # that got there first, must not survive or be merged into.
        locked = {
            t.id: t
            for t in await transaction_repo.lock_live_transactions(
                db, [transaction_a_id, transaction_b_id], ctx.organization_id,
            )
        }
        txn_a = locked.get(transaction_a_id)
        txn_b = locked.get(transaction_b_id)

        if txn_a is None:
            raise ValueError(f"Transaction {transaction_a_id} not found")
        if txn_b is None:
            raise ValueError(f"Transaction {transaction_b_id} not found")

        survivor = txn_a if surviving_id == transaction_a_id else txn_b
        loser = txn_b if surviving_id == transaction_a_id else txn_a
        old_survivor_tax_inputs = tax_total_inputs(survivor)
        old_date = survivor.transaction_date
        old_category = survivor.category

        overrides_dict = field_overrides.model_dump(exclude_none=True)
        auto_picks = auto_pick_defaults(txn_a, txn_b)

        # First, so a conflicting tenant, vendor or activity refuses before anything changes.
        await absorb_duplicates(db, survivor, [loser])

        for field in MERGEABLE_FIELDS:
            if field == "tags":
                # Always union tags from both transactions
                merged_tags = list(dict.fromkeys(
                    (txn_a.tags or []) + (txn_b.tags or [])
                ))
                survivor.tags = merged_tags
                continue

            source = overrides_dict.get(field) or auto_picks[field]
            value = getattr(txn_a, field) if source == "a" else getattr(txn_b, field)
            setattr(survivor, field, value)

        survivor.tax_year = tax_year_after_date_change(
            survivor.tax_year, old_date, survivor.transaction_date,
        )
        survivor.transaction_type = transaction_type_for_category(survivor.category)
        survivor.schedule_e_line = schedule_e_line_after_category_change(
            survivor.schedule_e_line, old_category, survivor.category,
        )
        # Two copies of one payment ran through the same account, so whichever
        # copy knows the account keeps it — the same "prefer non-null" the
        # other merge fields follow.
        if survivor.account_id is None:
            survivor.account_id = loser.account_id
        if survivor.transfer_to_account_id is None:
            survivor.transfer_to_account_id = loser.transfer_to_account_id
        for field, value in transfer_overrides(
            transaction_type=survivor.transaction_type,
            category=survivor.category,
            account_id=survivor.account_id,
            transfer_to_account_id=survivor.transfer_to_account_id,
        ).items():
            setattr(survivor, field, value)
        apply_scope_rules(survivor)

        # Mark the survivor as approved and reviewed (a personal transfer stays one)
        set_status(survivor, COUNTED_STATUS)
        survivor.duplicate_reviewed_at = datetime.now(timezone.utc)
        await tax_return_repo.flag_unfiled_if_totals_moved(db, survivor, old_survivor_tax_inputs)

        # Flush survivor changes before re-fetching
        await transaction_repo.flush(db)

        # Re-fetch with selectinload to avoid DetachedInstanceError after session closes
        fetched = await transaction_repo.get_by_id(db, survivor.id, ctx.organization_id)
        if not fetched:
            raise ValueError(f"Surviving transaction {survivor.id} not found after merge")
        return fetched
