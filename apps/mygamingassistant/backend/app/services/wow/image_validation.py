"""Magic-byte sniffing for item-tooltip screenshots.

The client-declared Content-Type is not trusted — the media type sent to Claude
comes from the file's own leading bytes.
"""

_PNG_MAGIC = b"\x89PNG\r\n\x1a\n"
_JPEG_MAGIC = b"\xff\xd8\xff"
_RIFF_MAGIC = b"RIFF"
_WEBP_MAGIC = b"WEBP"


def detect_image_media_type(data: bytes) -> str | None:
    """Return ``image/png`` / ``image/jpeg`` / ``image/webp``, or None if unsupported."""
    if data.startswith(_PNG_MAGIC):
        return "image/png"
    if data.startswith(_JPEG_MAGIC):
        return "image/jpeg"
    if len(data) >= 12 and data[:4] == _RIFF_MAGIC and data[8:12] == _WEBP_MAGIC:
        return "image/webp"
    return None
