"""The Property cell of an exported transaction."""
import uuid
from collections.abc import Mapping

from app.models.transactions.transaction import Transaction

UNASSIGNED_SHARE_LABEL = "Unassigned"


def transaction_property_label(txn: Transaction, property_names: Mapping[uuid.UUID, str]) -> str:
    """The property's name; for a split, every share as "<name> $<amount>", largest first."""
    if txn.property_splits:
        return "; ".join(
            f"{_share_name(share.property_id, property_names)} ${share.amount:,.2f}"
            for share in txn.property_splits
        )
    return property_names.get(txn.property_id, "") if txn.property_id else ""


def _share_name(property_id: uuid.UUID | None, property_names: Mapping[uuid.UUID, str]) -> str:
    if property_id is None:
        return UNASSIGNED_SHARE_LABEL
    return property_names.get(property_id, UNASSIGNED_SHARE_LABEL)
