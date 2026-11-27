"""Splitting one transaction across several properties.

A split transaction has no ``property_id`` of its own; its shares are the only
record of which properties it belongs to. Picking a single property for it
again, or turning it into a transfer, removes the split. Changing its amount
keeps the shares in proportion. See ``property_split_math`` for the cents.
"""
import uuid
from decimal import Decimal

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.context import RequestContext
from app.core.property_split_constants import SPLIT_NOT_FOR_TRANSFERS, SPLIT_PROPERTY_NOT_FOUND
from app.core.tags import TRANSACTION_TYPE_TRANSFER
from app.core.tax_total_inputs import tax_total_inputs
from app.db.session import unit_of_work
from app.models.transactions.transaction import Transaction
from app.repositories import transaction_repo
from app.repositories.properties import property_repo
from app.repositories.tax import tax_return_repo
from app.repositories.transactions import property_split_repo
from app.schemas.transactions.transaction_property_split_request import TransactionPropertySplitRequest
from app.services.transactions.property_split_error import PropertySplitError
from app.services.transactions.property_split_math import even_shares, rescaled_shares, validate_shares


def requested_shares(
    amount: Decimal, request: TransactionPropertySplitRequest,
) -> list[tuple[uuid.UUID, Decimal]]:
    """The shares the request names, or the even split it asks for, checked to add up to ``amount``."""
    if request.even_across is not None:
        shares = list(zip(request.even_across, even_shares(amount, len(request.even_across)), strict=True))
    else:
        shares = [(share.property_id, share.amount) for share in request.shares or []]
    validate_shares(amount, shares)
    return shares


async def _assert_properties_owned(
    db: AsyncSession, organization_id: uuid.UUID, property_ids: list[uuid.UUID],
) -> None:
    owned = await property_repo.get_name_map(db, organization_id)
    if any(property_id not in owned for property_id in property_ids):
        raise PropertySplitError(SPLIT_PROPERTY_NOT_FOUND)


async def apply_split(
    db: AsyncSession, txn: Transaction, shares: list[tuple[uuid.UUID, Decimal]],
) -> None:
    """Split ``txn`` into these (already checked) shares, replacing its property and any split it had."""
    if txn.transaction_type == TRANSACTION_TYPE_TRANSFER:
        raise PropertySplitError(SPLIT_NOT_FOR_TRANSFERS)
    await _assert_properties_owned(db, txn.organization_id, [property_id for property_id, _ in shares])
    txn.property_id = None
    await property_split_repo.replace_shares(db, txn, shares)
    # Every per-property Schedule E figure may have moved, though the row's own
    # fields didn't change the way tax_total_inputs can see.
    if tax_total_inputs(txn) is not None:
        await tax_return_repo.flag_unfiled_for_recompute(db, txn.organization_id)


async def set_split(
    ctx: RequestContext, transaction_id: uuid.UUID, request: TransactionPropertySplitRequest,
) -> Transaction | None:
    async with unit_of_work() as db:
        txn = await transaction_repo.get_by_id(db, transaction_id, ctx.organization_id)
        if txn is None or txn.deleted_at is not None:
            return None
        await apply_split(db, txn, requested_shares(txn.amount, request))
        return txn


async def remove_split(ctx: RequestContext, transaction_id: uuid.UUID) -> Transaction | None:
    """Undo a split; the transaction is left with no property, for the person to pick one."""
    async with unit_of_work() as db:
        txn = await transaction_repo.get_by_id(db, transaction_id, ctx.organization_id)
        if txn is None or txn.deleted_at is not None:
            return None
        if txn.property_splits:
            property_split_repo.clear_shares(txn)
            if tax_total_inputs(txn) is not None:
                await tax_return_repo.flag_unfiled_for_recompute(db, txn.organization_id)
        return txn


def keep_split_consistent(txn: Transaction) -> None:
    """After an edit: a property of its own or a transfer ends the split; a new amount rescales it."""
    if not txn.property_splits:
        return
    if txn.property_id is not None or txn.transaction_type == TRANSACTION_TYPE_TRANSFER:
        property_split_repo.clear_shares(txn)
        return
    shares = [share.amount for share in txn.property_splits]
    if sum(shares) != txn.amount:
        property_split_repo.set_share_amounts(txn, rescaled_shares(shares, txn.amount))
