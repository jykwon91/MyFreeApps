"""Welcome-manual section image upload pipeline.

Mirrors listing_photo_service: size check → content sniff → allowlist →
EXIF strip → storage put → repo insert. Scope is enforced by re-fetching the
parent manual (org-scoped) and the section (manual-scoped) before touching any
image. EXIF stripping is mandatory — a host's GPS coordinates must never reach
the bucket (see image_processor).
"""
import asyncio
import logging
import uuid
from typing import Any

from platform_shared.core.storage import StorageNotConfiguredError  # noqa: F401 — re-exported for the route

from app.core.storage import get_storage
from app.core.welcome_manual_constants import (
    TOO_MANY_IMAGES_MESSAGE,
    WELCOME_MANUAL_MAX_SECTION_IMAGES,
    WELCOME_MANUAL_STORAGE_DOMAIN,
)
from app.db.session import unit_of_work
from app.repositories import display_order_repo, welcome_manual_section_image_repo
from app.schemas.welcome_manuals.welcome_manual_section_image_response import (
    WelcomeManualSectionImageResponse,
)
from app.services.storage.image_processor import (
    ImageRejected,  # noqa: F401 — re-exported for the route
    filename_for_content_type,
    process_image,
)
from app.services.welcome_manuals.section_image_response_builder import (
    attach_presigned_urls,
)
from app.services.welcome_manuals.reorder_check import is_exact_permutation
from app.services.welcome_manuals.welcome_manual_scope import load_section_for_update
from app.services.welcome_manuals.welcome_manual_section_service import (
    ManualNotFoundError,
    SectionNotFoundError,
)

logger = logging.getLogger(__name__)


class ImageNotFoundError(LookupError):
    """The image doesn't exist or belongs to a different section."""


class InvalidImageReorderError(Exception):
    """The supplied ids are not exactly the section's current images (-> HTTP 409)."""


class TooManyImagesError(Exception):
    """The upload would take the section past its photo cap (-> HTTP 409)."""


async def upload_images(
    organization_id: uuid.UUID,
    user_id: uuid.UUID,  # noqa: ARG001 — accepted for audit context
    manual_id: uuid.UUID,
    section_id: uuid.UUID,
    files: list[tuple[bytes, str | None, str | None]],
) -> list[WelcomeManualSectionImageResponse]:
    """Validate and persist a batch of section-image uploads.

    Each file is `(content, filename, declared_content_type)`. Every image is
    EXIF-stripped and re-encoded before storage. A single bad file aborts the
    whole batch (no partial persist).

    Raises:
        ManualNotFoundError / SectionNotFoundError: scope failures.
        TooManyImagesError: the batch would pass the section's photo cap.
        StorageNotConfiguredError: object storage unavailable.
        ImageRejected: any file fails size / format / decode validation.
    """
    if not files:
        return []

    storage = get_storage()
    if storage is None:
        raise StorageNotConfiguredError("Object storage is not configured")

    # Pre-validate every file before touching storage so one bad file doesn't
    # leave half a batch persisted.
    processed: list[tuple[bytes, str, str]] = []
    for content, filename, declared in files:
        result = await asyncio.to_thread(process_image, content, declared_content_type=declared)
        safe_name = filename_for_content_type(
            filename or f"image-{uuid.uuid4().hex}", result.content_type,
        )
        processed.append((result.content, result.content_type, safe_name))

    async with unit_of_work() as db:
        section = await load_section_for_update(db, organization_id, manual_id, section_id)

        existing = await welcome_manual_section_image_repo.list_by_section(db, section.id)
        if len(existing) + len(processed) > WELCOME_MANUAL_MAX_SECTION_IMAGES:
            raise TooManyImagesError(TOO_MANY_IMAGES_MESSAGE.format(max=WELCOME_MANUAL_MAX_SECTION_IMAGES))

        next_order = await welcome_manual_section_image_repo.next_display_order(db, section.id)
        prefix = f"{organization_id}/{WELCOME_MANUAL_STORAGE_DOMAIN}"
        created: list[Any] = []
        for index, (clean_bytes, content_type, safe_name) in enumerate(processed):
            storage_key = storage.generate_key(prefix, safe_name)
            # Upload BEFORE the DB insert so a storage failure rolls back the
            # transaction cleanly. On DB-insert failure after a successful
            # upload, best-effort delete the orphan object.
            storage.upload_file(storage_key, clean_bytes, content_type)
            try:
                image = await welcome_manual_section_image_repo.create(
                    db,
                    section_id=section.id,
                    storage_key=storage_key,
                    caption=None,
                    display_order=next_order + index,
                )
            except Exception:
                try:
                    storage.delete_file(storage_key)
                except Exception:  # noqa: BLE001
                    logger.warning(
                        "Failed to delete orphan welcome-manual image %s after DB error",
                        storage_key, exc_info=True,
                    )
                raise
            created.append(image)

        responses = [WelcomeManualSectionImageResponse.model_validate(i) for i in created]
        return attach_presigned_urls(responses)


