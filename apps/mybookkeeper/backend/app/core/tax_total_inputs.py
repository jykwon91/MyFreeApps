"""What a transaction contributes to a tax return's computed totals.

Schedule E and Schedule C sum live, approved, tax-relevant rows by these fields
(see ``schedule_e_recompute`` and ``tax_recompute_service``). A write that leaves
``tax_total_inputs`` unchanged for every row it touches can't move a total, so it
must not mark a return out of date; any other write must.
"""
from app.core.transaction_statuses import COUNTED_STATUS
from app.models.transactions.transaction import Transaction

TAX_TOTAL_INPUT_FIELDS = (
    "tax_year",
    "amount",
    "property_id",
    "activity_id",
    "category",
    "schedule_e_line",
)


def tax_total_inputs(transaction: Transaction) -> tuple[object, ...] | None:
    """The row's summed fields, or ``None`` when the row counts towards no total."""
    if (
        transaction.deleted_at is not None
        or transaction.status != COUNTED_STATUS
        or not transaction.tax_relevant
    ):
        return None
    return tuple(getattr(transaction, field) for field in TAX_TOTAL_INPUT_FIELDS)
