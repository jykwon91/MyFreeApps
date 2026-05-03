"""Inject per-request presigned URLs for lease-domain attachments and files.

The single-seam rule (CLAUDE.md): presigned URLs for any object in the
lease domain are minted ONLY through this module. Two helpers — one for
``LeaseTemplateFileResponse`` rows, one for ``SignedLeaseAttachmentResponse``
rows — share the same signing helper.

Graceful degradation: if storage is unavailable, every row gets
``presigned_url=None`` so the frontend can show a placeholder.
"""
from __future__ import annotations

import logging
from typing import TypeVar

from app.core.config import settings
from app.core.storage import StorageClient, get_storage
from app.schemas.leases.lease_template_file_response import (
    LeaseTemplateFileResponse,
)
from app.schemas.leases.signed_lease_attachment_response import (
    SignedLeaseAttachmentResponse,
)

logger = logging.getLogger(__name__)

_T = TypeVar("_T", LeaseTemplateFileResponse, SignedLeaseAttachmentResponse)


def _sign_one(storage: StorageClient, key: str) -> str | None:
    try:
        return storage.generate_presigned_url(key, settings.presigned_url_ttl_seconds)
    except Exception:  # noqa: BLE001
        logger.warning("Failed to sign presigned URL for %s", key, exc_info=True)
        return None


def _attach(rows: list[_T]) -> list[_T]:
    if not rows:
        return rows
    storage = get_storage()
    if storage is None:
        return [r.model_copy(update={"presigned_url": None}) for r in rows]
    return [
        r.model_copy(update={"presigned_url": _sign_one(storage, r.storage_key)})
        for r in rows
    ]


def attach_presigned_urls_to_files(
    files: list[LeaseTemplateFileResponse],
) -> list[LeaseTemplateFileResponse]:
    return _attach(files)


def attach_presigned_urls_to_attachments(
    attachments: list[SignedLeaseAttachmentResponse],
) -> list[SignedLeaseAttachmentResponse]:
    return _attach(attachments)
