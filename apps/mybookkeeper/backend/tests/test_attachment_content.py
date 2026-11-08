"""The shared attachment check: type from the bytes, photos stored without GPS."""
from __future__ import annotations

import io
import zipfile

import pytest
from PIL import Image

from app.services.storage.attachment_content import (
    DOCX_MIME,
    UnreadableImage,
    UnsupportedAttachmentType,
    clean_attachment,
    sniff_content_type,
)
from tests.gps_photo import gps_of, photo_with_gps

_ALL = frozenset({
    "application/pdf", DOCX_MIME, "image/jpeg", "image/png", "image/webp", "image/gif", "text/plain",
})


def _zip(member: str) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as archive:
        archive.writestr(member, "<w:document/>")
    return buf.getvalue()


def _gif() -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (8, 8)).save(buf, format="GIF")
    return buf.getvalue()


class TestSniffContentType:
    @pytest.mark.parametrize(
        ("fmt", "mime"), [("JPEG", "image/jpeg"), ("PNG", "image/png"), ("WEBP", "image/webp")],
    )
    def test_photos(self, fmt: str, mime: str) -> None:
        assert sniff_content_type(photo_with_gps(fmt)) == mime

    def test_gif(self) -> None:
        assert sniff_content_type(_gif()) == "image/gif"

    @pytest.mark.parametrize("content", [b"%PDF", b"%PDF-1.4 some content"])
    def test_pdf_including_a_tiny_one(self, content: bytes) -> None:
        assert sniff_content_type(content) == "application/pdf"

    def test_docx(self) -> None:
        assert sniff_content_type(_zip("word/document.xml")) == DOCX_MIME

    def test_a_zip_that_isnt_a_word_document(self) -> None:
        assert sniff_content_type(_zip("payload.exe")) is None

    def test_a_truncated_zip(self) -> None:
        assert sniff_content_type(b"PK\x03\x04garbage") is None

    def test_plain_text(self) -> None:
        assert sniff_content_type(b"Hello world\nplain text here") == "text/plain"

    @pytest.mark.parametrize("content", [b"", b"MZ\x90\x00\x03\x00\x00\x00"])
    def test_unrecognised(self, content: bytes) -> None:
        assert sniff_content_type(content) is None


class TestCleanAttachment:
    @pytest.mark.parametrize(
        ("fmt", "mime"), [("JPEG", "image/jpeg"), ("PNG", "image/png"), ("WEBP", "image/webp")],
    )
    def test_photo_gps_is_removed(self, fmt: str, mime: str) -> None:
        photo = photo_with_gps(fmt)
        assert gps_of(photo), "fixture must carry GPS"

        cleaned = clean_attachment(photo, _ALL)

        assert gps_of(cleaned.content) == {}
        assert cleaned.content_type == mime

    @pytest.mark.parametrize("content", [b"%PDF-1.4 x", b"plain notes", _gif()])
    def test_non_photo_types_are_stored_unchanged(self, content: bytes) -> None:
        assert clean_attachment(content, _ALL).content == content

    def test_a_photo_that_cant_be_re_encoded_is_rejected(self) -> None:
        with pytest.raises(UnreadableImage):
            clean_attachment(b"\xff\xd8\xff" + b"MZ\x90\x00" * 100, _ALL)

    def test_a_type_outside_the_allowlist_is_rejected(self) -> None:
        with pytest.raises(UnsupportedAttachmentType) as exc:
            clean_attachment(b"plain notes", frozenset({"application/pdf"}))
        assert exc.value.sniffed == "text/plain"

    def test_unrecognised_bytes_are_rejected(self) -> None:
        with pytest.raises(UnsupportedAttachmentType) as exc:
            clean_attachment(b"MZ\x90\x00\x03\x00\x00\x00", _ALL)
        assert exc.value.sniffed is None
