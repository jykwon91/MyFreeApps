"""Welcome-manual service — orchestration only (load → decide → persist).

Tenant isolation is via ``organization_id``; ``user_id`` is accepted for the
audit-log context and recorded as the manual's owner on create. Section CRUD
lives in ``welcome_manual_section_service``.
"""
import uuid

from app.core.welcome_manual_constants import DEFAULT_WELCOME_MANUAL_SECTIONS
from app.db.session import AsyncSessionLocal, unit_of_work
from app.repositories import (
    property_repo,
    welcome_manual_repo,
    welcome_manual_section_image_repo,
    welcome_manual_section_repo,
)
from app.schemas.welcome_manuals.welcome_manual_create_request import (
    WelcomeManualCreateRequest,
)
from app.schemas.welcome_manuals.welcome_manual_list_response import (
    WelcomeManualListResponse,
)
from app.schemas.welcome_manuals.welcome_manual_response import WelcomeManualResponse
from app.schemas.welcome_manuals.welcome_manual_section_image_response import (
    WelcomeManualSectionImageResponse,
)
from app.schemas.welcome_manuals.welcome_manual_section_response import (
    WelcomeManualSectionResponse,
)
from app.schemas.welcome_manuals.welcome_manual_summary import WelcomeManualSummary
from app.schemas.welcome_manuals.welcome_manual_update_request import (
    WelcomeManualUpdateRequest,
)
from app.services.welcome_manuals.section_image_response_builder import (
    attach_presigned_urls,
)


def _build_section_responses(sections, images) -> list[WelcomeManualSectionResponse]:
    """Build ordered section responses with each section's images attached.

    ``images`` is a flat list of ORM image rows spanning ALL the sections;
    presigned URLs are minted once over the flat list (one HEAD per image),
    then grouped by section. No SQLAlchemy ``images`` relationship exists on the
    section model — ``model_validate`` falls back to the field default, and we
    overwrite it here — which keeps this safe under async (no lazy load).
    """
    image_responses = [WelcomeManualSectionImageResponse.model_validate(img) for img in images]
    signed = attach_presigned_urls(image_responses)
    by_section: dict[uuid.UUID, list[WelcomeManualSectionImageResponse]] = {}
    for image in signed:
        by_section.setdefault(image.section_id, []).append(image)
    return [
        WelcomeManualSectionResponse.model_validate(s).model_copy(
            update={"images": by_section.get(s.id, [])},
        )
        for s in sections
    ]


def _to_response(manual, section_responses=()) -> WelcomeManualResponse:
    """Convert an ORM manual + pre-built section responses to a response model.

    Centralising this construction prevents drift between get / create /
    update response shapes.
    """
    base = WelcomeManualResponse.model_validate(manual)
    return base.model_copy(update={"sections": list(section_responses)})


async def get_manual(
    organization_id: uuid.UUID,
    user_id: uuid.UUID,  # noqa: ARG001 — accepted for audit context
    manual_id: uuid.UUID,
) -> WelcomeManualResponse:
    """Load a single manual with its sections.

    Raises LookupError if the manual does not exist, is soft-deleted, or
    belongs to a different organization.
    """
    async with AsyncSessionLocal() as db:
        manual = await welcome_manual_repo.get_by_id(db, manual_id, organization_id)
        if manual is None:
            raise LookupError(f"Welcome manual {manual_id} not found")
        sections = await welcome_manual_section_repo.list_by_manual(db, manual.id)
        images = await welcome_manual_section_image_repo.list_by_section_ids(
            db, [s.id for s in sections],
        )
    return _to_response(manual, _build_section_responses(sections, images))


