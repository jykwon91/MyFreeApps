"""Record which template name + version each rendered lease document came from.

Name and version are read together, before the template files and in the same
read as the render, and that pair is what gets stamped: a rename during the
render cannot record a name the documents were never rendered under. A replace
swaps a template's files and bumps its version in one transaction, so if one
commits between the version read and the file read, the version seen at write
time no longer matches and the write is abandoned
(``LeaseChangedDuringRenderError``) rather than recording the wrong version.
"""
from __future__ import annotations

import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.repositories.leases import lease_template_repo, signed_lease_template_repo
from app.services.leases.exceptions.lease_changed_during_render_error import (
    LeaseChangedDuringRenderError,
)


async def read_template_versions(
    db: AsyncSession, *, template_ids: list[uuid.UUID],
) -> dict[uuid.UUID, tuple[str, int]]:
    """Return ``{template_id: (name, version)}``; call before reading the templates' files."""
    templates = await lease_template_repo.list_by_ids(db, template_ids=list(dict.fromkeys(template_ids)))
    return {t.id: (t.name, t.version) for t in templates}


async def record_rendered_templates(
    db: AsyncSession,
    *,
    lease_id: uuid.UUID,
    rendered_versions: dict[uuid.UUID, tuple[str, int]],
) -> None:
    """Stamp each rendered template's name + version, as read before the render, on its lease link.

    Runs under the lease row lock, after the links exist.
    """
    templates = await lease_template_repo.list_by_ids(db, template_ids=list(rendered_versions))
    current_versions = {t.id: t.version for t in templates}
    for template_id, (name, version) in rendered_versions.items():
        if current_versions.get(template_id) != version:
            raise LeaseChangedDuringRenderError(f"Lease {lease_id} changed while rendering")
        await signed_lease_template_repo.record_render_snapshot(
            db,
            lease_id=lease_id,
            template_id=template_id,
            template_name=name,
            template_version=version,
        )
