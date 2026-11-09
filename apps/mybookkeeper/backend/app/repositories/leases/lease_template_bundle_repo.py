"""Whole-bundle writes for lease templates, done inside one caller transaction.

A bundle is the template's file rows plus its placeholder rows. Both functions
flush within the caller's transaction and never commit, so the caller decides
when the bundle becomes visible.
"""
from __future__ import annotations

import uuid

from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.repositories.leases import (
    lease_template_file_repo,
    lease_template_placeholder_repo,
    lease_template_repo,
)
from app.repositories.leases.template_write_conflict_error import (
    TemplateWriteConflictError,
)
from app.schemas.leases.new_template_file import NewTemplateFile
from app.schemas.leases.placeholder_spec import PlaceholderSpec


async def insert_bundle(
    db: AsyncSession,
    *,
    template_id: uuid.UUID,
    user_id: uuid.UUID,
    organization_id: uuid.UUID,
    name: str,
    description: str | None,
    files: list[NewTemplateFile],
    placeholders: list[PlaceholderSpec],
) -> None:
    await lease_template_repo.create(
        db,
        template_id=template_id,
        user_id=user_id,
        organization_id=organization_id,
        name=name,
        description=description,
    )
    await lease_template_file_repo.create_many(db, template_id=template_id, files=files)
    await lease_template_placeholder_repo.create_many(
        db, template_id=template_id, specs=placeholders,
    )


async def replace_bundle(
    db: AsyncSession,
    *,
    template_id: uuid.UUID,
    user_id: uuid.UUID,
    organization_id: uuid.UUID,
    files: list[NewTemplateFile],
    placeholders: list[PlaceholderSpec],
) -> list[str]:
    """Replace the template's files and placeholders and bump its version.

    The caller must hold the template row lock (``lease_template_repo.get`` with
    ``for_update=True``) and have read the prior placeholders under it. Returns
    the storage keys of the files that were replaced.
    """
    try:
        old_keys = await lease_template_file_repo.delete_all_for_template(
            db, template_id=template_id,
        )
        await lease_template_placeholder_repo.delete_all_for_template(
            db, template_id=template_id,
        )
        await lease_template_file_repo.create_many(db, template_id=template_id, files=files)
        await lease_template_placeholder_repo.create_many(
            db, template_id=template_id, specs=placeholders,
        )
        await lease_template_repo.bump_version(
            db, template_id=template_id, user_id=user_id, organization_id=organization_id,
        )
    except IntegrityError as exc:
        raise TemplateWriteConflictError(
            "The template was changed by another request"
        ) from exc
    return old_keys
