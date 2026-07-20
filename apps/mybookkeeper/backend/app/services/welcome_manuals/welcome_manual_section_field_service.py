"""Welcome-manual section field service — orchestration for the ordered
label + value pairs of a section. Scope is enforced by re-fetching the parent
manual (org-scoped) and the section (manual-scoped) before touching any field.
"""
import logging
import uuid
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.welcome_manual_constants import WELCOME_MANUAL_MAX_FIELDS
from app.db.session import unit_of_work
from app.models.welcome_manuals.welcome_manual_section import WelcomeManualSection
from app.repositories import (
    welcome_manual_repo,
    welcome_manual_section_field_repo,
    welcome_manual_section_repo,
)
from app.schemas.welcome_manuals.welcome_manual_section_field_response import (
    WelcomeManualSectionFieldResponse,
)
from app.services.welcome_manuals.welcome_manual_section_service import (
    ManualNotFoundError,  # noqa: F401 — re-exported for the route
    SectionNotFoundError,  # noqa: F401 — re-exported for the route
)

logger = logging.getLogger(__name__)


class FieldNotFoundError(LookupError):
    """The field doesn't exist or belongs to a different section."""


class TooManyFieldsError(Exception):
    """The section already has the maximum number of fields (-> HTTP 409)."""


async def _load_section(
    db: AsyncSession,
    organization_id: uuid.UUID,
    manual_id: uuid.UUID,
    section_id: uuid.UUID,
) -> WelcomeManualSection:
    """Resolve the section, enforcing org → manual → section scoping. Raises
    ManualNotFoundError / SectionNotFoundError."""
    manual = await welcome_manual_repo.get_by_id(db, manual_id, organization_id)
    if manual is None:
        raise ManualNotFoundError(f"Welcome manual {manual_id} not found")
    section = await welcome_manual_section_repo.get_by_id(db, section_id, manual.id)
    if section is None:
        raise SectionNotFoundError(f"Section {section_id} not found")
    return section


async def add_field(
    organization_id: uuid.UUID,
    user_id: uuid.UUID,  # noqa: ARG001 — accepted for audit context
    manual_id: uuid.UUID,
    section_id: uuid.UUID,
    label: str,
    value: str | None,
) -> WelcomeManualSectionFieldResponse:
    """Append a field to a section.

    Raises:
        ManualNotFoundError / SectionNotFoundError: scope failures.
        TooManyFieldsError: the section is already at the field cap.
    """
    async with unit_of_work() as db:
        section = await _load_section(db, organization_id, manual_id, section_id)

        existing = await welcome_manual_section_field_repo.list_by_section(db, section.id)
        if len(existing) >= WELCOME_MANUAL_MAX_FIELDS:
            raise TooManyFieldsError(
                f"A section can have at most {WELCOME_MANUAL_MAX_FIELDS} fields",
            )

        next_order = await welcome_manual_section_field_repo.next_display_order(db, section.id)
        field = await welcome_manual_section_field_repo.create(
            db,
            section_id=section.id,
            label=label,
            value=value,
            display_order=next_order,
        )
        return WelcomeManualSectionFieldResponse.model_validate(field)


async def update_field(
    organization_id: uuid.UUID,
    user_id: uuid.UUID,  # noqa: ARG001 — accepted for audit context
    manual_id: uuid.UUID,
    section_id: uuid.UUID,
    field_id: uuid.UUID,
    fields: dict[str, Any],
) -> WelcomeManualSectionFieldResponse:
    """Update a field's label, value and/or display_order."""
    async with unit_of_work() as db:
        section = await _load_section(db, organization_id, manual_id, section_id)
        field = await welcome_manual_section_field_repo.update(db, field_id, section.id, fields)
        if field is None:
            raise FieldNotFoundError(f"Field {field_id} not found")
        return WelcomeManualSectionFieldResponse.model_validate(field)


async def delete_field(
    organization_id: uuid.UUID,
    user_id: uuid.UUID,  # noqa: ARG001 — accepted for audit context
    manual_id: uuid.UUID,
    section_id: uuid.UUID,
    field_id: uuid.UUID,
) -> None:
    """Delete a field from a section."""
    async with unit_of_work() as db:
        section = await _load_section(db, organization_id, manual_id, section_id)
        deleted = await welcome_manual_section_field_repo.delete_by_id(db, field_id, section.id)
        if deleted is None:
            raise FieldNotFoundError(f"Field {field_id} not found")
