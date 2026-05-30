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


_MARKDOWN_BODY = (
    "# Wi-Fi & Access\n\n"
    "Some **bold**, *italic*, ~~old~~ and `inline code` text.\n\n"
    "## Steps\n\n"
    "- Connect to GuestNet\n"
    "  - Password is `sunny123`\n"
    "  - It's case-sensitive\n"
    "- Open a browser\n\n"
    "1. First do this\n2. Then this\n\n"
    "> Quiet hours start at 10pm.\n\n"
    "```\nemergency: 911\n```\n\n"
    "---\n\n"
    "See [the guide](https://example.com/guide) for more.\n\n"
    "| Item | Qty |\n|------|-----|\n| Towels | 4 |\n| Mugs | 6 |"
)


class TestMarkdownBodies:
    def test_markdown_body_renders_pdf(self) -> None:
        pdf = generate_welcome_manual_pdf(
            WelcomeManualPdfData(
                title="Beach House Guide",
                intro_text="Welcome! Read the **important** notes below.",
                sections=[SectionPdfData(title="Everything", body=_MARKDOWN_BODY)],
            ),
        )
        assert pdf.startswith(b"%PDF")
        assert len(pdf) > 100

    def test_markdown_body_is_richer_than_one_word(self) -> None:
        # A full markdown body produces meaningfully more structured output
        # (headings, lists, table, code block) than a single plain word.
        rich = generate_welcome_manual_pdf(
            WelcomeManualPdfData(
                title="Guide",
                sections=[SectionPdfData(title="S", body=_MARKDOWN_BODY)],
            ),
        )
        minimal = generate_welcome_manual_pdf(
            WelcomeManualPdfData(
                title="Guide",
                sections=[SectionPdfData(title="S", body="Hi.")],
            ),
        )
        assert len(rich) > len(minimal)

    def test_markdown_intro_text_renders(self) -> None:
        pdf = generate_welcome_manual_pdf(
            WelcomeManualPdfData(
                title="Guide",
                intro_text="## Welcome\n\nEnjoy your **stay**!\n\n- Tip one\n- Tip two",
                sections=[],
            ),
        )
        assert pdf.startswith(b"%PDF")

    def test_plain_text_body_still_renders(self) -> None:
        # No-regression: a plain body (no markdown syntax) still renders fine,
        # in spirit identical to the old escaped-plain-text behaviour.
        pdf = generate_welcome_manual_pdf(
            WelcomeManualPdfData(
                title="Guide",
                sections=[
                    SectionPdfData(
                        title="Wi-Fi",
                        body="Network: BeachHouse\nPassword: sunny123",
                    ),
                ],
            ),
        )
        assert pdf.startswith(b"%PDF")

    def test_malformed_markdown_does_not_crash(self) -> None:
        for bad in (
            "**unbalanced bold that never closes",
            "a stray < bracket and 3 > 2",
            "| broken | header\n| --- |\n| a | b | c | d |",
            "```\nunclosed code fence",
            "[bad link](javascript:alert(1))",
            "###### ##### #### deeply hashed",
        ):
            pdf = generate_welcome_manual_pdf(
                WelcomeManualPdfData(
                    title="Guide",
                    sections=[SectionPdfData(title="S", body=bad)],
                ),
            )
            assert pdf.startswith(b"%PDF"), bad