async def list_manuals(
    organization_id: uuid.UUID,
    user_id: uuid.UUID,  # noqa: ARG001 — accepted for audit context
    *,
    limit: int = 50,
    offset: int = 0,
) -> WelcomeManualListResponse:
    """List active (non-deleted) manuals for an organization."""
    async with AsyncSessionLocal() as db:
        manuals = await welcome_manual_repo.list_by_organization(
            db, organization_id, limit=limit, offset=offset,
        )
        total = await welcome_manual_repo.count_by_organization(db, organization_id)
        counts = await welcome_manual_section_repo.counts_by_manual_ids(
            db, [m.id for m in manuals],
        )
    items = [
        WelcomeManualSummary(
            id=m.id,
            title=m.title,
            property_id=m.property_id,
            section_count=counts.get(m.id, 0),
            created_at=m.created_at,
            updated_at=m.updated_at,
        )
        for m in manuals
    ]
    has_more = (offset + len(items)) < total
    return WelcomeManualListResponse(items=items, total=total, has_more=has_more)


async def create_manual(
    organization_id: uuid.UUID,
    user_id: uuid.UUID,
    payload: WelcomeManualCreateRequest,
) -> WelcomeManualResponse:
    """Create a new manual scoped to the caller's organization.

    If ``property_id`` is supplied, verifies it belongs to the same org before
    insert. When ``seed_default_sections`` is True, pre-seeds the stub sections.

    Raises LookupError if ``property_id`` is not in the caller's org.
    """
    async with unit_of_work() as db:
        if payload.property_id is not None:
            prop = await property_repo.get_by_id(db, payload.property_id, organization_id)
            if prop is None:
                raise LookupError(f"Property {payload.property_id} not found")

        manual = await welcome_manual_repo.create_manual(
            db,
            organization_id=organization_id,
            user_id=user_id,
            property_id=payload.property_id,
            title=payload.title,
            intro_text=payload.intro_text,
        )

        sections = []
        if payload.seed_default_sections:
            for index, title in enumerate(DEFAULT_WELCOME_MANUAL_SECTIONS):
                section = await welcome_manual_section_repo.create(
                    db,
                    manual_id=manual.id,
                    title=title,
                    body=None,
                    display_order=index,
                )
                sections.append(section)

        # Freshly-seeded sections never have images yet.
        return _to_response(manual, _build_section_responses(sections, []))


async def update_manual(
    organization_id: uuid.UUID,
    user_id: uuid.UUID,  # noqa: ARG001 — accepted for audit context
    manual_id: uuid.UUID,
    payload: WelcomeManualUpdateRequest,
) -> WelcomeManualResponse:
    """Apply allowlisted updates to a manual.

    Raises LookupError if the manual does not exist / is soft-deleted /
    belongs to a different org, or if the update re-tags it to a property
    outside the caller's organization.
    """
    fields = payload.to_update_dict()

    async with unit_of_work() as db:
        new_property_id = fields.get("property_id")
        if new_property_id is not None:
            prop = await property_repo.get_by_id(db, new_property_id, organization_id)
            if prop is None:
                raise LookupError(f"Property {new_property_id} not found")

        manual = await welcome_manual_repo.update_manual(
            db, manual_id, organization_id, fields,
        )
        if manual is None:
            raise LookupError(f"Welcome manual {manual_id} not found")

        sections = await welcome_manual_section_repo.list_by_manual(db, manual.id)
        images = await welcome_manual_section_image_repo.list_by_section_ids(
            db, [s.id for s in sections],
        )
        return _to_response(manual, _build_section_responses(sections, images))


async def soft_delete_manual(
    organization_id: uuid.UUID,
    user_id: uuid.UUID,  # noqa: ARG001 — accepted for audit context
    manual_id: uuid.UUID,
) -> None:
    """Soft-delete a manual scoped to the caller's organization.

    Raises LookupError if no row was updated (missing, already deleted, or
    in a different org).
    """
    async with unit_of_work() as db:
        deleted = await welcome_manual_repo.soft_delete_by_id(db, manual_id, organization_id)
    if not deleted:
        raise LookupError(f"Welcome manual {manual_id} not found")
