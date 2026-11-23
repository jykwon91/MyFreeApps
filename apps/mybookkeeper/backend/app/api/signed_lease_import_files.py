"""Read the files of a ``POST /signed-leases/import`` request, each capped at the attachment limit."""
from __future__ import annotations

from fastapi import UploadFile
from platform_shared.core.capped_upload import read_upload_or_reject

from app.core.config import settings
from app.core.upload_size_messages import attachment_too_large_message


async def read_import_files(files: list[UploadFile]) -> list[tuple[bytes, str]]:
    """Return ``(content, filename)`` per file; 413 naming the first file over the limit."""
    file_tuples: list[tuple[bytes, str]] = []
    for f in files:
        filename = f.filename or ""
        content = await read_upload_or_reject(
            f,
            settings.max_blackout_attachment_size_bytes,
            status_code=413,
            detail=attachment_too_large_message(f"File '{filename}'"),
        )
        file_tuples.append((content, filename))
    return file_tuples
