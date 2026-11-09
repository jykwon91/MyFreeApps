"""Atomic writes for lease-template file bundles (upload and replace).

Order of operations, for both paths:

1. Validate and read every file (count, type, size, readable text, placeholder
   keys) — no writes.
2. Upload the new objects to storage. If one fails, delete the ones already
   uploaded and write nothing.
3. Write every database row in ONE transaction (``LeaseTemplateWriteGuard``
   removes the new objects if it fails).
4. Replace only: delete the old objects after the commit succeeded.

Storage and DOCX parsing block, so they run off the event loop.
"""
from __future__ import annotations

import asyncio
import logging
import uuid

from app.core.commit_outcome_constants import OUTCOME_CHECK_LOCK_TIMEOUT_MS
from app.core.config import settings
from app.core.lease_template_constants import (
    MAX_LEASE_TEMPLATE_FILES,
    STORAGE_UNAVAILABLE_MESSAGE,
)
from app.core.storage import StorageClient, get_storage
from app.db.session import unit_of_work
from app.repositories import lock_timeout_repo
from app.repositories.leases import (
    lease_template_bundle_repo,
    lease_template_file_repo,
    lease_template_placeholder_repo,
    lease_template_repo,
)
from app.repositories.leases.template_write_conflict_error import (
    TemplateWriteConflictError,
)
from app.schemas.leases.lease_template_response import LeaseTemplateResponse
from app.schemas.leases.new_template_file import NewTemplateFile
from app.schemas.leases.placeholder_spec import PlaceholderSpec
from app.schemas.leases.template_upload_file import TemplateUploadFile
from app.schemas.leases.validated_template_file import ValidatedTemplateFile
from app.services.leases.default_source_map import get_default, guess_display_label
from app.services.leases.lease_template_placeholder_service import TemplateNotFoundError
from app.services.leases.exceptions.template_no_files_error import TemplateNoFilesError
from app.services.leases.exceptions.template_storage_unavailable_error import (
    TemplateStorageUnavailableError,
)
from app.services.leases.exceptions.template_too_many_files_error import (
    TemplateTooManyFilesError,
)
from app.services.leases.lease_template_service import (
    ALLOWED_TEMPLATE_MIME_TYPES,
    TemplateFileTooLargeError,
    TemplateFileTypeRejectedError,
    get_template,
    normalise_content_type,
)
from app.services.leases.lease_template_text_reader import read_template_text
from app.services.leases.placeholder_extractor import (
    extract_placeholders_across_files,
)
from app.services.storage.committed_write_guard import CommittedWriteGuard, RowsPresent
from app.services.storage.stored_file_cleanup import discard_after_in_flight

logger = logging.getLogger(__name__)

__all__ = [
    "TemplateUploadFile",
    "TemplateWriteConflictError",
    "check_declared_size",
    "check_file_count",
    "replace_template_files",
    "upload_template",
]


def check_file_count(count: int) -> None:
    """Reject a bundle with no files or too many (callable before reading bodies)."""
    if count == 0:
        raise TemplateNoFilesError("At least one file is required")
    if count > MAX_LEASE_TEMPLATE_FILES:
        raise TemplateTooManyFilesError(
            f"A template can have at most {MAX_LEASE_TEMPLATE_FILES} files"
        )


def _size_limit_label() -> str:
    return f"{settings.max_lease_template_file_size_bytes / (1024 * 1024):g}MB"


def check_declared_size(filename: str, size: int | None) -> None:
    """Reject a file whose declared size is over the limit (before reading it).

    ``size`` can be missing or wrong, so the bytes are checked again once read.
    """
    if size is not None and size > settings.max_lease_template_file_size_bytes:
        raise TemplateFileTooLargeError(f"{filename} exceeds {_size_limit_label()} limit")


async def _validate_bundle(files: list[TemplateUploadFile]) -> list[ValidatedTemplateFile]:
    """Check every file before anything is written; raises on the first bad one."""
    check_file_count(len(files))
    validated: list[ValidatedTemplateFile] = []
    for filename, content, declared in files:
        check_declared_size(filename, len(content))
        content_type = normalise_content_type(declared, filename)
        if content_type not in ALLOWED_TEMPLATE_MIME_TYPES:
            raise TemplateFileTypeRejectedError(
                f"{filename}: unsupported file type ({content_type}). "
                "Allowed: .md, .txt, .docx"
            )
        text = await asyncio.to_thread(read_template_text, filename, content, content_type)
        validated.append(ValidatedTemplateFile(filename, content, content_type, text))
    return validated


def _derive_placeholders(
    keys: list[str], prior: list[PlaceholderSpec],
) -> list[PlaceholderSpec]:
    """One spec per key. Surviving keys keep every host edit, including order;
    new keys follow after the highest surviving position."""
    prior_by_key = {p.key: p for p in prior}
    next_order = max((p.display_order for p in prior if p.key in keys), default=-1) + 1
    specs: list[PlaceholderSpec] = []
    for key in keys:
        kept = prior_by_key.get(key)
        if kept is not None:
            specs.append(kept)
            continue
        seed = get_default(key)
        specs.append(
            PlaceholderSpec(
                key=key,
                display_label=guess_display_label(key),
                input_type=seed.input_type,
                required=True,
                default_source=seed.default_source,
                computed_expr=seed.computed_expr,
                display_order=next_order,
            )
        )
        next_order += 1
    return specs


async def _upload_one(
    storage: StorageClient, key: str, file: ValidatedTemplateFile,
) -> None:
    await asyncio.to_thread(storage.upload_file, key, file.content, file.content_type)


