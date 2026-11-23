"""Read an uploaded file in a route without holding more than its limit in memory."""
from fastapi import HTTPException, UploadFile
from platform_shared.core.capped_upload import read_upload_capped
from platform_shared.core.upload_too_large_error import UploadTooLargeError

from app.core.config import settings
from app.core.upload_size_messages import (
    attachment_too_large_message,
    document_too_large_message,
)


async def read_upload_or_reject(
    upload: UploadFile,
    max_bytes: int,
    *,
    detail: str,
    status_code: int = 413,
) -> bytes:
    """Return the upload's bytes, or answer ``status_code`` with ``detail`` once it passes ``max_bytes``.

    ``detail`` and ``status_code`` are what the endpoint answered for an
    oversized file before the read was capped, so callers see no change.
    """
    try:
        return await read_upload_capped(upload, max_bytes)
    except UploadTooLargeError as exc:
        raise HTTPException(status_code=status_code, detail=detail) from exc


async def read_document_upload(upload: UploadFile, *, status_code: int = 413) -> bytes:
    """Read a document upload, capped at ``max_upload_size_bytes``."""
    return await read_upload_or_reject(
        upload,
        settings.max_upload_size_bytes,
        detail=document_too_large_message(),
        status_code=status_code,
    )


async def read_attachment_upload(upload: UploadFile, *, subject: str = "File") -> bytes:
    """Read an attachment upload, capped at ``max_blackout_attachment_size_bytes``."""
    return await read_upload_or_reject(
        upload,
        settings.max_blackout_attachment_size_bytes,
        detail=attachment_too_large_message(subject),
    )
