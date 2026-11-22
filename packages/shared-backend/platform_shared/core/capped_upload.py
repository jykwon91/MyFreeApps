"""Read an uploaded file without holding more than its size limit in memory."""
from __future__ import annotations

from fastapi import UploadFile

from platform_shared.core.capped_upload_constants import UPLOAD_READ_CHUNK_BYTES
from platform_shared.core.upload_too_large_error import UploadTooLargeError


async def read_upload_capped(upload: UploadFile, max_bytes: int) -> bytes:
    """Return the upload's bytes, stopping as soon as it passes ``max_bytes``.

    ``await upload.read()`` pulls the whole file into memory before a caller can
    compare its length with a limit. Reading in chunks means an oversized file
    is refused after at most ``max_bytes`` plus one chunk is held in memory.

    This bounds memory, not what the server receives: by the time a route runs,
    Starlette has already spooled the whole multipart body to a temporary file.
    The request body itself is bounded upstream, by Caddy's
    ``request_body max_size``.

    Raises:
        UploadTooLargeError: the file is longer than ``max_bytes``.
    """
    chunks: list[bytes] = []
    total = 0
    while chunk := await upload.read(UPLOAD_READ_CHUNK_BYTES):
        total += len(chunk)
        if total > max_bytes:
            raise UploadTooLargeError(max_bytes)
        chunks.append(chunk)
    return b"".join(chunks)