async def _upload_objects(
    storage: StorageClient, template_id: uuid.UUID, files: list[ValidatedTemplateFile],
) -> list[str]:
    """Upload every file. On any failure, including cancellation, remove what was
    uploaded plus the key being uploaded (recorded first, since a cancelled
    request leaves its worker thread running)."""
    keys: list[str] = []
    in_flight: asyncio.Future[None] | None = None
    try:
        for file in files:
            key = f"lease-templates/{template_id}/{uuid.uuid4()}"
            keys.append(key)
            in_flight = asyncio.ensure_future(_upload_one(storage, key, file))
            await asyncio.shield(in_flight)
            in_flight = None
    except BaseException as exc:
        await asyncio.shield(discard_after_in_flight(keys, in_flight))
        if isinstance(exc, Exception):
            logger.error("Storage failed while uploading template files", exc_info=True)
            raise TemplateStorageUnavailableError(STORAGE_UNAVAILABLE_MESSAGE) from exc
        raise
    return keys


def _template_rows_present_check(
    template_id: uuid.UUID, user_id: uuid.UUID, organization_id: uuid.UUID, keys: list[str],
) -> RowsPresent:
    """A check that some of ``keys`` are recorded for the template.

    Takes the template row lock first (bounded by a lock timeout), which waits
    for the original transaction to finish; a timeout or any error leaves the
    outcome unknown.
    """

    async def rows_present() -> bool:
        async with unit_of_work() as db:
            await lock_timeout_repo.set_local_lock_timeout(db, OUTCOME_CHECK_LOCK_TIMEOUT_MS)
            await lease_template_repo.get(
                db,
                template_id=template_id,
                user_id=user_id,
                organization_id=organization_id,
                include_deleted=True,
                for_update=True,
            )
            rows = await lease_template_file_repo.list_for_template(db, template_id=template_id)
        return bool({r.storage_key for r in rows} & set(keys))

    return rows_present


def _new_template_rows_present_check(template_id: uuid.UUID, keys: list[str]) -> RowsPresent:
    """A plain read for a template that is being created.

    There is no existing row to lock, so a read can run before an in-flight
    COMMIT is visible; the guard is told absence is inconclusive.
    """

    async def rows_present() -> bool:
        async with unit_of_work() as db:
            rows = await lease_template_file_repo.list_for_template(db, template_id=template_id)
        return bool({r.storage_key for r in rows} & set(keys))

    return rows_present


def _new_file_rows(
    files: list[ValidatedTemplateFile], keys: list[str],
) -> list[NewTemplateFile]:
    return [
        NewTemplateFile(f.filename, key, f.content_type, len(f.content))
        for f, key in zip(files, keys, strict=True)
    ]


async def upload_template(
    *,
    user_id: uuid.UUID,
    organization_id: uuid.UUID,
    name: str,
    description: str | None,
    files: list[TemplateUploadFile],
) -> LeaseTemplateResponse:
    """Create a template from a bundle, all-or-nothing."""
    storage = get_storage()
    validated = await _validate_bundle(files)
    placeholder_keys = extract_placeholders_across_files([f.text for f in validated])

    template_id = uuid.uuid4()
    keys = await _upload_objects(storage, template_id, validated)
    async with CommittedWriteGuard(
        keys, _new_template_rows_present_check(template_id, keys), absence_conclusive=False,
    ) as guard:
        async with unit_of_work() as db:
            await lease_template_bundle_repo.insert_bundle(
                db,
                template_id=template_id,
                user_id=user_id,
                organization_id=organization_id,
                name=name,
                description=description,
                files=_new_file_rows(validated, keys),
                placeholders=_derive_placeholders(placeholder_keys, []),
            )
            guard.rows_written()

    return await get_template(
        user_id=user_id, organization_id=organization_id, template_id=template_id,
    )


async def replace_template_files(
    *,
    user_id: uuid.UUID,
    organization_id: uuid.UUID,
    template_id: uuid.UUID,
    files: list[TemplateUploadFile],
) -> LeaseTemplateResponse:
    """Swap a template's files for a new bundle (bumps version), all-or-nothing.

    The template row is locked for the swap, so concurrent replaces run one
    after the other. Old objects are deleted only after the new rows have
    committed; host edits to placeholders whose keys survive are preserved.
    """
    storage = get_storage()
    async with unit_of_work() as db:
        template = await lease_template_repo.get(
            db, template_id=template_id, user_id=user_id, organization_id=organization_id,
        )
        if template is None:
            raise TemplateNotFoundError(f"Template {template_id} not found")
    validated = await _validate_bundle(files)
    placeholder_keys = extract_placeholders_across_files([f.text for f in validated])

    new_keys = await _upload_objects(storage, template_id, validated)
    async with CommittedWriteGuard(
        new_keys,
        _template_rows_present_check(template_id, user_id, organization_id, new_keys),
    ) as guard:
        async with unit_of_work() as db:
            # Lock first: concurrent replaces and edits run one after the other.
            locked = await lease_template_repo.get(
                db,
                template_id=template_id,
                user_id=user_id,
                organization_id=organization_id,
                for_update=True,
            )
            if locked is None:
                raise TemplateNotFoundError(f"Template {template_id} not found")
            prior = await lease_template_placeholder_repo.list_specs_for_template(
                db, template_id=template_id,
            )
            old_keys = await lease_template_bundle_repo.replace_bundle(
                db,
                template_id=template_id,
                user_id=user_id,
                organization_id=organization_id,
                files=_new_file_rows(validated, new_keys),
                placeholders=_derive_placeholders(placeholder_keys, prior),
            )
            guard.set_superseded(old_keys)
            guard.rows_written()

    return await get_template(
        user_id=user_id, organization_id=organization_id, template_id=template_id,
    )
