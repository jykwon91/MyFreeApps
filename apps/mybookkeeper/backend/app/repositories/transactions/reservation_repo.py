import uuid
from collections.abc import Sequence
from datetime import date

from sqlalchemy import Numeric, Row, case, cast, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.transactions.reservation import Reservation


async def create(db: AsyncSession, reservation: Reservation) -> Reservation:
    db.add(reservation)
    await db.flush()
    return reservation


async def list_by_transaction(
    db: AsyncSession, transaction_id: uuid.UUID
) -> Sequence[Reservation]:
    result = await db.execute(
        select(Reservation)
        .where(Reservation.transaction_id == transaction_id)
        .order_by(Reservation.check_in.asc())
    )
    return result.scalars().all()


async def get_by_id(
    db: AsyncSession, reservation_id: uuid.UUID, organization_id: uuid.UUID,
) -> Reservation | None:
    result = await db.execute(
        select(Reservation).where(
            Reservation.id == reservation_id,
            Reservation.organization_id == organization_id,
        )
    )
    return result.scalar_one_or_none()


async def find_by_res_code(
    db: AsyncSession, organization_id: uuid.UUID, res_code: str
) -> Reservation | None:
    result = await db.execute(
        select(Reservation).where(
            Reservation.organization_id == organization_id,
            Reservation.res_code == res_code,
        )
    )
    return result.scalar_one_or_none()


async def list_filtered(
    db: AsyncSession,
    organization_id: uuid.UUID,
    *,
    property_id: uuid.UUID | None = None,
    start_date: date | None = None,
    end_date: date | None = None,
    limit: int | None = None,
    offset: int | None = None,
) -> Sequence[Reservation]:
    stmt = (
        select(Reservation)
        .where(Reservation.organization_id == organization_id)
    )

    if property_id is not None:
        stmt = stmt.where(Reservation.property_id == property_id)
    if start_date is not None:
        stmt = stmt.where(Reservation.check_in >= start_date)
    if end_date is not None:
        stmt = stmt.where(Reservation.check_in <= end_date)

    stmt = stmt.order_by(Reservation.check_in.desc())

    if offset is not None:
        stmt = stmt.offset(offset)
    if limit is not None:
        stmt = stmt.limit(limit)

    result = await db.execute(stmt)
    return result.scalars().all()


async def occupancy_query(
    db: AsyncSession,
    organization_id: uuid.UUID,
    property_id: uuid.UUID,
    start_date: date,
    end_date: date,
) -> Row | None:
    result = await db.execute(
        select(
            func.sum(Reservation.nights).label("total_nights"),
            func.count().label("reservation_count"),
        ).where(
            Reservation.organization_id == organization_id,
            Reservation.property_id == property_id,
            Reservation.check_in >= start_date,
            Reservation.check_in <= end_date,
        )
    )
    return result.one_or_none()


async def distinct_platforms_for_year(
    db: AsyncSession,
    organization_id: uuid.UUID,
    tax_year: int,
) -> list[str]:
    """Return distinct lowercased platform names for reservations in a tax year."""
    stmt = (
        select(func.lower(Reservation.platform))
        .where(
            Reservation.organization_id == organization_id,
            Reservation.check_in >= date(tax_year, 1, 1),
            Reservation.check_in <= date(tax_year, 12, 31),
            Reservation.platform.isnot(None),
        )
        .group_by(func.lower(Reservation.platform))
    )
    result = await db.execute(stmt)
    return [row[0] for row in result.all()]


async def summary_by_property_platform(
    db: AsyncSession,
    organization_id: uuid.UUID,
    tax_year: int,
) -> list[Row]:
    """Return (property_id, platform, total_reservations, total_nights, total_gross, total_net)."""
    stmt = (
        select(
            Reservation.property_id,
            func.count().label("total_reservations"),
            func.sum(Reservation.nights).label("total_nights"),
            func.sum(Reservation.gross_booking).label("total_gross"),
            func.sum(Reservation.net_client_earnings).label("total_net"),
            Reservation.platform,
        )
        .where(
            Reservation.organization_id == organization_id,
            func.extract("year", Reservation.check_in) == tax_year,
        )
        .group_by(Reservation.property_id, Reservation.platform)
    )
    result = await db.execute(stmt)
    return result.all()


async def adr_query(
    db: AsyncSession,
    organization_id: uuid.UUID,
    property_id: uuid.UUID,
    start_date: date,
    end_date: date,
) -> Row | None:
    result = await db.execute(
        select(
            func.avg(
                case(
                    (Reservation.nights > 0,
                     cast(Reservation.net_booking_revenue, Numeric(12, 2)) / Reservation.nights),
                    else_=None,
                )
            ).label("average_daily_rate"),
        ).where(
            Reservation.organization_id == organization_id,
            Reservation.property_id == property_id,
            Reservation.check_in >= start_date,
            Reservation.check_in <= end_date,
            Reservation.net_booking_revenue.isnot(None),
        )
    )
    return result.one_or_none()


async def total_nights_by_property(
    db: AsyncSession,
    organization_id: uuid.UUID,
    tax_year: int,
) -> dict[uuid.UUID, int]:
    """Return {property_id: total_nights} for all properties with reservations in a tax year."""
    stmt = (
        select(
            Reservation.property_id,
            func.sum(Reservation.nights).label("total_nights"),
        )
        .where(
            Reservation.organization_id == organization_id,
            func.extract("year", Reservation.check_in) == tax_year,
        )
        .group_by(Reservation.property_id)
    )
    result = await db.execute(stmt)
    return {
        row.property_id: int(row.total_nights)
        for row in result.all()
        if row.total_nights is not None
    }
