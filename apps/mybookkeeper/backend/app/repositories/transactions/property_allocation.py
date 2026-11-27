"""Which property each dollar of a transaction belongs to.

A transaction belongs to its ``property_id``, unless it is split across
properties: then each share (``transaction_property_splits``) belongs to its
own property and the transaction row has none. Every per-property figure reads
money through here, so a split is honoured in one place.

``allocated(stmt)`` outer-joins the shares onto a select over Transaction: a
split row comes back once per share, any other row once. Summing
``ALLOCATED_AMOUNT`` therefore gives each property its share, and a total over
every property is unchanged, because the shares add up to the amount. Never
count rows (``COUNT(*)``) over an allocated select: a split row is several rows.

The predicates (``has_property``, ``on_any_property``) filter whole
transactions, for lists, without the join; ``amount_on_properties`` is what
such a filtered row adds to a total of those properties.
"""
import uuid
from collections.abc import Sequence
from typing import Any, TypeVar

from sqlalchemy import ColumnElement, Select, case, exists, func, or_, select
from sqlalchemy.orm import aliased

from app.models.transactions.transaction import Transaction
from app.models.transactions.transaction_property_split import TransactionPropertySplit

_SelectT = TypeVar("_SelectT", bound=Select[Any])

_is_share = TransactionPropertySplit.id.is_not(None)

ALLOCATED_PROPERTY_ID: ColumnElement[uuid.UUID | None] = case(
    (_is_share, TransactionPropertySplit.property_id), else_=Transaction.property_id,
)
ALLOCATED_AMOUNT: ColumnElement[Any] = case(
    (_is_share, TransactionPropertySplit.amount), else_=Transaction.amount,
)

# The predicates look shares up through their own alias: one that named the
# joined table would correlate to the join in an allocated select.
_share = aliased(TransactionPropertySplit)


def allocated(stmt: _SelectT) -> _SelectT:
    """The select joined to the shares; its FROM must start at Transaction."""
    return stmt.outerjoin(
        TransactionPropertySplit, TransactionPropertySplit.transaction_id == Transaction.id,
    )


def is_split() -> ColumnElement[bool]:
    return exists().where(_share.transaction_id == Transaction.id)


def has_property() -> ColumnElement[bool]:
    """A property of its own, or a split across properties."""
    return or_(Transaction.property_id.is_not(None), is_split())


def on_any_property(property_ids: Sequence[uuid.UUID]) -> ColumnElement[bool]:
    """Belongs, in whole or in part, to any of these properties."""
    return or_(
        Transaction.property_id.in_(property_ids),
        exists().where(_share.transaction_id == Transaction.id, _share.property_id.in_(property_ids)),
    )


def amount_on_properties(property_ids: Sequence[uuid.UUID]) -> ColumnElement[Any]:
    """The part of the amount that belongs to these properties: the matching shares of a split row, else all of it."""
    shares = (
        select(func.sum(_share.amount))
        .where(_share.transaction_id == Transaction.id, _share.property_id.in_(property_ids))
        .correlate(Transaction)
        .scalar_subquery()
    )
    return case((is_split(), func.coalesce(shares, 0)), else_=Transaction.amount)
