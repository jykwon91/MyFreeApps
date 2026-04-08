import uuid
from collections.abc import Sequence
from datetime import date
from decimal import Decimal

from app.core.context import RequestContext
from app.db.session import AsyncSessionLocal
from app.models.transactions.reservation import Reservation
from app.repositories import reservation_repo


async def list_reservations(
    ctx: RequestContext,
    *,
    property_id: uuid.UUID | None = None,
    start_date: date | None = None,
    end_date: date | None = None,
    limit: int | None = None,
    offset: int | None = None,
) -> Sequence[Reservation]:
    async with AsyncSessionLocal() as db:
        return await reservation_repo.list_filtered(
            db,
            ctx.organization_id,
            property_id=property_id,
            start_date=start_date,
            end_date=end_date,
            limit=limit,
            offset=offset,
        )


async def get_occupancy(
    ctx: RequestContext,
    property_id: uuid.UUID,
    start_date: date,
    end_date: date,
) -> dict[str, int | Decimal | None]:
    async with AsyncSessionLocal() as db:
        row = await reservation_repo.occupancy_query(
            db, ctx.organization_id, property_id, start_date, end_date,
        )
        total_days = (end_date - start_date).days
        if row and row.total_nights:
            occupancy_rate = round(Decimal(row.total_nights) / Decimal(total_days) * 100, 1) if total_days > 0 else Decimal("0")
            return {
                "total_nights": row.total_nights,
                "reservation_count": row.reservation_count,
                "total_days": total_days,
                "occupancy_rate": occupancy_rate,
            }
        return {
            "total_nights": 0,
            "reservation_count": 0,
            "total_days": total_days,
            "occupancy_rate": Decimal("0"),
        }
