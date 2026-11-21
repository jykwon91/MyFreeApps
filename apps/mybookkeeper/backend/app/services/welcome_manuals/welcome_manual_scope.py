"""Shared scope check for everything that lives under a section.

org -> manual -> section is the tenancy chain (the section table has no org
column). The section row is locked FOR UPDATE, so adds, uploads, edits, reorders
and deletes of one section's fields and images run one at a time: the cap count,
``next_display_order`` and a reorder see a stable list, and a concurrent delete
can't pull a row out from under an update (a StaleDataError, i.e. a 500).
"""
import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.welcome_manuals.welcome_manual_section import WelcomeManualSection
from app.repositories import welcome_manual_repo, welcome_manual_section_repo


class ManualNotFoundError(LookupError):
    """The parent manual doesn't exist / is soft-deleted / is out of org."""


class RoomNotFoundError(LookupError):
    """The room doesn't exist or belongs to a different manual."""


class SectionNotFoundError(LookupError):
    """The section doesn't exist or belongs to a different manual."""


async def load_section_for_update(
    db: AsyncSession,
    organization_id: uuid.UUID,
    manual_id: uuid.UUID,
    section_id: uuid.UUID,
) -> WelcomeManualSection:
    """Resolve the section (org -> manual -> section) and lock it.

    Raises ManualNotFoundError / SectionNotFoundError.
    """
    return await _load_section(db, organization_id, manual_id, section_id, for_update=True)


async def load_section(
    db: AsyncSession,
    organization_id: uuid.UUID,
    manual_id: uuid.UUID,
    section_id: uuid.UUID,
) -> WelcomeManualSection:
    """Resolve the section without locking it, for a check made before a write.

    Raises ManualNotFoundError / SectionNotFoundError.
    """
    return await _load_section(db, organization_id, manual_id, section_id, for_update=False)


async def find_section_for_outcome_check(
    db: AsyncSession,
    organization_id: uuid.UUID,
    manual_id: uuid.UUID,
    section_id: uuid.UUID,
) -> WelcomeManualSection | None:
    """Lock the section even under a soft-deleted manual; None only if it's gone.

    A soft-deleted manual keeps its sections and their images, so a write that
    committed just before the soft-delete still has rows pointing at its files.
    """
    manual = await welcome_manual_repo.get_by_id(db, manual_id, organization_id, include_deleted=True)
    if manual is None:
        return None
    return await welcome_manual_section_repo.get_by_id(db, section_id, manual.id, for_update=True)


async def _load_section(
    db: AsyncSession,
    organization_id: uuid.UUID,
    manual_id: uuid.UUID,
    section_id: uuid.UUID,
    *,
    for_update: bool,
) -> WelcomeManualSection:
    manual = await welcome_manual_repo.get_by_id(db, manual_id, organization_id)
    if manual is None:
        raise ManualNotFoundError(f"Welcome manual {manual_id} not found")
    section = await welcome_manual_section_repo.get_by_id(db, section_id, manual.id, for_update=for_update)
    if section is None:
        raise SectionNotFoundError(f"Section {section_id} not found")
    return section
