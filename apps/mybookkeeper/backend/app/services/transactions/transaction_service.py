import uuid
from collections.abc import Sequence
from datetime import date, datetime, timezone
from decimal import Decimal

from sqlalchemy import Row

from app.core.context import RequestContext
from app.core.tags import CATEGORY_TO_SCHEDULE_E, transaction_type_for_category
from app.db.session import AsyncSessionLocal, unit_of_work
from app.models.transactions.transaction import Transaction
from app.repositories import transaction_repo
from app.schemas.transactions.duplicate import DuplicateMergeOverrides
from app.services.classification import rule_learning_service
from app.services.transactions.merge_strategy import MERGEABLE_FIELDS, auto_pick_defaults

# Union of all possible value types in a Transaction field dict
# (from TransactionCreate.model_dump() or TransactionUpdate.model_dump())
TransactionFieldValue = (
    str | int | float | bool | Decimal | date | uuid.UUID | list[str] | None
)

UPDATABLE_FIELDS = frozenset({
    "property_id",
    "vendor_id",
    "applicant_id",
    "attribution_source",
    "payer_name",
    "activity_id",
    "transaction_date",
    "tax_year",
    "vendor",
    "description",
    "amount",
    "transaction_type",
    "category",
    "tags",
    "tax_relevant",
    "schedule_e_line",
    "is_capital_improvement",
    "placed_in_service_date",
    "channel",
    "address",
    "payment_method",
    "status",
})


async def list_transactions(
    ctx: RequestContext,
    *,
    property_id: uuid.UUID | None = None,
    applicant_id: uuid.UUID | None = None,
    status: str | None = None,
    transaction_type: str | None = None,
    category: str | None = None,
    vendor: str | None = None,
    start_date: date | None = None,
    end_date: date | None = None,
    tax_year: int | None = None,
    limit: int | None = None,
    offset: int | None = None,
) -> Sequence[Transaction]:
    async with AsyncSessionLocal() as db:
        return await transaction_repo.list_filtered(
            db,
            ctx.organization_id,
            property_id=property_id,
            applicant_id=applicant_id,
            status=status,
            transaction_type=transaction_type,
            category=category,
            vendor=vendor,
            start_date=start_date,
            end_date=end_date,
            tax_year=tax_year,
            limit=limit,
            offset=offset,
        )


async def create_manual_transaction(
    ctx: RequestContext, data: dict[str, TransactionFieldValue]
) -> Transaction:
    if "tax_year" not in data or data["tax_year"] is None:
        data["tax_year"] = data["transaction_date"].year
    async with unit_of_work() as db:
        created = await transaction_repo.create_transaction(
            db,
            organization_id=ctx.organization_id,
            user_id=ctx.user_id,
            is_manual=True,
            **data,
        )
        # Re-fetch with selectinload so FastAPI can serialize source_file_name
        # (a hybrid_property that traverses extraction → document relationships)
        # without hitting a DetachedInstanceError after the session closes.
        fetched = await transaction_repo.get_by_id(db, created.id, ctx.organization_id)
        return fetched  # type: ignore[return-value]


async def get_transaction(
    ctx: RequestContext, transaction_id: uuid.UUID
) -> Transaction | None:
    async with AsyncSessionLocal() as db:
        return await transaction_repo.get_by_id(
            db, transaction_id, ctx.organization_id,
        )


async def update_transaction(
    ctx: RequestContext,
    transaction_id: uuid.UUID,
    updates: dict[str, TransactionFieldValue],
) -> tuple[Transaction, int] | None:
    async with unit_of_work() as db:
        txn = await transaction_repo.get_by_id(
            db, transaction_id, ctx.organization_id,
        )
        if not txn:
            return None
        old_category = txn.category
        old_property_id = txn.property_id
        for field, value in updates.items():
            if field not in UPDATABLE_FIELDS:
                raise ValueError(f"Cannot update field: {field}")
            setattr(txn, field, value)

        retroactive_count = 0
        if "category" in updates and txn.category != old_category:
            retroactive_count = await rule_learning_service.learn_from_correction(
                db,
                organization_id=ctx.organization_id,
                user_id=ctx.user_id,
                transaction=txn,
                old_category=old_category,
            )

        if "property_id" in updates and updates["property_id"] != old_property_id:
            property_retroactive = await rule_learning_service.learn_from_property_correction(
                db,
                organization_id=ctx.organization_id,
                user_id=ctx.user_id,
                transaction=txn,
            )
            retroactive_count += property_retroactive

        return txn, retroactive_count


