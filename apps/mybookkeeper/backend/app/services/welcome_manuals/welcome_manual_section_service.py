"""Welcome-manual section service — orchestration for the ordered sections of
a manual. Every operation re-verifies the parent manual belongs to the caller's
organization before touching a section (the section table carries no org column;
the manual is the scope gate).
"""
import uuid
from typing import Any

from app.core.welcome_manual_constants import WELCOME_MANUAL_MAX_SECTIONS
from app.db.session import unit_of_work
from app.repositories import welcome_manual_repo, welcome_manual_section_repo
from app.schemas.welcome_manuals.welcome_manual_section_response import (
    WelcomeManualSectionResponse,
)


class ManualNotFoundError(LookupError):
    """The parent manual doesn't exist / is soft-deleted / is out of org."""


class SectionNotFoundError(LookupError):
    """The section doesn't exist or belongs to a different manual."""


class TooManySectionsError(Exception):
    """The manual already has the maximum number of sections (-> HTTP 409)."""


class InvalidReorderError(Exception):
    """The supplied ``section_ids`` are not a permutation of the manual's
    current sections (-> HTTP 400)."""


async def add_section(
    organization_id: uuid.UUID,
    user_id: uuid.UUID,  # noqa: ARG001 — accepted for audit context
    manual_id: uuid.UUID,
    *,
    title: str,
    body: str | None,
) -> WelcomeManualSectionResponse:
    async with unit_of_work() as db:
        manual = await welcome_manual_repo.get_by_id(db, manual_id, organization_id)
        if manual is None:
            raise ManualNotFoundError(f"Welcome manual {manual_id} not found")

        existing = await welcome_manual_section_repo.list_by_manual(db, manual.id)
        if len(existing) >= WELCOME_MANUAL_MAX_SECTIONS:
            raise TooManySectionsError(
                f"A manual can have at most {WELCOME_MANUAL_MAX_SECTIONS} sections",
            )

        next_order = await welcome_manual_section_repo.next_display_order(db, manual.id)
        section = await welcome_manual_section_repo.create(
            db,
            manual_id=manual.id,
            title=title,
            body=body,
            display_order=next_order,
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
        manual = await welcome_manual_repo.get_by_id(db, manual_id, organization_id)
        if manual is None:
            raise ManualNotFoundError(f"Welcome manual {manual_id} not found")
        section = await welcome_manual_section_repo.update(db, section_id, manual.id, fields)
        if section is None:
            raise SectionNotFoundError(f"Section {section_id} not found")
        return WelcomeManualSectionResponse.model_validate(section)


async def delete_section(
    organization_id: uuid.UUID,
    user_id: uuid.UUID,  # noqa: ARG001 — accepted for audit context
    manual_id: uuid.UUID,
    section_id: uuid.UUID,
) -> None:
    async with unit_of_work() as db:
        manual = await welcome_manual_repo.get_by_id(db, manual_id, organization_id)
        if manual is None:
            raise ManualNotFoundError(f"Welcome manual {manual_id} not found")
        deleted = await welcome_manual_section_repo.delete_by_id(db, section_id, manual.id)
        if deleted is None:
            raise SectionNotFoundError(f"Section {section_id} not found")


async def reorder_sections(
    organization_id: uuid.UUID,
    user_id: uuid.UUID,  # noqa: ARG001 — accepted for audit context
    manual_id: uuid.UUID,
    section_ids: list[uuid.UUID],
) -> list[WelcomeManualSectionResponse]:
    """Reassign ``display_order`` to match the supplied id order.

    ``section_ids`` must be a permutation of the manual's current section ids —
    a partial or unknown set raises InvalidReorderError so the resulting order
    is always unambiguous.
    """
    async with unit_of_work() as db:
        manual = await welcome_manual_repo.get_by_id(db, manual_id, organization_id)
        if manual is None:
            raise ManualNotFoundError(f"Welcome manual {manual_id} not found")

        existing = await welcome_manual_section_repo.list_by_manual(db, manual.id)
        existing_ids = {s.id for s in existing}
        if len(section_ids) != len(existing_ids) or set(section_ids) != existing_ids:
            raise InvalidReorderError(
                "section_ids must be a permutation of the manual's current sections",
            )

        # The section rows are already loaded (and session-tracked) above, so
        # reassign display_order on them directly and flush once — no per-section
        # round trip. Returning them in the requested order avoids a re-SELECT.
        section_by_id = {s.id: s for s in existing}
        for index, section_id in enumerate(section_ids):
            section_by_id[section_id].display_order = index
        await db.flush()

        ordered = [section_by_id[section_id] for section_id in section_ids]
        return [WelcomeManualSectionResponse.model_validate(s) for s in ordered]