async def update_image(
    organization_id: uuid.UUID,
    user_id: uuid.UUID,  # noqa: ARG001 — accepted for audit context
    manual_id: uuid.UUID,
    section_id: uuid.UUID,
    image_id: uuid.UUID,
    fields: dict[str, Any],
) -> WelcomeManualSectionImageResponse:
    """Update an image's caption. Position only changes through reorder."""
    async with unit_of_work() as db:
        section = await load_section_for_update(db, organization_id, manual_id, section_id)
        image = await welcome_manual_section_image_repo.update(db, image_id, section.id, fields)
        if image is None:
            raise ImageNotFoundError(f"Image {image_id} not found")
        response = WelcomeManualSectionImageResponse.model_validate(image)
        return attach_presigned_urls([response])[0]


async def reorder_images(
    organization_id: uuid.UUID,
    user_id: uuid.UUID,  # noqa: ARG001 — accepted for audit context
    manual_id: uuid.UUID,
    section_id: uuid.UUID,
    image_ids: list[uuid.UUID],
) -> list[WelcomeManualSectionImageResponse]:
    """Reassign ``display_order`` to match the supplied id order in one write.

    Strict rule: ``image_ids`` must be an exact permutation of the section's
    current image ids. An unknown id, an id of another section, a duplicate or a
    partial list raises InvalidImageReorderError (-> 409, "your list is stale").
    """
    async with unit_of_work() as db:
        section = await load_section_for_update(db, organization_id, manual_id, section_id)

        existing = await welcome_manual_section_image_repo.list_by_section(db, section.id)
        if not is_exact_permutation(image_ids, {i.id for i in existing}):
            raise InvalidImageReorderError(
                "image_ids must be a permutation of the section's current images",
            )
        ordered = await display_order_repo.set_display_orders(db, existing, image_ids)
        return attach_presigned_urls([WelcomeManualSectionImageResponse.model_validate(i) for i in ordered])


async def delete_image(
    organization_id: uuid.UUID,
    user_id: uuid.UUID,  # noqa: ARG001 — accepted for audit context
    manual_id: uuid.UUID,
    section_id: uuid.UUID,
    image_id: uuid.UUID,
) -> None:
    """Delete an image from both the DB and object storage."""
    async with unit_of_work() as db:
        section = await load_section_for_update(db, organization_id, manual_id, section_id)
        deleted = await welcome_manual_section_image_repo.delete_by_id(db, image_id, section.id)
        if deleted is None:
            raise ImageNotFoundError(f"Image {image_id} not found")
        storage_key = deleted.storage_key

    # Storage cleanup outside the unit_of_work — the row is already gone; the
    # user expects the image removed immediately, and orphans can be swept later.
    storage = get_storage()
    if storage is not None:
        try:
            storage.delete_file(storage_key)
        except Exception:  # noqa: BLE001
            logger.warning(
                "Failed to delete welcome-manual image object %s from storage",
                storage_key, exc_info=True,
            )
