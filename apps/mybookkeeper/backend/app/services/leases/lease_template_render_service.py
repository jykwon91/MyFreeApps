"""Load template source files for rendering into signed leases.

Handles fetching raw template file bytes from object storage so the
signed-lease PDF pipeline can apply placeholder substitution via
``app.services.leases.renderer``.
"""
from __future__ import annotations

import uuid

from app.core.storage import StorageClient
from app.db.session import unit_of_work
from app.repositories.leases import (
    lease_template_file_repo,
    lease_template_repo,
)
from app.services.leases.lease_template_placeholder_service import (
    TemplateNotFoundError,
)


async def load_template_source_texts(
    *,
    user_id: uuid.UUID,
    organization_id: uuid.UUID,
    template_id: uuid.UUID,
    storage: StorageClient,
) -> list[tuple[str, str, bytes]]:
    """Return ``[(filename, content_type, raw_bytes)]`` in display order."""
    async with unit_of_work() as db:
        template = await lease_template_repo.get(
            db,
            template_id=template_id,
            user_id=user_id,
            organization_id=organization_id,
        )
        if template is None:
            raise TemplateNotFoundError(f"Template {template_id} not found")
        files = await lease_template_file_repo.list_for_template(
            db, template_id=template_id,
        )
    out: list[tuple[str, str, bytes]] = []
    for f in files:
        out.append((f.filename, f.content_type, storage.download_file(f.storage_key)))
    return out
