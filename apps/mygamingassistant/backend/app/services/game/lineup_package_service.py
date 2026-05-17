"""LineupPackage business-logic service.

Responsibilities:
- CRUD for LineupPackage + LineupPackageLineup (join table)
- Validation: lineup_ids must reference lineups in the same game/map/side

ORM operations live exclusively in lineup_package_repo.
"""
from __future__ import annotations

import uuid
from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import unit_of_work
from app.models.game.lineup_package import LineupPackage
from app.repositories.game import lineup_package_repo
from app.repositories.game.lineup_package_repo import PackageFilters
from app.schemas.game.lineup_package_schemas import (
    LineupPackageCreate,
    LineupPackagePatch,
    LineupPackageRead,
    PinAllResponse,
)


def _to_read(pkg: LineupPackage) -> LineupPackageRead:
    """Convert a LineupPackage ORM instance to the read schema.

    package_lineups must be eagerly loaded before calling this.
    """
    lineup_ids = [
        row.lineup_id
        for row in sorted(pkg.package_lineups, key=lambda r: r.sort_order)
    ]
    return LineupPackageRead(
        id=pkg.id,
        name=pkg.name,
        game_id=pkg.game_id,
        map_id=pkg.map_id,
        side=pkg.side,
        created_at=pkg.created_at.isoformat(),
        lineup_ids=lineup_ids,
    )


async def create(
    payload: LineupPackageCreate,
) -> LineupPackageRead:
    """Create a package. Commits atomically via ``unit_of_work`` (the
    repo flushes; the service owns the transaction boundary — the route
    must NOT commit, mirroring the canonical MBK service pattern)."""
    data = {
        "name": payload.name,
        "game_id": payload.game_id,
        "map_id": payload.map_id,
        "side": payload.side,
    }
    async with unit_of_work() as db:
        pkg = await lineup_package_repo.create_package(db, data, payload.lineup_ids)
        return _to_read(pkg)


async def list_by_filters(
    db: AsyncSession,
    game_id: Optional[uuid.UUID],
    map_id: Optional[uuid.UUID],
    side: Optional[str],
) -> list[LineupPackageRead]:
    filters = PackageFilters(game_id=game_id, map_id=map_id, side=side)
    packages = await lineup_package_repo.list_packages(db, filters)
    return [_to_read(p) for p in packages]


async def get(
    db: AsyncSession,
    package_id: uuid.UUID,
) -> LineupPackageRead | None:
    pkg = await lineup_package_repo.get_package(db, package_id)
    if pkg is None:
        return None
    return _to_read(pkg)


async def patch(
    package_id: uuid.UUID,
    payload: LineupPackagePatch,
) -> LineupPackageRead | None:
    """Rename / re-side / replace the lineup list. Commits atomically via
    ``unit_of_work`` — the route must NOT commit."""
    patch_data: dict = {}
    if payload.name is not None:
        patch_data["name"] = payload.name
    if payload.side is not None:
        patch_data["side"] = payload.side

    async with unit_of_work() as db:
        pkg = await lineup_package_repo.get_package(db, package_id)
        if pkg is None:
            return None
        updated = await lineup_package_repo.update_package(
            db, pkg, patch_data, payload.lineup_ids
        )
        return _to_read(updated)


async def delete(
    package_id: uuid.UUID,
) -> bool:
    """Delete a package. Returns True if deleted, False if not found.

    Commits atomically via ``unit_of_work`` — the route must NOT commit."""
    async with unit_of_work() as db:
        pkg = await lineup_package_repo.get_package(db, package_id)
        if pkg is None:
            return False
        await lineup_package_repo.delete_package(db, pkg)
        return True


async def get_pin_all(
    db: AsyncSession,
    package_id: uuid.UUID,
) -> PinAllResponse | None:
    """Return lineup_ids for client-side pin-all.

    Pins live in localStorage (usePins). This endpoint returns the ordered
    lineup_ids so the frontend can iterate and pin each. No server state
    is modified.
    """
    pkg = await lineup_package_repo.get_package(db, package_id)
    if pkg is None:
        return None

    lineup_ids = [
        row.lineup_id
        for row in sorted(pkg.package_lineups, key=lambda r: r.sort_order)
    ]
    return PinAllResponse(
        package_id=package_id,
        lineup_ids=lineup_ids,
    )
