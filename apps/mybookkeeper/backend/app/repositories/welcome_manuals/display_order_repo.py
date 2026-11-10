import uuid
from collections.abc import Sequence
from typing import Protocol, TypeVar

from sqlalchemy.ext.asyncio import AsyncSession


class _Ordered(Protocol):
    id: uuid.UUID
    display_order: int


Row = TypeVar("Row", bound=_Ordered)


async def set_display_orders(
    db: AsyncSession,
    rows: Sequence[Row],
    ordered_ids: Sequence[uuid.UUID],
) -> list[Row]:
    """Give each already-loaded row the position of its id in ``ordered_ids``.

    One flush for the whole list. The caller has already checked that
    ``ordered_ids`` is exactly the ids of ``rows``. Returns the rows in the new
    order, so the caller needs no re-SELECT.
    """
    row_by_id = {row.id: row for row in rows}
    for index, row_id in enumerate(ordered_ids):
        row_by_id[row_id].display_order = index
    await db.flush()
    return [row_by_id[row_id] for row_id in ordered_ids]
