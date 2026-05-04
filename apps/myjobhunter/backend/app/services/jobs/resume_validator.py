"""Pure-function validation for uploaded resume files.

Validates:
- Allowed content-types: PDF, DOCX, plain text.
- Magic-byte sniffing to detect the actual file format regardless of the
  client-supplied Content-Type header (mirrors MBK's image_processor pattern).

This module is pure — no I/O, no DB, no network. The service layer calls it
before persisting anything.
"""
from __future__ import annotations

# Allowed MIME types for resume uploads.
ALLOWED_RESUME_MIME_TYPES: frozenset[str] = frozenset({
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "text/plain",
})

# Human-readable description for error messages.
ALLOWED_RESUME_TYPES_LABEL = "PDF, DOCX, or plain text"


class ResumeRejected(ValueError):
    """Raised when an uploaded resume fails any validation check.

    The route handler maps this to HTTP 413 (too large) or HTTP 415
    (unsupported media type) by inspecting ``reason``.
    """

    def __init__(self, reason: str) -> None:
        super().__init__(reason)
        self.reason = reason


def sniff_content_type(content: bytes) -> str | None:
    """Return the sniffed MIME type based on leading magic bytes, or None.

    Covers exactly the three allowlisted resume formats. Kept separate so
    unit tests can exercise it directly.
    """
    if len(content) < 4:
        return None

    # PDF: %PDF header
    if content[0:4] == b"%PDF":
        return "application/pdf"

    # DOCX (and other modern Office formats): ZIP-based container with PK header.
    # Office Open XML files start with the standard ZIP magic bytes.
    # A proper DOCX will contain [Content_Types].xml inside the zip.
    if content[0:4] == b"PK\x03\x04":
        # Lightweight check: if it starts with the ZIP magic it's plausibly DOCX.
        # Full zip parsing is out of scope — the size cap and allowlist are the
        # primary defenses. Accept as DOCX.
        return "application/vnd.openxmlformats-officedocument.wordprocessingml.document"

    # Reject known binary formats before the UTF-8 text fallback.
    # These patterns appear before the text check to prevent binary files
    # whose headers happen to be valid UTF-8 (e.g. GIF "GIF89a", PNG, JPEG)
    # from slipping through as "text/plain".
    _BINARY_MAGIC_PREFIXES = (
        b"GIF8",          # GIF
        b"\x89PNG",       # PNG
        b"\xff\xd8\xff",  # JPEG
        b"\x1f\x8b",      # gzip
        b"BZh",           # bzip2
        b"\xfd7zXZ",      # xz
        b"Rar!",          # RAR
        b"\x7fELF",       # ELF binary
        b"MZ",            # Windows PE executable
        b"\x00\x00\x00",  # many binary formats start with null bytes
    )
    for prefix in _BINARY_MAGIC_PREFIXES:
        if content[: len(prefix)] == prefix:
            return None

    # Plain text: no known binary magic bytes, must be valid UTF-8.
    # We try to decode a leading slice; if that succeeds it's text.
    try:
        content[:512].decode("utf-8")
        return "text/plain"
    except UnicodeDecodeError:
        return None


def validate_resume(
    content: bytes,
    declared_content_type: str,
    max_bytes: int,
) -> str:
    """Validate the uploaded resume bytes. Returns the sniffed MIME type.

    Args:
        content: Raw bytes from the request body.
        declared_content_type: Content-Type header from the multipart part.
        max_bytes: Maximum allowed file size in bytes.

    Returns:
        The sniffed (canonical) MIME type string.

    Raises:
        ResumeRejected: on size, format, or magic-byte mismatch.
    """
    if not content:
        raise ResumeRejected("empty file")

    if len(content) > max_bytes:
        mb = max_bytes // (1024 * 1024)
        raise ResumeRejected(f"file exceeds {mb}MB limit")

    sniffed = sniff_content_type(content)
    if sniffed is None or sniffed not in ALLOWED_RESUME_MIME_TYPES:
        raise ResumeRejected(
            f"unsupported file type — upload a {ALLOWED_RESUME_TYPES_LABEL} file "
            f"(detected: {sniffed!r}, declared: {declared_content_type!r})",
        )

    # Declared vs sniffed mismatch guard: if the client claims PDF but the
    # bytes are a ZIP-based DOCX (or vice-versa), reject — prevents
    # polyglot attacks where the header bytes match one format but the
    # payload is another.
    normalized_declared = declared_content_type.split(";")[0].strip().lower()
    if (
        normalized_declared in ALLOWED_RESUME_MIME_TYPES
        and normalized_declared != sniffed
        # text/plain is the catch-all fallback; mismatch there is fine
        and sniffed != "text/plain"
        and normalized_declared != "text/plain"
    ):
        raise ResumeRejected(
            f"file content does not match the declared type "
            f"(declared: {declared_content_type!r}, detected: {sniffed!r})",
        )

    return sniffed
