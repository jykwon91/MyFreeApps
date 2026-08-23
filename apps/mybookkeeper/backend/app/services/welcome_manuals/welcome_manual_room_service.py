"""Welcome-manual room service — orchestration for the lettable rooms of a
manual.

A room is a scope, not content: sections point at a room (or at no room, which
means "shared by every room"). Every operation re-verifies the parent manual
belongs to the caller's organization first — the room table carries no org
column, the manual is the scope gate.
"""
import logging
import uuid
from typing import Any

from app.core.storage import get_storage
from app.core.welcome_manual_constants import WELCOME_MANUAL_MAX_ROOMS
from app.db.session import unit_of_work
from app.repositories import (
    welcome_manual_repo,
    welcome_manual_room_repo,
    welcome_manual_section_image_repo,
    welcome_manual_section_repo,
)
from app.schemas.welcome_manuals.welcome_manual_room_response import (
    WelcomeManualRoomResponse,
)

logger = logging.getLogger(__name__)


class ManualNotFoundError(LookupError):
    """The parent manual doesn't exist / is soft-deleted / is out of org."""


class RoomNotFoundError(LookupError):
    """The room doesn't exist or belongs to a different manual."""


class TooManyRoomsError(Exception):
    """The manual already has the maximum number of rooms (-> HTTP 409)."""


class InvalidRoomReorderError(Exception):
    """The supplied ``room_ids`` are not a permutation of the manual's current
    rooms (-> HTTP 400)."""


async def _load_manual(db, manual_id: uuid.UUID, organization_id: uuid.UUID):
    manual = await welcome_manual_repo.get_by_id(db, manual_id, organization_id)
    if manual is None:
        raise ManualNotFoundError(f"Welcome manual {manual_id} not found")
    return manual


async def list_rooms(
    organization_id: uuid.UUID,
    user_id: uuid.UUID,  # noqa: ARG001 — accepted for audit context
    manual_id: uuid.UUID,
) -> list[WelcomeManualRoomResponse]:
    async with unit_of_work() as db:
        manual = await _load_manual(db, manual_id, organization_id)
        rooms = await welcome_manual_room_repo.list_by_manual(db, manual.id)
        return [WelcomeManualRoomResponse.model_validate(r) for r in rooms]


async def add_room(
    organization_id: uuid.UUID,
    user_id: uuid.UUID,  # noqa: ARG001 — accepted for audit context
    manual_id: uuid.UUID,
    *,
    name: str,
) -> WelcomeManualRoomResponse:
    async with unit_of_work() as db:
        manual = await _load_manual(db, manual_id, organization_id)

        existing = await welcome_manual_room_repo.count_by_manual(db, manual.id)
        if existing >= WELCOME_MANUAL_MAX_ROOMS:
            raise TooManyRoomsError(
                f"A manual can have at most {WELCOME_MANUAL_MAX_ROOMS} rooms",
            )

        next_order = await welcome_manual_room_repo.next_display_order(db, manual.id)
        room = await welcome_manual_room_repo.create(
            db, manual_id=manual.id, name=name, display_order=next_order,
        )
        return WelcomeManualRoomResponse.model_validate(room)


async def update_room(
    organization_id: uuid.UUID,
    user_id: uuid.UUID,  # noqa: ARG001 — accepted for audit context
    manual_id: uuid.UUID,
    room_id: uuid.UUID,
    fields: dict[str, Any],
) -> WelcomeManualRoomResponse:
    async with unit_of_work() as db:
        manual = await _load_manual(db, manual_id, organization_id)
        room = await welcome_manual_room_repo.update(db, room_id, manual.id, fields)
        if room is None:
            raise RoomNotFoundError(f"Room {room_id} not found")
        return WelcomeManualRoomResponse.model_validate(room)


async def delete_room(
    organization_id: uuid.UUID,
    user_id: uuid.UUID,  # noqa: ARG001 — accepted for audit context
    manual_id: uuid.UUID,
    room_id: uuid.UUID,
) -> None:
    """Delete a room and, by cascade, every section scoped to it.

    Shared sections are untouched. The room's sections take their fields and
    images with them, so their storage keys are captured first and swept after
    the transaction commits.
    """
    async with unit_of_work() as db:
        manual = await _load_manual(db, manual_id, organization_id)
        room = await welcome_manual_room_repo.get_by_id(db, room_id, manual.id)
        if room is None:
            raise RoomNotFoundError(f"Room {room_id} not found")

        # The FK is ON DELETE CASCADE all the way down (room → sections →
        # images), so the image rows vanish with the room — capture their
        # object keys while they still exist.
        sections = await welcome_manual_section_repo.list_by_manual(db, manual.id)
        room_section_ids = [s.id for s in sections if s.room_id == room.id]
        images = await welcome_manual_section_image_repo.list_by_section_ids(
            db, room_section_ids,
        )
        storage_keys = [image.storage_key for image in images]

        await welcome_manual_room_repo.delete_by_id(db, room_id, manual.id)

    # Best-effort object-store cleanup outside the transaction — the rows are
    # already gone; anything left behind can be swept later.
    if storage_keys:
        storage = get_storage()
        if storage is not None:
            for key in storage_keys:
                try:
                    storage.delete_file(key)
                except Exception:  # noqa: BLE001
                    logger.warning(
                        "Failed to delete welcome-manual image object %s after room delete",
                        key, exc_info=True,
                    )


async def reorder_rooms(
    organization_id: uuid.UUID,
    user_id: uuid.UUID,  # noqa: ARG001 — accepted for audit context
    manual_id: uuid.UUID,
    room_ids: list[uuid.UUID],
) -> list[WelcomeManualRoomResponse]:
    """Reassign ``display_order`` to match the supplied id order.

    ``room_ids`` must be a permutation of the manual's current room ids — a
    partial or unknown set raises InvalidRoomReorderError so the resulting
    order is always unambiguous.
    """
    async with unit_of_work() as db:
        manual = await _load_manual(db, manual_id, organization_id)

        existing = await welcome_manual_room_repo.list_by_manual(db, manual.id)
        existing_ids = {r.id for r in existing}
        if len(room_ids) != len(existing_ids) or set(room_ids) != existing_ids:
            raise InvalidRoomReorderError(
                "room_ids must be a permutation of the manual's current rooms",
            )

        room_by_id = {r.id: r for r in existing}
        for index, room_id in enumerate(room_ids):
            room_by_id[room_id].display_order = index
        await db.flush()

        ordered = [room_by_id[room_id] for room_id in room_ids]
        return [WelcomeManualRoomResponse.model_validate(r) for r in ordered]
