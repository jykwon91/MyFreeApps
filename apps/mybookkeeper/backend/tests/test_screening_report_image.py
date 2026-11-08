"""Screening report images go through the shared metadata strip and fail closed."""
from __future__ import annotations

import io

import pytest
from PIL import Image, TiffImagePlugin

from app.services.screening.report_processor import ReportRejected, process_report

GPS_IFD = 0x8825


def test_a_screenshot_of_the_report_is_stored_without_gps(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("CLAMAV_SOCKET_PATH", raising=False)
    img = Image.new("RGB", (32, 32))
    exif = img.getexif()
    exif.get_ifd(GPS_IFD)[2] = tuple(TiffImagePlugin.IFDRational(v, 1) for v in (37, 33, 45))
    buf = io.BytesIO()
    img.save(buf, format="JPEG", exif=exif.tobytes())

    result = process_report(buf.getvalue())

    assert result.content_type == "image/jpeg"
    with Image.open(io.BytesIO(result.content)) as stored:
        assert not stored.getexif().get_ifd(GPS_IFD)


def test_an_image_that_cant_be_read_is_rejected(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("CLAMAV_SOCKET_PATH", raising=False)

    with pytest.raises(ReportRejected) as exc_info:
        process_report(b"\xff\xd8\xff" + b"MZ\x90\x00" * 100)

    assert "cannot decode image" in exc_info.value.reason
