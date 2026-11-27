"""Writes to a transaction's property shares (``transaction_property_splits``).

Every write goes through the transaction's ``property_splits`` collection, so
the audit listener sees each share and the loaded transaction stays in step.
"""
import uuid
from collections.abc import Sequence
from decimal import Decimal

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.transactions.transaction import Transaction
from app.models.transactions.transaction_property_split import TransactionPropertySplit


async def replace_shares(
    db: AsyncSession, txn: Transaction, shares: Sequence[tuple[uuid.UUID, Decimal]],
) -> None:
    """Make these the transaction's shares, largest first as ``Transaction.property_splits`` loads them."""
    # The old shares are deleted before the new ones are inserted: a flush
    # inserts first, and a property kept in the split would hit
    # uq_txn_split_property.
    txn.property_splits.clear()
    await db.flush()
    txn.property_splits.extend(
        TransactionPropertySplit(property_id=property_id, amount=amount)
        for property_id, amount in sorted(shares, key=lambda share: share[1], reverse=True)
    )
    await db.flush()


def clear_shares(txn: Transaction) -> None:
    """Remove every share; deleted at the next flush."""
    txn.property_splits.clear()


def set_share_amounts(txn: Transaction, amounts: Sequence[Decimal]) -> None:
    """New amounts for the shares as they are ordered, each keeping its property."""
    for share, amount in zip(txn.property_splits, amounts, strict=True):
        share.amount = amount
