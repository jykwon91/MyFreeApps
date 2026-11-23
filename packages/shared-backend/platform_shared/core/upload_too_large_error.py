"""The error :func:`platform_shared.core.capped_upload.read_upload_capped` raises."""
from __future__ import annotations


class UploadTooLargeError(Exception):
    """An uploaded file is bigger than the caller's limit. Maps to HTTP 413."""

    def __init__(self, max_bytes: int) -> None:
        self.max_bytes = max_bytes
        super().__init__(f"upload exceeds {max_bytes} bytes")
