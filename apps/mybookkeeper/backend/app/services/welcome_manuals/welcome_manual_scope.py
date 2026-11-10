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
    manual = await welcome_manual_repo.get_by_id(db, manual_id, organization_id)
    if manual is None:
        raise ManualNotFoundError(f"Welcome manual {manual_id} not found")
    section = await welcome_manual_section_repo.get_by_id(db, section_id, manual.id, for_update=True)
    if section is None:
        raise SectionNotFoundError(f"Section {section_id} not found")
    return section
