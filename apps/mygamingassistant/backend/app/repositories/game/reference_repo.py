"""Reference-data repository for the classifier service.

Owns the DB queries the Claude classifier needs to do its job:
  - ``load_reference_data`` — fetch valid games/maps/zones/utility-types for
    a game (or all games) and return as plain dicts the prompt builder can
    consume without touching the ORM.
  - ``resolve_slugs`` — given the classifier-returned slug fields, resolve
    them back to database FK UUIDs (game-scoped so a Valorant slug cannot
    resolve on a CS2 lineup).

Extracted from ``classifier_service.py`` in PR R1 to push SQLAlchemy out of
the service layer (per MGA CLAUDE.md Architecture Rules: routes → services
→ repositories; ORM/DB queries belong in repositories). The service now
imports these as plain functions and never touches ``select`` or ORM
models directly.
"""
from __future__ import annotations

import uuid
from typing import Any, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.game.agent import Agent
from app.models.game.game import Game
from app.models.game.map import Map
from app.models.game.map_zone import MapZone
from app.models.game.utility_type import UtilityType


async def load_reference_data(
    db: AsyncSession,
    game_id: Optional[uuid.UUID],
) -> dict[str, Any]:
    """Load all valid slugs for a game (or all games if game_id is None).

    Returns a dict with keys:
      games: list[{slug, name, side_a_label, side_b_label}]
      maps: list[{slug, name, game_slug, zones: [{slug, name}]}]
      utility_types: list[{slug, name, game_slug, agent_slug}]

    ``agent_slug`` is the Valorant agent a utility ability belongs to (Sova's
    ``recon`` / ``shock``), or ``None`` for game-wide utilities (all CS2
    grenades). It lets the prompt builder scope the candidate ability list to a
    single agent (Source.config_json ``agent_hint``) — the recurrence fix for a
    Sova recon dart being mis-tagged as another agent's smoke.
    """
    game_rows = (await db.execute(select(Game).order_by(Game.slug))).scalars().all()
    # All agents (few — 29 across the fixtures); a plain id→slug map avoids an
    # async lazy-load of ``UtilityType.agent`` per row below.
    agent_rows = (await db.execute(select(Agent))).scalars().all()

    if game_id is not None:
        map_rows = (
            await db.execute(
                select(Map)
                .where(Map.game_id == game_id)
                .order_by(Map.slug)
            )
        ).scalars().all()
        ut_rows = (
            await db.execute(
                select(UtilityType)
                .where(UtilityType.game_id == game_id)
                .order_by(UtilityType.slug)
            )
        ).scalars().all()
    else:
        map_rows = (await db.execute(select(Map).order_by(Map.game_id, Map.slug))).scalars().all()
        ut_rows = (
            await db.execute(select(UtilityType).order_by(UtilityType.game_id, UtilityType.slug))
        ).scalars().all()

    map_ids = [m.id for m in map_rows]
    if map_ids:
        zone_rows = (
            await db.execute(
                select(MapZone)
                .where(MapZone.map_id.in_(map_ids))
                .order_by(MapZone.map_id, MapZone.slug)
            )
        ).scalars().all()
    else:
        zone_rows = []

    game_id_to_slug = {g.id: g.slug for g in game_rows}
    agent_id_to_slug = {a.id: a.slug for a in agent_rows}

    map_id_to_zones: dict[uuid.UUID, list[dict]] = {}
    for zone in zone_rows:
        map_id_to_zones.setdefault(zone.map_id, []).append(
            {"slug": zone.slug, "name": zone.name}
        )

    games_ref = [
        {
            "slug": g.slug,
            "name": g.name,
            "side_a_label": g.side_a_label,
            "side_b_label": g.side_b_label,
        }
        for g in game_rows
    ]

    maps_ref = [
        {
            "slug": m.slug,
            "name": m.name,
            "game_slug": game_id_to_slug.get(m.game_id, ""),
            "zones": map_id_to_zones.get(m.id, []),
        }
        for m in map_rows
    ]

    utility_types_ref = [
        {
            "slug": ut.slug,
            "name": ut.name,
            "game_slug": game_id_to_slug.get(ut.game_id, ""),
            "agent_slug": agent_id_to_slug.get(ut.agent_id),
        }
        for ut in ut_rows
    ]

    return {
        "games": games_ref,
        "maps": maps_ref,
        "utility_types": utility_types_ref,
    }


def _slug_failure_code(field_name: str, slug: str, *, game_slug: Optional[str]) -> str:
    """Build a stable, machine-readable failure code for an unresolved slug.

    Shape: ``unresolved_slug:<field>:<slug>:game=<game_slug or '?'>``.
    The classifier ADVERTISED this slug in the reference list it was given,
    yet it did not resolve against the (game-scoped) DB — so this is a
    diagnosable signal, not prose. Surfaced via error_codes so the operator
    sees "zone slug 'X' advertised but unresolved for game cs2" instead of
    guessing from a reasoning blob.
    """
    return f"unresolved_slug:{field_name}:{slug}:game={game_slug or '?'}"


