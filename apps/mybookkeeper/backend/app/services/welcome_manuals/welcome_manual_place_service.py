"""Welcome-manual place service — orchestration for the flat list of
restaurant recommendations attached directly to a manual (no section parent).
Scope is enforced by re-fetching the parent manual (org-scoped) before
touching any place.
"""
import logging
import uuid
from typing import Any

from app.core.welcome_manual_constants import WELCOME_MANUAL_MAX_PLACES
from app.db.session import unit_of_work
from app.repositories import welcome_manual_place_repo, welcome_manual_repo
from app.schemas.welcome_manuals.welcome_manual_place_response import (
    WelcomeManualPlaceResponse,
)
from app.services.welcome_manuals.welcome_manual_section_service import (
    ManualNotFoundError,  # noqa: F401 — re-exported for the route
)

logger = logging.getLogger(__name__)


class PlaceNotFoundError(LookupError):
    """The place doesn't exist or belongs to a different manual."""


class TooManyPlacesError(Exception):
    """The manual already has the maximum number of places (-> HTTP 409)."""


async def add_place(
    organization_id: uuid.UUID,
    user_id: uuid.UUID,  # noqa: ARG001 — accepted for audit context
    manual_id: uuid.UUID,
    name: str,
    cuisine: str,
    price_tier: str | None,
    note: str | None,
    map_url: str | None,
) -> WelcomeManualPlaceResponse:
    """Append a place to a manual.

    Raises:
        ManualNotFoundError: scope failure.
        TooManyPlacesError: the manual is already at the place cap.
    """
    async with unit_of_work() as db:
        manual = await welcome_manual_repo.get_by_id(db, manual_id, organization_id)
        if manual is None:
            raise ManualNotFoundError(f"Welcome manual {manual_id} not found")

        existing = await welcome_manual_place_repo.list_by_manual(db, manual.id)
        if len(existing) >= WELCOME_MANUAL_MAX_PLACES:
            raise TooManyPlacesError(
                f"A manual can have at most {WELCOME_MANUAL_MAX_PLACES} places",
            )

        next_order = await welcome_manual_place_repo.next_display_order(db, manual.id)
        place = await welcome_manual_place_repo.create(
            db,
            manual_id=manual.id,
            name=name,
            cuisine=cuisine,
            price_tier=price_tier,
            note=note,
            map_url=map_url,
            display_order=next_order,
        )
        return WelcomeManualPlaceResponse.model_validate(place)


async def update_place(
    organization_id: uuid.UUID,
    user_id: uuid.UUID,  # noqa: ARG001 — accepted for audit context
    manual_id: uuid.UUID,
    place_id: uuid.UUID,
    fields: dict[str, Any],
) -> WelcomeManualPlaceResponse:
    """Update a place's name, cuisine, price_tier, note, map_url, and/or
    display_order."""
    async with unit_of_work() as db:
        manual = await welcome_manual_repo.get_by_id(db, manual_id, organization_id)
        if manual is None:
            raise ManualNotFoundError(f"Welcome manual {manual_id} not found")
        place = await welcome_manual_place_repo.update(db, place_id, manual.id, fields)
        if place is None:
            raise PlaceNotFoundError(f"Place {place_id} not found")
        return WelcomeManualPlaceResponse.model_validate(place)


async def delete_place(
    organization_id: uuid.UUID,
    user_id: uuid.UUID,  # noqa: ARG001 — accepted for audit context
    manual_id: uuid.UUID,
    place_id: uuid.UUID,
) -> None:
    """Delete a place from a manual."""
    async with unit_of_work() as db:
        manual = await welcome_manual_repo.get_by_id(db, manual_id, organization_id)
        if manual is None:
            raise ManualNotFoundError(f"Welcome manual {manual_id} not found")
        deleted = await welcome_manual_place_repo.delete_by_id(db, place_id, manual.id)
        if deleted is None:
            raise PlaceNotFoundError(f"Place {place_id} not found")
