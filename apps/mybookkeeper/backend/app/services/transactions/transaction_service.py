import uuid
from collections.abc import Sequence
from datetime import date
from decimal import Decimal

from sqlalchemy import Row

from app.core.context import RequestContext
from app.core.tags import CATEGORY_TO_SCHEDULE_E, schedule_e_line_after_category_change
from app.core.spending_category_enums import TRANSACTION_SCOPE_PERSONAL, TRANSACTION_SCOPE_RENTAL
from app.core.tax_total_inputs import tax_total_inputs
from app.db.session import AsyncSessionLocal, unit_of_work
from app.models.transactions.transaction import Transaction
from app.repositories import transaction_repo
from app.repositories.tax import tax_return_repo
from app.schemas.transactions.transaction import TransactionRead
from app.schemas.transactions.transaction_filters import TransactionFilters
from app.schemas.transactions.transaction_list_page import TransactionListPage
from app.schemas.transactions.transaction_selection_ref import TransactionSelectionRef
from app.services.classification import rule_learning_service
from app.services.transactions.capital_improvement import placed_in_service_date_for
from app.services.transactions.filed_by_person import mark_filed_by_person
from app.services.transactions.metered_usage_check import assert_metered_usage_consistent
from app.services.transactions.personal_transfer_status import assert_status_editable
from app.services.transactions.property_split_service import keep_split_consistent
from app.services.transactions.reference_ownership import assert_references_owned
from app.services.transactions.scope_rules import apply_scope_rules, scope_overrides
from app.services.transactions.transfer_rules import transfer_overrides

# Union of all possible value types in a Transaction field dict
# (from TransactionCreate.model_dump() or TransactionUpdate.model_dump())
TransactionFieldValue = (
    str | int | float | bool | Decimal | date | uuid.UUID | list[str] | None
)

