"""Unit tests for platform_shared.core.capped_upload."""
from __future__ import annotations

import io

import pytest
from fastapi import UploadFile

from platform_shared.core.capped_upload import read_upload_capped
from platform_shared.core.capped_upload_constants import UPLOAD_READ_CHUNK_BYTES
from platform_shared.core.upload_too_large_error import UploadTooLargeError


class _CountingFile(io.BytesIO):
    """A file that records how many bytes the reader actually pulled from it."""

    def __init__(self, data: bytes) -> None:
        super().__init__(data)
        self.bytes_read = 0

    def read(self, size: int | None = -1) -> bytes:
        chunk = super().read(size)
        self.bytes_read += len(chunk)
        return chunk


def _upload(data: bytes) -> tuple[UploadFile, _CountingFile]:
    raw = _CountingFile(data)
    return UploadFile(file=raw, filename="photo.png"), raw


@pytest.mark.asyncio
async def test_returns_whole_file_across_chunks() -> None:
    data = bytes(range(256)) * (UPLOAD_READ_CHUNK_BYTES // 256 * 3 + 7)
    upload, _ = _upload(data)
    assert await read_upload_capped(upload, max_bytes=len(data)) == data


@pytest.mark.asyncio
async def test_empty_file_returns_empty_bytes() -> None:
    upload, _ = _upload(b"")
    assert await read_upload_capped(upload, max_bytes=10) == b""


@pytest.mark.asyncio
async def test_over_cap_raises_after_reading_at_most_one_chunk_past_it() -> None:
    cap = UPLOAD_READ_CHUNK_BYTES
    upload, raw = _upload(b"x" * (cap * 20))
    with pytest.raises(UploadTooLargeError) as info:
        await read_upload_capped(upload, max_bytes=cap)
    assert info.value.max_bytes == cap
    assert raw.bytes_read <= cap + UPLOAD_READ_CHUNK_BYTES


@pytest.mark.asyncio
async def test_one_byte_over_cap_raises() -> None:
    upload, _ = _upload(b"x" * 11)
    with pytest.raises(UploadTooLargeError):
        await read_upload_capped(upload, max_bytes=10)
