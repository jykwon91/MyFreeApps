"""Test-only seed and cleanup endpoints for lease templates.

Lives beside ``seed.py`` rather than inside it: that module is already past the
size guard, and lease-template fixtures are a self-contained concern.
"""

import logging
import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from platform_shared.core import async_storage

from app.core.context import RequestContext
from app.core.permissions import current_org_member
from app.core.storage import get_storage
from app.db.session import unit_of_work
from app.repositories.leases import (
    lease_template_file_repo,
    lease_template_placeholder_repo,
    lease_template_repo,
)
from app.services.leases.default_source_map import get_default, guess_display_label
from app.services.leases.placeholder_extractor import extract_placeholder_keys
from app.test_helpers.auth import _require_test_mode

logger = logging.getLogger(__name__)

router = APIRouter()


class _SeedLeaseTemplateRequest(BaseModel):
    name: str = "E2E Lease Template"
    description: str | None = None
    # Source text for placeholder extraction. Defaults to a small sample
    # that exercises the common placeholder set.
    source_text: str = (
        "LEASE AGREEMENT\n\n"
        "This Lease is entered into on [EFFECTIVE DATE] between Landlord and "
        "[TENANT FULL NAME] (\"Tenant\").\n\n"
        "Tenant Email: [TENANT EMAIL]\n"
        "Term: [NUMBER OF DAYS] days, beginning [MOVE-IN DATE] and "
        "ending [MOVE-OUT DATE].\n"
    )


class _SeedLeaseTemplateResponse(BaseModel):
    id: uuid.UUID


@router.post("/test/seed-lease-template", response_model=_SeedLeaseTemplateResponse)
async def seed_lease_template(
    payload: _SeedLeaseTemplateRequest,
    ctx: RequestContext = Depends(current_org_member),
) -> _SeedLeaseTemplateResponse:
    """Test-only direct insert for E2E lease-template seeding.

    Stores ``source_text`` as the template's single markdown file, in object
    storage like a real upload, so endpoints that read the file (suggest
    placeholders, generate) work on a seeded template. It skips the upload
    endpoint's validation; the E2E flow that exercises that uses the real
    ``POST /lease-templates`` endpoint via the UI.
    """
    _require_test_mode()
    content = payload.source_text.encode("utf-8")
    storage = get_storage()
    storage_key: str | None = None
    try:
        async with unit_of_work() as db:
            template = await lease_template_repo.create(
                db,
                user_id=ctx.user_id,
                organization_id=ctx.organization_id,
                name=payload.name,
                description=payload.description,
            )
            storage_key = f"lease-templates/{template.id}/{uuid.uuid4()}"
            await async_storage.upload_file(storage, storage_key, content, "text/markdown")
            await lease_template_file_repo.create(
                db,
                template_id=template.id,
                filename="seed.md",
                storage_key=storage_key,
                content_type="text/markdown",
                size_bytes=len(content),
                display_order=0,
            )
            keys = extract_placeholder_keys(payload.source_text)
            for order, key in enumerate(keys):
                seed = get_default(key)
                await lease_template_placeholder_repo.create(
                    db,
                    template_id=template.id,
                    key=key,
                    display_label=guess_display_label(key),
                    input_type=seed.input_type,
                    required=True,
                    default_source=seed.default_source,
                    computed_expr=seed.computed_expr,
                    display_order=order,
                )
            template_id = template.id
    except Exception:
        # Don't leave an orphan object if the database write fails.
        if storage_key is not None:
            try:
                await async_storage.delete_file(storage, storage_key)
            except Exception:  # noqa: BLE001
                logger.warning("Failed to delete orphan seeded template file %s", storage_key)
        raise
    return _SeedLeaseTemplateResponse(id=template_id)


@router.delete("/test/lease-templates/{template_id}", status_code=204)
async def hard_delete_lease_template(
    template_id: uuid.UUID,
    ctx: RequestContext = Depends(current_org_member),
) -> None:
    """Hard-delete a lease template (cascades files / placeholders). Test-only.

    404 when nothing was deleted, so a cleanup that misses fails loudly.
    """
    _require_test_mode()
    async with unit_of_work() as db:
        files = await lease_template_file_repo.list_for_template(db, template_id=template_id)
        deleted = await lease_template_repo.hard_delete_by_id(
            db,
            template_id=template_id,
            user_id=ctx.user_id,
            organization_id=ctx.organization_id,
        )
    if not deleted:
        raise HTTPException(status_code=404, detail="Lease template not found")
    storage = get_storage()
    for f in files:
        try:
            await async_storage.delete_file(storage, f.storage_key)
        except Exception:  # noqa: BLE001
            logger.warning("Failed to delete seeded template file %s", f.storage_key)
