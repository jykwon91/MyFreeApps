"""Rendering a lease's template files to documents in storage.

Shared by ``generate_lease`` and ``add_templates_and_generate``. Everything
here happens BEFORE the database is touched: files are read, rendered and
rendering runs in a worker thread (it blocks), and on any failure —
including cancellation — every object uploaded so far is removed.
"""
from __future__ import annotations

import asyncio
import datetime as _dt
import logging
import uuid
from collections.abc import Iterator
from contextlib import contextmanager
from typing import Any

from app.core.lease_template_constants import STORAGE_UNAVAILABLE_MESSAGE
from app.core.storage import StorageClient
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
from app.services.storage.stored_file import load_stored_file
from platform_shared.core.storage import STORAGE_UNAVAILABLE_ERRORS
from platform_shared.schemas.storage.new_stored_object import NewStoredObject
from platform_shared.services.storage.object_upload import upload_objects

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
    """Report a storage failure as ``TemplateStorageUnavailableError``.

    Only storage calls are wrapped: a render failure (even an ``OSError`` from
    the converter or a full temp disk) must not read as a storage outage.
    """
    try:
        yield
    except STORAGE_UNAVAILABLE_ERRORS as exc:
        raise TemplateStorageUnavailableError(STORAGE_UNAVAILABLE_MESSAGE) from exc


def _render_one(file: Any, raw: bytes, substitutions: dict[str, str]) -> tuple[bytes, str, str]:
    """Blocking: render one template file. Returns its bytes, filename and MIME type."""
    if file.content_type == DOCX_MIME:
        rendered, _ = render_docx_bytes_to_pdf(raw, substitutions)
        return rendered, swap_extension(file.filename, ".pdf"), "application/pdf"
    if file.content_type in ("text/markdown", "text/plain"):
        text = render_md(raw.decode("utf-8", errors="replace"), substitutions)
        return render_md_text_to_pdf_or_keep(text), swap_extension(file.filename, ".pdf"), "application/pdf"
    return raw, file.filename, file.content_type


async def render_and_upload(
    storage: StorageClient,
    lease_id: uuid.UUID,
    files: list[Any],
    substitutions: dict[str, str],
) -> list[RenderedLeaseFile]:
    """Render every file, then upload them all-or-nothing.

    Rendering runs in a worker thread (it is CPU-bound) and stores nothing, so
    a failure there needs no cleanup. The uploads go through ``upload_objects``,
    which removes every object attempted if any one fails or the request is
    cancelled. Errors are re-raised (``StoredFileMissingError`` if a template
    object has vanished; a storage outage becomes
    ``TemplateStorageUnavailableError``).
    """
    rendered: list[RenderedLeaseFile] = []
    objects: list[NewStoredObject] = []
    try:
        for file in files:
            with _storage_outage_as_unavailable():
                raw = await load_stored_file(storage, file.storage_key)
            content, filename, content_type = await asyncio.to_thread(
                _render_one, file, raw, substitutions,
            )
            key = f"signed-leases/{lease_id}/{uuid.uuid4()}"
            objects.append(NewStoredObject(key, content, content_type))
            rendered.append(RenderedLeaseFile(key, filename, content_type, len(content)))
        with _storage_outage_as_unavailable():
            await upload_objects(storage, objects)
    except Exception:
        logger.error("Failed to render/upload a file for lease %s", lease_id, exc_info=True)
        raise
    return rendered
