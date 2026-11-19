"""Fill the surviving row's empty links and classifications from the rows being removed.

Pure: it reads and sets attributes on already-loaded rows and touches no session.
"""
from app.core.duplicate_merge_constants import CARRY_OVER_FIELD_GROUPS, CONFLICTING_LINK_LABELS
from app.models.transactions.transaction import Transaction
from app.services.transactions.merge_conflict_error import MergeConflictError


def _is_set(value: object) -> bool:
    # False counts as unset so a True flag (capital improvement, tax relevant) is
    # never lost; 0 stays set because a vacant month's 0 kWh is real usage.
    return value is not None and value is not False and value != ""


def _conflict_message(fields: list[str]) -> str:
    labels = " and ".join(CONFLICTING_LINK_LABELS[field] for field in fields)
    return (
        f"These transactions are linked to different {labels}. "
        "Set the same one on both, or clear it on one of them, then try again."
    )


def carry_over_fields(survivor: Transaction, removed: list[Transaction]) -> None:
    """Copy each field group the survivor lacks from the first removed row that has it.

    Raises ``MergeConflictError`` before changing anything when two rows hold
    different tenants, vendors or activities.
    """
    updates: dict[str, object] = {}
    conflicts: list[str] = []
    for group in CARRY_OVER_FIELD_GROUPS:
        key = group[0]
        source: Transaction | None = survivor if _is_set(getattr(survivor, key)) else None
        for txn in removed:
            value = getattr(txn, key)
            if not _is_set(value):
                continue
            if source is None:
                source = txn
                updates.update({field: getattr(txn, field) for field in group})
            elif key in CONFLICTING_LINK_LABELS and value != getattr(source, key):
                conflicts.append(key)
                break
    if conflicts:
        raise MergeConflictError(_conflict_message(conflicts))
    for field, value in updates.items():
        setattr(survivor, field, value)
