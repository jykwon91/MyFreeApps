"""Welcome-manual section field service — orchestration for the ordered
label + value pairs of a section. Scope is enforced by re-fetching the parent
manual (org-scoped) and the section (manual-scoped) before touching any field.
"""
import logging
import uuid
from typing import Any

from app.core.welcome_manual_constants import TOO_MANY_FIELDS_MESSAGE, WELCOME_MANUAL_MAX_FIELDS
from app.db.session import unit_of_work
from app.repositories import display_order_repo, welcome_manual_section_field_repo
from app.schemas.welcome_manuals.welcome_manual_section_field_response import (
    WelcomeManualSectionFieldResponse,
)
from app.services.welcome_manuals.reorder_check import is_exact_permutation
from app.services.welcome_manuals.welcome_manual_scope import load_section_for_update
from app.services.welcome_manuals.welcome_manual_section_service import (
    ManualNotFoundError,  # noqa: F401 — re-exported for the route
    SectionNotFoundError,  # noqa: F401 — re-exported for the route
)

logger = logging.getLogger(__name__)


class FieldNotFoundError(LookupError):
    """The field doesn't exist or belongs to a different section."""


class InvalidFieldReorderError(Exception):
    """The supplied ids are not exactly the section's current fields (-> HTTP 409)."""


class TooManyFieldsError(Exception):
    """The section already has the maximum number of fields (-> HTTP 409)."""


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
        section = await load_section_for_update(db, organization_id, manual_id, section_id)

        existing = await welcome_manual_section_field_repo.list_by_section(db, section.id)
        if len(existing) >= WELCOME_MANUAL_MAX_FIELDS:
            raise TooManyFieldsError(TOO_MANY_FIELDS_MESSAGE.format(max=WELCOME_MANUAL_MAX_FIELDS))

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
    """Update a field's label and/or value. Position only changes through reorder."""
    async with unit_of_work() as db:
        section = await load_section_for_update(db, organization_id, manual_id, section_id)
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
        section = await load_section_for_update(db, organization_id, manual_id, section_id)
        deleted = await welcome_manual_section_field_repo.delete_by_id(db, field_id, section.id)
        if deleted is None:
            raise FieldNotFoundError(f"Field {field_id} not found")


async def reorder_fields(
    organization_id: uuid.UUID,
    user_id: uuid.UUID,  # noqa: ARG001 — accepted for audit context
    manual_id: uuid.UUID,
    section_id: uuid.UUID,
    field_ids: list[uuid.UUID],
) -> list[WelcomeManualSectionFieldResponse]:
    """Reassign ``display_order`` to match the supplied id order in one write.

    Strict rule: ``field_ids`` must be an exact permutation of the section's
    current field ids. An unknown id, an id of another section, a duplicate or a
    partial list raises InvalidFieldReorderError (-> 409, "your list is stale").
    """
    async with unit_of_work() as db:
        section = await load_section_for_update(db, organization_id, manual_id, section_id)

        existing = await welcome_manual_section_field_repo.list_by_section(db, section.id)
        if not is_exact_permutation(field_ids, {f.id for f in existing}):
            raise InvalidFieldReorderError(
                "field_ids must be a permutation of the section's current fields",
            )
        ordered = await display_order_repo.set_display_orders(db, existing, field_ids)
        return [WelcomeManualSectionFieldResponse.model_validate(field) for field in ordered]
