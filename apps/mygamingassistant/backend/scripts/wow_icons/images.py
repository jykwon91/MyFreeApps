"""Client icon (BLP) -> the WebP the pages load, and where it lives in object storage."""
from __future__ import annotations

import io
import struct
from typing import Final

from PIL import Image  # generator-only dependency (Pillow, via qrcode[pil])

ICON_SIZE: Final = 64
WEBP_QUALITY: Final = 80

# BLP2 header: magic, type, then encoding / alpha depth / alpha encoding / mips bytes,
# width + height, 16 mip offsets.
_BLP2_ENCODING: Final = 8
_BLP2_SIZE: Final = 12
_BLP2_MIP_OFFSETS: Final = 20
_BLP2_RAW_BGRA: Final = 3


def icon_key(build: str, file_data_id: int) -> str:
    """``wow/1.60.1.70790/icons/134829.webp`` — the object key the API serves it from."""
    return f"wow/{build}/icons/{file_data_id}.webp"


def open_blp(blp: bytes) -> Image.Image:
    """Pillow reads BLP2 palette and DXT icons; encoding 3 (raw BGRA, mip 0 at the
    header's first offset) it can't, so that one is read here."""
    if blp[:4] == b"BLP2" and blp[_BLP2_ENCODING] == _BLP2_RAW_BGRA:
        width, height = struct.unpack_from("<II", blp, _BLP2_SIZE)
        offset = struct.unpack_from("<I", blp, _BLP2_MIP_OFFSETS)[0]
        pixels = blp[offset : offset + width * height * 4]
        return Image.frombuffer("RGBA", (width, height), pixels, "raw", "BGRA", 0, 1)
    return Image.open(io.BytesIO(blp))


def blp_to_webp(blp: bytes) -> bytes:
    """A client icon as a 64x64 WebP (alpha kept); larger art is scaled down, never up."""
    image = open_blp(blp).convert("RGBA")
    if image.width > ICON_SIZE or image.height > ICON_SIZE:
        image = image.resize((ICON_SIZE, ICON_SIZE), Image.Resampling.LANCZOS)
    out = io.BytesIO()
    image.save(out, "WEBP", quality=WEBP_QUALITY)
    return out.getvalue()