async def delete_transaction(
    ctx: RequestContext, transaction_id: uuid.UUID
) -> bool:
    async with unit_of_work() as db:
        txn = await transaction_repo.get_by_id(
            db, transaction_id, ctx.organization_id,
        )
        if not txn:
            return False
        if txn.deleted_at is not None:
            return False
        await transaction_repo.mark_deleted(db, txn)
        return True


async def bulk_approve(
    ctx: RequestContext, ids: list[uuid.UUID]
) -> dict[str, int]:
    async with unit_of_work() as db:
        approved = await transaction_repo.bulk_approve(
            db, ids, ctx.organization_id,
        )
        return {"approved": approved, "skipped": len(ids) - approved}


async def bulk_delete(
    ctx: RequestContext, ids: list[uuid.UUID]
) -> dict[str, int]:
    async with unit_of_work() as db:
        deleted = await transaction_repo.bulk_delete(
            db, ids, ctx.organization_id,
        )
        return {"deleted": deleted}


async def get_schedule_e_report(
    ctx: RequestContext, tax_year: int
) -> Sequence[Row[tuple[uuid.UUID | None, str | None, Decimal]]]:
    async with AsyncSessionLocal() as db:
        return await transaction_repo.schedule_e_report(
            db, ctx.organization_id, tax_year,
        )


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
    """Keep one transaction, soft-delete the others. Transfer document links."""
    async with unit_of_work() as db:
        keep_txn = await transaction_repo.get_by_id(db, keep_id, ctx.organization_id)
        if not keep_txn:
            raise ValueError("Transaction to keep not found")

        # Transfer document links from deleted transactions to the kept one
        for del_id in delete_ids:
            await transaction_repo.transfer_document_links(db, del_id, keep_id)

        deleted = await transaction_repo.bulk_delete(db, delete_ids, ctx.organization_id)

        keep_txn.duplicate_reviewed_at = datetime.now(timezone.utc)

        return {"kept": 1, "deleted": deleted}


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
    from both transactions regardless of overrides. Derived fields (tax_year,
    transaction_type, schedule_e_line) are recomputed after field assignment.
    The non-surviving transaction is soft-deleted and its document links are
    transferred to the surviving one.
    """
    if surviving_id not in (transaction_a_id, transaction_b_id):
        raise ValueError("surviving_id must be one of transaction_a_id or transaction_b_id")

    async with unit_of_work() as db:
        txn_a = await transaction_repo.get_by_id(db, transaction_a_id, ctx.organization_id)
        txn_b = await transaction_repo.get_by_id(db, transaction_b_id, ctx.organization_id)

        if txn_a is None:
            raise ValueError(f"Transaction {transaction_a_id} not found")
        if txn_b is None:
            raise ValueError(f"Transaction {transaction_b_id} not found")

        survivor = txn_a if surviving_id == transaction_a_id else txn_b
        loser = txn_b if surviving_id == transaction_a_id else txn_a

        overrides_dict = field_overrides.model_dump(exclude_none=True)
        auto_picks = auto_pick_defaults(txn_a, txn_b)

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

        # Recompute derived fields
        survivor.tax_year = survivor.transaction_date.year
        survivor.transaction_type = transaction_type_for_category(survivor.category)
        survivor.schedule_e_line = CATEGORY_TO_SCHEDULE_E.get(survivor.category)

        # Transfer document links from the loser to the survivor
        await transaction_repo.transfer_document_links(db, loser.id, survivor.id)

        # Soft-delete the non-surviving transaction
        await transaction_repo.mark_deleted(db, loser)

        # Mark the survivor as approved and reviewed
        survivor.status = "approved"
        survivor.duplicate_reviewed_at = datetime.now(timezone.utc)

        # Flush survivor changes before re-fetching
        await transaction_repo.flush(db)

        # Re-fetch with selectinload to avoid DetachedInstanceError after session closes
        fetched = await transaction_repo.get_by_id(db, survivor.id, ctx.organization_id)
        if not fetched:
            raise ValueError(f"Surviving transaction {survivor.id} not found after merge")
        return fetched


async def get_linked_document_ids(
    ctx: RequestContext,
    transaction_ids: list[uuid.UUID],
) -> dict[uuid.UUID, list[uuid.UUID]]:
    """Get linked document IDs for a list of transactions."""
    async with AsyncSessionLocal() as db:
        return await transaction_repo.get_linked_document_ids(db, transaction_ids)
