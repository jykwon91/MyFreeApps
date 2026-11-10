"""Rendering a lease's template files to documents in storage.

Shared by ``generate_lease`` and ``add_templates_and_generate``. Everything
here happens BEFORE the database is touched: files are read, rendered and
uploaded in worker threads (they block), and on any failure — including
cancellation — every object uploaded so far is removed.
"""
from __future__ import annotations

import asyncio
import datetime as _dt
import logging
import uuid
from collections.abc import Iterator
from contextlib import contextmanager
from typing import Any

from minio.error import S3Error
from urllib3.exceptions import HTTPError

from app.core.commit_outcome_constants import OUTCOME_CHECK_LOCK_TIMEOUT_MS
from app.core.lease_template_constants import STORAGE_UNAVAILABLE_MESSAGE
from app.core.storage import StorageClient
from app.db.session import unit_of_work
from app.repositories import lock_timeout_repo
from app.repositories.leases import signed_lease_attachment_repo, signed_lease_repo
from app.schemas.leases.rendered_lease_file import RenderedLeaseFile
from app.services.leases.exceptions.template_storage_unavailable_error import (
    TemplateStorageUnavailableError,
)
from app.services.leases.computed import ComputedExprError, evaluate
from app.services.leases.lease_template_service import DOCX_MIME
from app.services.leases.renderer import (
    render_docx_bytes_to_pdf,
    render_md,
    render_pdf_from_text,
)
from app.services.storage.committed_write_guard import RowsPresent
from app.services.storage.stored_file import read_stored_file
from app.services.storage.stored_file_cleanup import discard_after_in_flight

logger = logging.getLogger(__name__)


def swap_extension(filename: str, suffix: str) -> str:
    base = filename.rsplit(".", 1)[0] if "." in filename else filename
    return f"{base}{suffix}"


def render_md_text_to_pdf_or_keep(rendered_md: str) -> bytes:
    """Render rendered markdown to PDF bytes (low-fidelity, reportlab-based)."""
    return render_pdf_from_text(rendered_md)


def build_substitutions(
    values: dict[str, Any], placeholders: list[Any], today: _dt.date,
) -> dict[str, str]:
    """Stringified values plus evaluated computed placeholders."""
    substitutions = {k: "" if v is None else str(v) for k, v in values.items()}
    for p in placeholders:
        if p.input_type == "computed" and p.computed_expr:
            try:
                substitutions[p.key] = evaluate(p.computed_expr, values, today=today)
            except ComputedExprError as exc:
                logger.warning("Computed placeholder %s failed to evaluate: %s", p.key, exc)
                substitutions[p.key] = ""
    return substitutions


@contextmanager
def _storage_outage_as_unavailable() -> Iterator[None]:
    """Only storage calls are wrapped: a render failure (even an ``OSError`` from
    the converter or a full temp disk) must not read as a storage outage."""
    try:
        yield
    except (S3Error, HTTPError) as exc:
        raise TemplateStorageUnavailableError(STORAGE_UNAVAILABLE_MESSAGE) from exc


def _render_and_upload_one(
    storage: StorageClient, file: Any, key: str, substitutions: dict[str, str],
) -> RenderedLeaseFile:
    """Blocking: read the template object, render it and upload the result."""
    with _storage_outage_as_unavailable():
        raw = read_stored_file(storage, file.storage_key)
    if file.content_type == DOCX_MIME:
        rendered, _ = render_docx_bytes_to_pdf(raw, substitutions)
        filename, content_type = swap_extension(file.filename, ".pdf"), "application/pdf"
    elif file.content_type in ("text/markdown", "text/plain"):
        text = render_md(raw.decode("utf-8", errors="replace"), substitutions)
        rendered = render_md_text_to_pdf_or_keep(text)
        filename, content_type = swap_extension(file.filename, ".pdf"), "application/pdf"
    else:
        rendered, filename, content_type = raw, file.filename, file.content_type
    with _storage_outage_as_unavailable():
        storage.upload_file(key, rendered, content_type)
    return RenderedLeaseFile(key, filename, content_type, len(rendered))


async def render_and_upload(
    storage: StorageClient,
    lease_id: uuid.UUID,
    files: list[Any],
    substitutions: dict[str, str],
) -> list[RenderedLeaseFile]:
    """Render and upload every file, all-or-nothing.

    Each key is recorded before its thread starts. On failure or cancellation the
    objects are removed once any thread still running has finished, and the error
    is re-raised (``StoredFileMissingError`` if a template object has vanished; a
    storage outage becomes ``TemplateStorageUnavailableError``).
    """
    rendered: list[RenderedLeaseFile] = []
    keys: list[str] = []
    in_flight: asyncio.Future[Any] | None = None
    try:
        for file in files:
            key = f"signed-leases/{lease_id}/{uuid.uuid4()}"
            keys.append(key)
            in_flight = asyncio.ensure_future(
                asyncio.to_thread(_render_and_upload_one, storage, file, key, substitutions),
            )
            rendered.append(await asyncio.shield(in_flight))
            in_flight = None
    except BaseException as exc:
        if isinstance(exc, Exception):
            logger.error("Failed to render/upload a file for lease %s", lease_id, exc_info=True)
        await asyncio.shield(discard_after_in_flight(keys, in_flight))
        raise
    return rendered


def attachments_present_check(
    lease_id: uuid.UUID, user_id: uuid.UUID, organization_id: uuid.UUID, keys: list[str],
) -> RowsPresent:
    """A check that some of ``keys`` are recorded on the lease.

    Takes the lease row lock first (bounded by a lock timeout), which waits for
    the original transaction to finish; a timeout or any error leaves the
    outcome unknown.
    """

    async def rows_present() -> bool:
        async with unit_of_work() as db:
            await lock_timeout_repo.set_local_lock_timeout(db, OUTCOME_CHECK_LOCK_TIMEOUT_MS)
            await signed_lease_repo.get(
                db,
                lease_id=lease_id,
                user_id=user_id,
                organization_id=organization_id,
                include_deleted=True,
                for_update=True,
            )
            rows = await signed_lease_attachment_repo.list_by_lease(db, lease_id)
        return bool({r.storage_key for r in rows} & set(keys))

    return rows_present
