"""LineupPackage repository — ORM operations for lineup_package and
lineup_package_lineup tables.

Mirrors lineup_repo.py shape:
  - Dataclass for filters
  - Standalone functions (no class)
  - Eager-load package_lineups on all reads
"""
from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.game.lineup_package import LineupPackage, LineupPackageLineup


@dataclass
class PackageFilters:
    game_id: Optional[uuid.UUID] = None
    map_id: Optional[uuid.UUID] = None
    side: Optional[str] = None


async def create_package(
    db: AsyncSession,
    data: dict,
    lineup_ids: list[uuid.UUID],
) -> LineupPackage:
    """Insert a LineupPackage and its LineupPackageLineup join rows.

    lineup_ids order is preserved as sort_order.
    """
    pkg = LineupPackage(**{k: v for k, v in data.items() if k != "lineup_ids"})
    db.add(pkg)
    await db.flush()  # get pkg.id

    for idx, lid in enumerate(lineup_ids):
        join_row = LineupPackageLineup(
            package_id=pkg.id,
            lineup_id=lid,
            sort_order=idx,
        )
        db.add(join_row)

    await db.flush()
    await db.refresh(pkg, attribute_names=["package_lineups"])
    return pkg


async def list_packages(
    db: AsyncSession,
    filters: PackageFilters,
) -> list[LineupPackage]:
    """Return packages matching filters, with package_lineups eager-loaded."""
    stmt = (
        select(LineupPackage)
        .options(selectinload(LineupPackage.package_lineups))
        .order_by(LineupPackage.created_at.desc())
    )
    if filters.game_id is not None:
        stmt = stmt.where(LineupPackage.game_id == filters.game_id)
    if filters.map_id is not None:
        stmt = stmt.where(LineupPackage.map_id == filters.map_id)
    if filters.side is not None:
        stmt = stmt.where(LineupPackage.side == filters.side)

    result = await db.execute(stmt)
    return list(result.scalars().all())


async def get_package(
    db: AsyncSession,
    package_id: uuid.UUID,
) -> LineupPackage | None:
    """Return a single package by id, with package_lineups eager-loaded."""
    stmt = (
        select(LineupPackage)
        .where(LineupPackage.id == package_id)
        .options(selectinload(LineupPackage.package_lineups))
    )
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


async def update_package(
    db: AsyncSession,
    pkg: LineupPackage,
    patch: dict,
    lineup_ids: Optional[list[uuid.UUID]],
) -> LineupPackage:
    """Update scalar fields and optionally replace the lineup list.

    When lineup_ids is provided (not None), the existing join rows are
    deleted and re-created in the provided order. When None, the lineup
    list is not modified.
    """
    for key, value in patch.items():
        setattr(pkg, key, value)

    if lineup_ids is not None:
        # Delete all existing join rows for this package
        existing_stmt = select(LineupPackageLineup).where(
            LineupPackageLineup.package_id == pkg.id
        )
        existing_result = await db.execute(existing_stmt)
        for row in existing_result.scalars().all():
            await db.delete(row)

        # Re-create in new order
        for idx, lid in enumerate(lineup_ids):
            join_row = LineupPackageLineup(
                package_id=pkg.id,
                lineup_id=lid,
                sort_order=idx,
            )
            db.add(join_row)

    await db.flush()
    await db.refresh(pkg, attribute_names=["package_lineups"])
    return pkg


async def delete_package(
    db: AsyncSession,
    pkg: LineupPackage,
) -> None:
    """Hard-delete a package (join rows cascade via FK)."""
    await db.delete(pkg)
    await db.flush()
