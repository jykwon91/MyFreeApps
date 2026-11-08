"""Content checks for files stored as uploaded.

Attachment uploads (blackout notes, signed leases, imported leases, insurance
policies) run through ``clean_attachment`` before storage:

    sniff the type from the bytes → allowlist → re-encode photos without metadata

Documents (uploads, replaced files and Gmail attachments) accept more types
and run through ``strip_photo_metadata``, which only re-encodes photos.

The type always comes from the bytes. The browser's declared type and the
filename are never trusted, because a photo labelled ``lease.pdf`` would
otherwise skip the metadata strip and keep the phone's GPS location.

A photo that can't be re-encoded is rejected rather than stored as-is.

PDF and DOCX files are stored as uploaded: a photo embedded inside one keeps
whatever metadata it had.
"""
from __future__ import annotations

import io
import logging
import re
import zipfile
from dataclasses import dataclass

from app.services.storage.image_processor import ImageRejected, strip_metadata

logger = logging.getLogger(__name__)

DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"

# Photo types re-encoded without metadata before storage. GIF has no EXIF
# block (where phones write GPS), so it is stored as-is.
METADATA_STRIPPED_MIME_TYPES: frozenset[str] = frozenset({
    "image/png",
    "image/jpeg",
    "image/webp",
})

_DOCX_MAIN_PART = "word/document.xml"

# Text is UTF-8 (ASCII included, BOM allowed). Control characters other than
# tab, newline, vertical tab, form feed and carriage return mean binary data.
_CONTROL_CHARACTERS = re.compile(r"[\x00-\x08\x0e-\x1f\x7f-\x9f]")


class UnsupportedAttachmentType(ValueError):
    """The bytes are not one of the allowed types."""

    def __init__(self, sniffed: str | None) -> None:
        super().__init__(f"unsupported file type (sniffed={sniffed!r})")
        self.sniffed = sniffed


class UnreadableImage(ValueError):
    """The bytes look like a photo but can't be re-encoded without metadata."""

    def __init__(self, reason: str) -> None:
        super().__init__(reason)
        self.reason = reason


@dataclass(frozen=True)
class CleanAttachment:
    content: bytes
    content_type: str

    @property
    def storage_content_type(self) -> str:
        """The type to store the object under, so a browser opening it decodes text as UTF-8."""
        if self.content_type == "text/plain":
            return "text/plain; charset=utf-8"
        return self.content_type


def _is_docx(content: bytes) -> bool:
    try:
        with zipfile.ZipFile(io.BytesIO(content)) as archive:
            return _DOCX_MAIN_PART in archive.namelist()
    except zipfile.BadZipFile:
        return False


def _is_plain_text(content: bytes) -> bool:
    try:
        text = content.decode("utf-8-sig")
    except UnicodeDecodeError:
        return False
    return _CONTROL_CHARACTERS.search(text) is None


def sniff_content_type(content: bytes) -> str | None:
    """Return the MIME type the bytes actually are, or None if unrecognised."""
    if not content:
        return None
    if content.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if content.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if content.startswith(b"RIFF") and content[8:12] == b"WEBP":
        return "image/webp"
    if content.startswith((b"GIF87a", b"GIF89a")):
        return "image/gif"
    if content.startswith(b"%PDF"):
        return "application/pdf"
    if content.startswith(b"PK\x03\x04"):
        return DOCX_MIME if _is_docx(content) else None
    if _is_plain_text(content):
        return "text/plain"
    return None


def clean_attachment(content: bytes, allowed: frozenset[str]) -> CleanAttachment:
    """Return bytes safe to store and their real type.

    Raises:
        UnsupportedAttachmentType: the bytes aren't one of ``allowed``.
        UnreadableImage: a photo that can't be re-encoded without metadata.
    """
    sniffed = sniff_content_type(content)
    if sniffed is None or sniffed not in allowed:
        raise UnsupportedAttachmentType(sniffed)
    return CleanAttachment(content=_strip_if_photo(content, sniffed), content_type=sniffed)


def strip_photo_metadata(content: bytes) -> bytes:
    """Return a photo re-encoded without its metadata; any other bytes unchanged.

    Raises:
        UnreadableImage: a photo that can't be re-encoded without metadata.
    """
    return _strip_if_photo(content, sniff_content_type(content))


def _strip_if_photo(content: bytes, sniffed: str | None) -> bytes:
    if sniffed is None or sniffed not in METADATA_STRIPPED_MIME_TYPES:
        return content
    try:
        return strip_metadata(content, sniffed)
    except ImageRejected as exc:
        logger.warning("Photo rejected: %s", exc.reason)
        raise UnreadableImage(exc.reason) from exc
