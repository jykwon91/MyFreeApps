"""What being a transfer forces onto a transaction, and what it rules out.

A transfer moves the user's own money between two of their accounts. It is
never income, never an expense and never a tax event, so the tax fields are
forced off rather than rejected — a row being re-typed as a transfer in the
editor still carries the old expense's Schedule E line, and making the user
clear it by hand first would only be friction. Mismatches that cannot be
resolved by forcing (a transfer type with a non-transfer category) are
rejected, mirroring ``chk_txn_type_category`` as a 422 instead of a 500.

Pure: takes the row's would-be values, returns the overrides to apply.
"""
from __future__ import annotations

import uuid

from app.core.tags import TRANSACTION_TYPE_TRANSFER, TRANSFER_CATEGORY

TransferOverrides = dict[str, bool | str | uuid.UUID | None]


class TransferRuleError(ValueError):
    pass


def transfer_overrides(
    *,
    transaction_type: str,
    category: str,
    account_id: uuid.UUID | None,
    transfer_to_account_id: uuid.UUID | None,
) -> TransferOverrides:
    is_transfer_type = transaction_type == TRANSACTION_TYPE_TRANSFER
    is_transfer_category = category == TRANSFER_CATEGORY
    if is_transfer_type != is_transfer_category:
        raise TransferRuleError(
            "A transfer must have both the transfer type and the transfer category",
        )
    if not is_transfer_type:
        # Only a transfer arrives somewhere. Dropping the destination keeps a
        # row re-typed from transfer to expense valid instead of rejecting it.
        return {"transfer_to_account_id": None} if transfer_to_account_id is not None else {}
    if account_id is not None and account_id == transfer_to_account_id:
        raise TransferRuleError("A transfer must move money between two different accounts")
    return {
        "tax_relevant": False,
        "schedule_e_line": None,
        "is_capital_improvement": False,
        "placed_in_service_date": None,
    }
