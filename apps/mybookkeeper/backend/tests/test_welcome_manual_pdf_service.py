"""Unit tests for the pure welcome-manual PDF renderer.

The renderer takes already-fetched image BYTES and returns raw PDF bytes —
no DB, no storage. Covers: valid output, empty manual, sections with/without
body, sections with/without images, image embedding, and the robustness
contract (a corrupt image is skipped, never crashes the PDF).
"""
from __future__ import annotations

import io

from PIL import Image

from app.services.welcome_manuals.welcome_manual_pdf_service import (
    SectionImagePdfData,
    SectionPdfData,
    WelcomeManualPdfData,
    generate_welcome_manual_pdf,
)


def _png_bytes(size: tuple[int, int] = (16, 16)) -> bytes:
    img = Image.new("RGB", size, (10, 120, 200))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


class TestRenderBasics:
    def test_returns_pdf_bytes(self) -> None:
        pdf = generate_welcome_manual_pdf(
            WelcomeManualPdfData(
                title="Beach House Guide",
                intro_text="Welcome! Here's everything you need.",
                sections=[
                    SectionPdfData(title="Wi-Fi", body="Network: BeachHouse\nPassword: sunny123"),
                ],
            ),
        )
        assert isinstance(pdf, bytes)
        assert pdf.startswith(b"%PDF")
        assert len(pdf) > 100

    def test_empty_manual_renders(self) -> None:
        pdf = generate_welcome_manual_pdf(
            WelcomeManualPdfData(title="Empty Guide", intro_text=None, sections=[]),
        )
        assert pdf.startswith(b"%PDF")

    def test_section_without_body_renders(self) -> None:
        pdf = generate_welcome_manual_pdf(
            WelcomeManualPdfData(
                title="Guide",
                sections=[SectionPdfData(title="Parking", body=None)],
            ),
        )
        assert pdf.startswith(b"%PDF")

    def test_section_without_images_renders(self) -> None:
        pdf = generate_welcome_manual_pdf(
            WelcomeManualPdfData(
                title="Guide",
                sections=[SectionPdfData(title="Laundry", body="Use pods only.", images=[])],
            ),
        )
        assert pdf.startswith(b"%PDF")

    def test_no_intro_text_renders(self) -> None:
        pdf = generate_welcome_manual_pdf(
            WelcomeManualPdfData(
                title="Guide",
                intro_text=None,
                sections=[SectionPdfData(title="Trash", body="Pickup is Tuesday.")],
            ),
        )
        assert pdf.startswith(b"%PDF")


class TestImages:
    def test_valid_png_embeds(self) -> None:
        pdf = generate_welcome_manual_pdf(
            WelcomeManualPdfData(
                title="Guide",
                sections=[
                    SectionPdfData(
                        title="Trash bins",
                        body="The bins are by the side gate.",
                        images=[
                            SectionImagePdfData(image_bytes=_png_bytes(), caption="Side gate bins"),
                        ],
                    ),
                ],
            ),
        )
        assert pdf.startswith(b"%PDF")
        # A PDF embedding an image is meaningfully larger than a text-only one.
        text_only = generate_welcome_manual_pdf(
            WelcomeManualPdfData(
                title="Guide",
                sections=[SectionPdfData(title="Trash bins", body="The bins are by the side gate.")],
            ),
        )
        assert len(pdf) > len(text_only)

    def test_image_without_caption_renders(self) -> None:
        pdf = generate_welcome_manual_pdf(
            WelcomeManualPdfData(
                title="Guide",
                sections=[
                    SectionPdfData(
                        title="View",
                        images=[SectionImagePdfData(image_bytes=_png_bytes(), caption=None)],
                    ),
                ],
            ),
        )
        assert pdf.startswith(b"%PDF")

    def test_corrupt_image_is_skipped_not_crashed(self) -> None:
        # A garbage byte-string is undecodable — the renderer must skip it and
        # still produce a valid PDF rather than raising.
        pdf = generate_welcome_manual_pdf(
            WelcomeManualPdfData(
                title="Guide",
                sections=[
                    SectionPdfData(
                        title="Broken photo",
                        body="This section has a corrupt image.",
                        images=[
                            SectionImagePdfData(image_bytes=b"not-an-image", caption="oops"),
                        ],
                    ),
                ],
            ),
        )
        assert pdf.startswith(b"%PDF")

    def test_mixed_valid_and_corrupt_images(self) -> None:
        pdf = generate_welcome_manual_pdf(
            WelcomeManualPdfData(
                title="Guide",
                sections=[
                    SectionPdfData(
                        title="Photos",
                        images=[
                            SectionImagePdfData(image_bytes=b"\x00\x01garbage", caption="bad"),
                            SectionImagePdfData(image_bytes=_png_bytes(), caption="good"),
                        ],
                    ),
                ],
            ),
        )
        assert pdf.startswith(b"%PDF")


class TestEscaping:
    def test_html_special_chars_do_not_break_render(self) -> None:
        pdf = generate_welcome_manual_pdf(
            WelcomeManualPdfData(
                title="Tom & Jerry's <Place>",
                intro_text="Rules: be < 10 people & > 0 adults.",
                sections=[
                    SectionPdfData(
                        title="House <rules>",
                        body="No <script> tags & be nice.",
                        images=[SectionImagePdfData(image_bytes=_png_bytes(), caption="A & B <c>")],
                    ),
                ],
            ),
        )
        assert pdf.startswith(b"%PDF")
