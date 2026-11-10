"""Welcome-manual room service — orchestration for the lettable rooms of a
manual.

A room is a scope, not content: sections point at a room (or at no room, which
means "shared by every room"). Every operation re-verifies the parent manual
belongs to the caller's organization first — the room table carries no org
column, the manual is the scope gate.
"""
import uuid
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.welcome_manual_constants import WELCOME_MANUAL_MAX_ROOMS
from app.db.session import unit_of_work
from app.models.welcome_manuals.welcome_manual import WelcomeManual
from app.repositories import (
    welcome_manual_repo,
    welcome_manual_room_repo,
    welcome_manual_section_image_repo,
    welcome_manual_section_repo,
)
from app.schemas.welcome_manuals.welcome_manual_room_response import (
    WelcomeManualRoomResponse,
)
from app.services.storage.stored_file_cleanup import delete_stored_files
from app.services.welcome_manuals.reorder_check import is_exact_permutation
from app.services.welcome_manuals.welcome_manual_scope import (
    ManualNotFoundError,
    RoomNotFoundError,
)

class TooManyRoomsError(Exception):
    """The manual already has the maximum number of rooms (-> HTTP 409)."""


class InvalidRoomReorderError(Exception):
    """The supplied ``room_ids`` are not a permutation of the manual's current
    rooms (-> HTTP 409: the client's list is stale)."""


async def _load_manual(
    db: AsyncSession, manual_id: uuid.UUID, organization_id: uuid.UUID, *, for_update: bool = False,
) -> WelcomeManual:
    manual = await welcome_manual_repo.get_by_id(
        db, manual_id, organization_id, for_update=for_update,
    )
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
        manual = await _load_manual(db, manual_id, organization_id, for_update=True)

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
        manual = await _load_manual(db, manual_id, organization_id, for_update=True)
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
        manual = await _load_manual(db, manual_id, organization_id, for_update=True)
        room = await welcome_manual_room_repo.get_by_id(db, room_id, manual.id, for_update=True)
        if room is None:
            raise RoomNotFoundError(f"Room {room_id} not found")

        # The FK is ON DELETE CASCADE all the way down (room → sections →
        # images), so the image rows vanish with the room — capture their
        # object keys while they still exist. The room's sections are locked
        # first, so a concurrent image upload waits and then finds no section
        # instead of leaving an orphaned object.
        sections = await welcome_manual_section_repo.lock_by_room(db, manual.id, room.id)
        room_section_ids = [s.id for s in sections]
        images = await welcome_manual_section_image_repo.list_by_section_ids(
            db, room_section_ids,
        )
        storage_keys = [image.storage_key for image in images]

        await welcome_manual_room_repo.delete_by_id(db, room_id, manual.id)

    # Best-effort object-store cleanup outside the transaction — the rows are
    # already gone; anything left behind can be swept later.
    await delete_stored_files(storage_keys)


async def reorder_rooms(
    organization_id: uuid.UUID,
    user_id: uuid.UUID,  # noqa: ARG001 — accepted for audit context
    manual_id: uuid.UUID,
    room_ids: list[uuid.UUID],
) -> list[WelcomeManualRoomResponse]:
    """Reassign ``display_order`` to match the supplied id order.

    ``room_ids`` must be a permutation of the manual's current room ids — a
    partial or unknown set (-> 409) raises InvalidRoomReorderError so the resulting
    order is always unambiguous.
    """
    async with unit_of_work() as db:
        manual = await _load_manual(db, manual_id, organization_id, for_update=True)

        existing = await welcome_manual_room_repo.list_by_manual(db, manual.id)
        if not is_exact_permutation(room_ids, {r.id for r in existing}):
            raise InvalidRoomReorderError(
                "room_ids must be a permutation of the manual's current rooms",
            )

        ordered = await welcome_manual_room_repo.set_display_order(
            db, manual.id, room_ids,
        )
        return [WelcomeManualRoomResponse.model_validate(r) for r in ordered]