async def resolve_slugs(
    db: AsyncSession,
    game_slug: Optional[str],
    map_slug: Optional[str],
    target_zone_slug: Optional[str],
    stand_zone_slug: Optional[str],
    utility_type_slug: Optional[str],
) -> tuple[
    Optional[uuid.UUID],
    Optional[uuid.UUID],
    Optional[uuid.UUID],
    Optional[uuid.UUID],
    Optional[uuid.UUID],
    list[str],
    list[str],
]:
    """Resolve classifier-returned slugs to database FK UUIDs.

    Returns a 7-tuple of (game_id, map_id, target_zone_id, stand_zone_id,
    utility_type_id, resolution_failures, structured_codes).

    resolution_failures is a list of human-readable strings for any slug that
    could not be resolved — appended to the reasoning field.

    structured_codes mirrors each failure as a stable, parseable token (see
    :func:`_slug_failure_code`) so the operator/UI gets a machine-readable
    "this advertised slug did not resolve" signal via
    ClassifyResponse.error_codes — not prose-only (per
    rules/check-third-party-error-codes.md).

    Game scoping is HARD here by construction: map/zone/utility lookups are
    gated on a successfully-resolved ``game_id`` AND every query filters by
    that ``game_id``. A Valorant-only zone slug therefore cannot resolve in a
    CS2 classification (different ``game_id`` → zero rows), independent of
    what the prompt advertised.
    """
    failures: list[str] = []
    codes: list[str] = []

    game_id: Optional[uuid.UUID] = None
    if game_slug:
        row = (await db.execute(select(Game).where(Game.slug == game_slug))).scalar_one_or_none()
        if row:
            game_id = row.id
        else:
            failures.append(f"game slug '{game_slug}' not found in DB")
            codes.append(_slug_failure_code("game", game_slug, game_slug=game_slug))

    map_id: Optional[uuid.UUID] = None
    if map_slug and game_id:
        row = (
            await db.execute(
                select(Map).where(Map.game_id == game_id, Map.slug == map_slug)
            )
        ).scalar_one_or_none()
        if row:
            map_id = row.id
        else:
            failures.append(f"map slug '{map_slug}' not found for game '{game_slug}'")
            codes.append(_slug_failure_code("map", map_slug, game_slug=game_slug))
    elif map_slug and not game_id:
        failures.append(f"cannot resolve map slug '{map_slug}' — game slug failed")
        codes.append(_slug_failure_code("map", map_slug, game_slug=game_slug))

    target_zone_id: Optional[uuid.UUID] = None
    if target_zone_slug and map_id:
        row = (
            await db.execute(
                select(MapZone).where(
                    MapZone.map_id == map_id, MapZone.slug == target_zone_slug
                )
            )
        ).scalar_one_or_none()
        if row:
            target_zone_id = row.id
        else:
            failures.append(f"target_zone slug '{target_zone_slug}' not found on map '{map_slug}'")
            codes.append(
                _slug_failure_code("target_zone", target_zone_slug, game_slug=game_slug)
            )
    elif target_zone_slug and not map_id:
        failures.append(f"cannot resolve target_zone slug '{target_zone_slug}' — map slug failed")
        codes.append(
            _slug_failure_code("target_zone", target_zone_slug, game_slug=game_slug)
        )

    stand_zone_id: Optional[uuid.UUID] = None
    if stand_zone_slug and map_id:
        row = (
            await db.execute(
                select(MapZone).where(
                    MapZone.map_id == map_id, MapZone.slug == stand_zone_slug
                )
            )
        ).scalar_one_or_none()
        if row:
            stand_zone_id = row.id
        else:
            failures.append(f"stand_zone slug '{stand_zone_slug}' not found on map '{map_slug}'")
            codes.append(
                _slug_failure_code("stand_zone", stand_zone_slug, game_slug=game_slug)
            )
    elif stand_zone_slug and not map_id:
        failures.append(f"cannot resolve stand_zone slug '{stand_zone_slug}' — map slug failed")
        codes.append(
            _slug_failure_code("stand_zone", stand_zone_slug, game_slug=game_slug)
        )

    utility_type_id: Optional[uuid.UUID] = None
    if utility_type_slug and game_id:
        row = (
            await db.execute(
                select(UtilityType).where(
                    UtilityType.game_id == game_id,
                    UtilityType.slug == utility_type_slug,
                )
            )
        ).scalar_one_or_none()
        if row:
            utility_type_id = row.id
        else:
            failures.append(
                f"utility_type slug '{utility_type_slug}' not found for game '{game_slug}'"
            )
            codes.append(
                _slug_failure_code("utility_type", utility_type_slug, game_slug=game_slug)
            )
    elif utility_type_slug and not game_id:
        failures.append(
            f"cannot resolve utility_type slug '{utility_type_slug}' — game slug failed"
        )
        codes.append(
            _slug_failure_code("utility_type", utility_type_slug, game_slug=game_slug)
        )

    return (
        game_id,
        map_id,
        target_zone_id,
        stand_zone_id,
        utility_type_id,
        failures,
        codes,
    )


async def get_game_slug_for_map(db: AsyncSession, map_slug: str) -> Optional[str]:
    """Return the game slug a map slug belongs to, or None if no such map.

    Used to validate + normalize an operator source ``map_hint``: a map scope
    implies its game, so the source service stores both. Keeping the query here
    keeps ``select``/ORM out of the service layer (MGA CLAUDE.md Architecture
    Rules: routes → services → repositories).
    """
    return (
        await db.execute(
            select(Game.slug)
            .join(Map, Map.game_id == Game.id)
            .where(Map.slug == map_slug)
        )
    ).scalar_one_or_none()


async def game_slug_exists(db: AsyncSession, game_slug: str) -> bool:
    """Return True if a game with this slug exists.

    Used to validate an operator source ``game_hint`` without the service
    layer issuing its own ORM query.
    """
    return (
        await db.execute(select(Game.slug).where(Game.slug == game_slug))
    ).scalar_one_or_none() is not None
