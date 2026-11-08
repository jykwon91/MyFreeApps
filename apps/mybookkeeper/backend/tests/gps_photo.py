"""Builds photos carrying a GPS location, for tests that prove it's removed."""
from __future__ import annotations

import io

from PIL import Image, TiffImagePlugin

GPS_IFD = 0x8825


def photo_with_gps(fmt: str) -> bytes:
    img = Image.new("RGB", (32, 32), color=(200, 100, 50))
    exif = img.getexif()
    gps = exif.get_ifd(GPS_IFD)
    gps[1] = "N"
    gps[2] = tuple(TiffImagePlugin.IFDRational(v, 1) for v in (37, 33, 45))
    gps[3] = "W"
    gps[4] = tuple(TiffImagePlugin.IFDRational(v, 1) for v in (122, 25, 10))
    buf = io.BytesIO()
    img.save(buf, format=fmt, exif=exif.tobytes())
    return buf.getvalue()


def gps_of(content: bytes) -> dict[int, object]:
    with Image.open(io.BytesIO(content)) as img:
        return dict(img.getexif().get_ifd(GPS_IFD))