UPDATABLE_FIELDS = frozenset({
    "property_id",
    "vendor_id",
    "account_id",
    "transfer_to_account_id",
    "spending_category_id",
    "transaction_scope",
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
    "sub_category",
    "usage_quantity",
    "usage_unit",
    "service_period_start",
    "service_period_end",
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
    filters: TransactionFilters | None = None,
    *,
    limit: int | None = None,
    offset: int | None = None,
) -> Sequence[Transaction]:
    filters = filters or TransactionFilters()
    async with AsyncSessionLocal() as db:
        return await transaction_repo.list_filtered(
            db,
            ctx.organization_id,
            **filters.filter_args(),
            sort=filters.sort_keys(),
            limit=limit,
            offset=offset,
        )


async def list_transaction_page(
    ctx: RequestContext,
    filters: TransactionFilters,
    *,
    limit: int,
    offset: int,
) -> TransactionListPage:
    """One page of the list, and how many rows the same filters match across every page and what they add up to."""
    filter_args = filters.filter_args()
    async with AsyncSessionLocal() as db:
        rows = await transaction_repo.list_filtered(
            db,
            ctx.organization_id,
            **filter_args,
            sort=filters.sort_keys(),
            limit=limit,
            offset=offset,
        )
        totals = await transaction_repo.totals_filtered(db, ctx.organization_id, **filter_args)
    items = [TransactionRead.model_validate(row) for row in rows]
    return TransactionListPage(
        items=items,
        total=totals.count,
        has_more=offset + len(items) < totals.count,
        amount_total=totals.amount_total,
    )


async def list_selection_refs(ctx: RequestContext, filters: TransactionFilters) -> list[TransactionSelectionRef]:
    """Every row the filters match, as little as "select all" needs to tick it."""
    async with AsyncSessionLocal() as db:
        rows = await transaction_repo.list_selection_refs(db, ctx.organization_id, **filters.filter_args())
    return [
        TransactionSelectionRef(id=row.id, property_id=row.property_id, status=row.status, is_split=row.is_split)
        for row in rows
    ]


async def list_categories(ctx: RequestContext, filters: TransactionFilters) -> list[str]:
    """The categories the matching rows have, for the web table's Category filter."""
    async with AsyncSessionLocal() as db:
        return await transaction_repo.list_distinct_categories(db, ctx.organization_id, **filters.filter_args())


async def count_to_review(ctx: RequestContext) -> int:
    async with AsyncSessionLocal() as db:
        return await transaction_repo.count_to_review(db, ctx.organization_id)


async def create_manual_transaction(
    ctx: RequestContext, data: dict[str, TransactionFieldValue]
) -> Transaction:
    if "tax_year" not in data or data["tax_year"] is None:
        data["tax_year"] = data["transaction_date"].year
    if data.get("schedule_e_line") is None:
        data["schedule_e_line"] = CATEGORY_TO_SCHEDULE_E.get(data["category"])
    account_id = data.get("account_id")
    transfer_to_account_id = data.get("transfer_to_account_id")
    data.update(transfer_overrides(
        transaction_type=str(data["transaction_type"]),
        category=str(data["category"]),
        account_id=account_id if isinstance(account_id, uuid.UUID) else None,
        transfer_to_account_id=(
            transfer_to_account_id if isinstance(transfer_to_account_id, uuid.UUID) else None
        ),
    ))
    spending_category_id = data.get("spending_category_id")
    data.update(scope_overrides(
        transaction_scope=str(data.get("transaction_scope") or TRANSACTION_SCOPE_RENTAL),
        spending_category_id=(
            spending_category_id if isinstance(spending_category_id, uuid.UUID) else None
        ),
    ))
    data["placed_in_service_date"] = placed_in_service_date_for(
        bool(data.get("is_capital_improvement")),
        data.get("placed_in_service_date"),
        data["transaction_date"],
    )
    async with unit_of_work() as db:
        await assert_references_owned(
            db, organization_id=ctx.organization_id, user_id=ctx.user_id, fields=data,
        )
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
        txn = await transaction_repo.get_by_id(
            db, transaction_id, ctx.organization_id,
        )
        return None if txn is None or txn.deleted_at is not None else txn


async def update_transaction(
    ctx: RequestContext,
    transaction_id: uuid.UUID,
    updates: dict[str, TransactionFieldValue],
) -> tuple[Transaction, int] | None:
    async with unit_of_work() as db:
        txn = await transaction_repo.get_by_id(
            db, transaction_id, ctx.organization_id,
        )
        if not txn or txn.deleted_at is not None:
            return None
        old_category = txn.category
        old_schedule_e_line = txn.schedule_e_line
        old_property_id = txn.property_id
        old_scope = txn.transaction_scope
        old_tax_inputs = tax_total_inputs(txn)
        for field in updates:
            if field not in UPDATABLE_FIELDS:
                raise ValueError(f"Cannot update field: {field}")
        if "status" in updates:
            assert_status_editable(txn, updates["status"])
        await assert_references_owned(
            db, organization_id=ctx.organization_id, user_id=ctx.user_id, fields=updates,
        )
        for field, value in updates.items():
            setattr(txn, field, value)
        for field, value in transfer_overrides(
            transaction_type=txn.transaction_type,
            category=txn.category,
            account_id=txn.account_id,
            transfer_to_account_id=txn.transfer_to_account_id,
        ).items():
            setattr(txn, field, value)
        assert_metered_usage_consistent(txn)
        txn.placed_in_service_date = placed_in_service_date_for(
            txn.is_capital_improvement, txn.placed_in_service_date, txn.transaction_date,
        )

        category_changed = "category" in updates and txn.category != old_category
        if category_changed and "schedule_e_line" not in updates:
            txn.schedule_e_line = schedule_e_line_after_category_change(
                old_schedule_e_line, old_category, txn.category,
            )
        # After the category's Schedule E line is worked out, before anything
        # queries (and so flushes) the row.
        apply_scope_rules(txn)
        keep_split_consistent(txn)
        if (txn.category, txn.transaction_scope, txn.property_id) != (old_category, old_scope, old_property_id):
            mark_filed_by_person(txn)
        # A personal row's tax category and property mean nothing, so a
        # correction to one must not become a rule for the vendor's other rows.
        learns_rules = txn.transaction_scope != TRANSACTION_SCOPE_PERSONAL

        retroactive_count = 0
        if category_changed and learns_rules:
            retroactive_count = await rule_learning_service.learn_from_correction(
                db,
                organization_id=ctx.organization_id,
                user_id=ctx.user_id,
                transaction=txn,
                old_category=old_category,
            )

        await tax_return_repo.flag_unfiled_if_totals_moved(db, txn, old_tax_inputs)

        # Clearing a property teaches nothing: a rule with no property would take
        # the property off every other row from this vendor at this address.
        new_property_id = updates.get("property_id")
        if learns_rules and new_property_id is not None and new_property_id != old_property_id:
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
        return {"approved": approved, "skipped": len(set(ids)) - approved}


async def bulk_set_capital_improvement(
    ctx: RequestContext, ids: list[uuid.UUID], is_capital_improvement: bool,
) -> dict[str, int]:
    """Mark or unmark the non-personal expenses among the ids; anything else is skipped."""
    async with unit_of_work() as db:
        locked = await transaction_repo.lock_live_transactions(db, ids, ctx.organization_id)
        # Personal spending never reaches a depreciation schedule.
        expenses = [
            txn for txn in locked
            if txn.transaction_type == "expense"
            and txn.transaction_scope != TRANSACTION_SCOPE_PERSONAL
        ]
        totals_moved = False
        for txn in expenses:
            old_tax_inputs = tax_total_inputs(txn)
            txn.is_capital_improvement = is_capital_improvement
            txn.placed_in_service_date = placed_in_service_date_for(
                is_capital_improvement, txn.placed_in_service_date, txn.transaction_date,
            )
            totals_moved = totals_moved or tax_total_inputs(txn) != old_tax_inputs
        if totals_moved:
            await tax_return_repo.flag_unfiled_for_recompute(db, ctx.organization_id)
        return {"updated": len(expenses), "skipped": len(set(ids)) - len(expenses)}


async def bulk_delete(
    ctx: RequestContext, ids: list[uuid.UUID]
) -> dict[str, int]:
    async with unit_of_work() as db:
        deleted = await transaction_repo.bulk_delete(
            db, ids, ctx.organization_id,
        )
        return {"deleted": len(deleted), "skipped": len(set(ids)) - len(deleted)}


async def get_schedule_e_report(
    ctx: RequestContext, tax_year: int
) -> Sequence[Row[tuple[uuid.UUID | None, str | None, Decimal]]]:
    async with AsyncSessionLocal() as db:
        return await transaction_repo.schedule_e_report(
            db, ctx.organization_id, tax_year,
        )


async def get_linked_document_ids(
    ctx: RequestContext,
    transaction_ids: list[uuid.UUID],
) -> dict[uuid.UUID, list[uuid.UUID]]:
    """Get linked document IDs for a list of transactions."""
    async with AsyncSessionLocal() as db:
        return await transaction_repo.get_linked_document_ids(db, transaction_ids)
