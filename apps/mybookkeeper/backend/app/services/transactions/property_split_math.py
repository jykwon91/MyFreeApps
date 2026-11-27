"""Dividing a transaction's amount into per-property shares, to the cent.

Pure. Shares are whole cents and always add up to the total exactly. The cents
that don't divide evenly go one each to the first shares, in order: $100.00
three ways is $33.34, $33.33, $33.33. The frontend mirrors ``even_shares`` in
``api-client/src/utils/propertySplit.ts`` so the editor previews what the
server saves.
"""
from collections.abc import Sequence
from decimal import ROUND_FLOOR, Decimal

from app.core.property_split_constants import (
    MIN_SPLIT_SHARES,
    SPLIT_AMOUNTS_DONT_ADD_UP,
    SPLIT_NEEDS_TWO_PROPERTIES,
    SPLIT_PROPERTY_REPEATED,
    SPLIT_SHARE_NOT_POSITIVE,
    SPLIT_SHARE_NOT_CENTS,
    SPLIT_TOO_SMALL,
)
from app.services.transactions.property_split_error import PropertySplitError

CENT = Decimal("0.01")


def _to_cents(amount: Decimal) -> int:
    return int((amount / CENT).to_integral_value())


def _from_cents(cents: int) -> Decimal:
    return (Decimal(cents) * CENT).quantize(CENT)


def _spread(total_cents: int, floors: list[int]) -> list[Decimal]:
    """The floors, plus one cent each to the first shares until they reach the total."""
    leftover = total_cents - sum(floors)
    return [_from_cents(cents + (1 if i < leftover else 0)) for i, cents in enumerate(floors)]


def even_shares(total: Decimal, count: int) -> list[Decimal]:
    """``total`` in ``count`` equal shares; the odd cents go to the first ones."""
    if count < MIN_SPLIT_SHARES:
        raise PropertySplitError(SPLIT_NEEDS_TWO_PROPERTIES)
    total_cents = _to_cents(total)
    if total_cents < count:
        raise PropertySplitError(SPLIT_TOO_SMALL)
    return _spread(total_cents, [total_cents // count] * count)


def rescaled_shares(shares: Sequence[Decimal], new_total: Decimal) -> list[Decimal]:
    """The shares kept in proportion when the transaction's amount changes to ``new_total``."""
    old_cents = [_to_cents(share) for share in shares]
    new_cents = _to_cents(new_total)
    old_total = sum(old_cents)
    floors = [
        int((Decimal(cents) * new_cents / old_total).to_integral_value(rounding=ROUND_FLOOR))
        for cents in old_cents
    ]
    result = _spread(new_cents, floors)
    if any(share <= 0 for share in result):
        raise PropertySplitError(SPLIT_TOO_SMALL)
    return result


def validate_shares(total: Decimal, shares: Sequence[tuple[object, Decimal]]) -> None:
    """Two or more distinct properties, each a positive whole-cent share, adding up to ``total``."""
    if len(shares) < MIN_SPLIT_SHARES:
        raise PropertySplitError(SPLIT_NEEDS_TWO_PROPERTIES)
    property_ids = [property_id for property_id, _ in shares]
    if len(set(property_ids)) != len(property_ids):
        raise PropertySplitError(SPLIT_PROPERTY_REPEATED)
    for _, amount in shares:
        if amount <= 0:
            raise PropertySplitError(SPLIT_SHARE_NOT_POSITIVE)
        if amount != amount.quantize(CENT):
            raise PropertySplitError(SPLIT_SHARE_NOT_CENTS)
    if sum(amount for _, amount in shares) != total:
        raise PropertySplitError(SPLIT_AMOUNTS_DONT_ADD_UP)
