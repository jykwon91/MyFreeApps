"""Welcome-manual section service — orchestration for the ordered sections of
a manual. Every operation re-verifies the parent manual belongs to the caller's
organization before touching a section (the section table carries no org column;
the manual is the scope gate).
"""
import logging
import uuid
from typing import Any

from app.core.storage import get_storage
from app.core.welcome_manual_constants import TOO_MANY_SECTIONS_MESSAGE, WELCOME_MANUAL_MAX_SECTIONS
from app.db.session import unit_of_work
from app.repositories import (
    display_order_repo,
    welcome_manual_repo,
    welcome_manual_room_repo,
    welcome_manual_section_image_repo,
    welcome_manual_section_repo,
)
from app.schemas.welcome_manuals.welcome_manual_section_response import (
    WelcomeManualSectionResponse,
)
from app.services.welcome_manuals.reorder_check import is_exact_permutation
from app.services.welcome_manuals.welcome_manual_scope import (
    ManualNotFoundError,
    SectionNotFoundError,
    load_section_for_update,
)

logger = logging.getLogger(__name__)


class TooManySectionsError(Exception):
    """The manual already has the maximum number of sections (-> HTTP 409)."""


class InvalidReorderError(Exception):
    """The supplied ``section_ids`` are not a permutation of the manual's
    current sections (-> HTTP 409: the client's list is stale)."""


class RoomNotFoundError(LookupError):
    """The requested room scope doesn't exist on this manual."""


async def _verify_room_scope(db, manual_id: uuid.UUID, room_id: uuid.UUID | None) -> None:
    """Reject a section scoped to a room that isn't this manual's.

    ``room_id`` is in the repo's updatable allowlist, so without this a caller
    could point one of their sections at another organization's room id.
    """
    if room_id is None:
        return
    room = await welcome_manual_room_repo.get_by_id(db, room_id, manual_id)
    if room is None:
        raise RoomNotFoundError(f"Room {room_id} not found")


async def add_section(
    organization_id: uuid.UUID,
    user_id: uuid.UUID,  # noqa: ARG001 — accepted for audit context
    manual_id: uuid.UUID,
    *,
    title: str,
    body: str | None,
    room_id: uuid.UUID | None = None,
) -> WelcomeManualSectionResponse:
    async with unit_of_work() as db:
        manual = await welcome_manual_repo.get_by_id(db, manual_id, organization_id, for_update=True)
        if manual is None:
            raise ManualNotFoundError(f"Welcome manual {manual_id} not found")
        await _verify_room_scope(db, manual.id, room_id)

        existing = await welcome_manual_section_repo.list_by_manual(db, manual.id)
        if len(existing) >= WELCOME_MANUAL_MAX_SECTIONS:
            raise TooManySectionsError(TOO_MANY_SECTIONS_MESSAGE.format(max=WELCOME_MANUAL_MAX_SECTIONS))

        next_order = await welcome_manual_section_repo.next_display_order(db, manual.id)
        section = await welcome_manual_section_repo.create(
            db,
            manual_id=manual.id,
            title=title,
            body=body,
            display_order=next_order,
            room_id=room_id,
        )
        return WelcomeManualSectionResponse.model_validate(section)


async def update_section(
    organization_id: uuid.UUID,
    user_id: uuid.UUID,  # noqa: ARG001 — accepted for audit context
    manual_id: uuid.UUID,
    section_id: uuid.UUID,
    fields: dict[str, Any],
) -> WelcomeManualSectionResponse:
    async with unit_of_work() as db:
        section = await load_section_for_update(db, organization_id, manual_id, section_id)
        if "room_id" in fields:
            await _verify_room_scope(db, section.manual_id, fields["room_id"])
        await welcome_manual_section_repo.apply_update(db, section, fields)
        return WelcomeManualSectionResponse.model_validate(section)


async def delete_section(
    organization_id: uuid.UUID,
    user_id: uuid.UUID,  # noqa: ARG001 — accepted for audit context
    manual_id: uuid.UUID,
    section_id: uuid.UUID,
) -> None:
    async with unit_of_work() as db:
        manual = await welcome_manual_repo.get_by_id(db, manual_id, organization_id, for_update=True)
        if manual is None:
            raise ManualNotFoundError(f"Welcome manual {manual_id} not found")
        section = await welcome_manual_section_repo.get_by_id(db, section_id, manual.id, for_update=True)
        if section is None:
            raise SectionNotFoundError(f"Section {section_id} not found")
        # Capture image storage keys before the cascade removes the rows.
        images = await welcome_manual_section_image_repo.list_by_section(db, section.id)
        storage_keys = [image.storage_key for image in images]
        await welcome_manual_section_repo.delete_by_id(db, section_id, manual.id)

    # Best-effort MinIO cleanup outside the transaction — the section (and its
    # image rows) are already gone; orphaned objects can be swept later.
    if storage_keys:
        storage = get_storage()
        if storage is not None:
            for key in storage_keys:
                try:
                    storage.delete_file(key)
                except Exception:  # noqa: BLE001
                    logger.warning(
                        "Failed to delete welcome-manual image object %s after section delete",
                        key, exc_info=True,
                    )


async def reorder_sections(
    organization_id: uuid.UUID,
    user_id: uuid.UUID,  # noqa: ARG001 — accepted for audit context
    manual_id: uuid.UUID,
    section_ids: list[uuid.UUID],
) -> list[WelcomeManualSectionResponse]:
    """Reassign ``display_order`` to match the supplied id order in one write.

    Strict rule: ``section_ids`` must be an exact permutation of the manual's
    current section ids. An unknown id, an id of another manual, a duplicate or a
    partial list raises InvalidReorderError (-> 409, "your list is stale").
    """
    async with unit_of_work() as db:
        manual = await welcome_manual_repo.get_by_id(db, manual_id, organization_id, for_update=True)
        if manual is None:
            raise ManualNotFoundError(f"Welcome manual {manual_id} not found")

        existing = await welcome_manual_section_repo.list_by_manual(db, manual.id)
        if not is_exact_permutation(section_ids, {s.id for s in existing}):
            raise InvalidReorderError(
                "section_ids must be a permutation of the manual's current sections",
            )
        ordered = await display_order_repo.set_display_orders(db, existing, section_ids)
        return [WelcomeManualSectionResponse.model_validate(s) for s in ordered]
