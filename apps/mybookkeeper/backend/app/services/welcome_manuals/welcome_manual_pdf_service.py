"""PDF generation for a guest welcome manual.

Pure function — no DB I/O, no storage, no side effects. Takes the manual's
already-fetched content (including image BYTES) and returns raw PDF bytes.

Uses ``reportlab`` platypus (``SimpleDocTemplate`` + flowables), and the
frozen-dataclass data carrier of
``app.services.leases.receipt_pdf_service.ReceiptData``. The dataclasses live
inline here because they're tightly coupled to this renderer — the canonical
PDF pattern in this codebase keeps the data carrier beside its renderer.

Host-authored prose (each section ``body`` and the manual ``intro_text``) is
**Markdown** and is rendered with ``welcome_manual_markdown_pdf`` so the emailed
PDF matches what the frontend renders with react-markdown + remark-gfm. Short
labels — the manual TITLE, section TITLES and image CAPTIONS — stay plain
escaped text.

Robustness contract:
- A single undecodable / corrupt image is SKIPPED (logged), never crashes the
  whole PDF.
- Malformed Markdown degrades to escaped plain text (see
  ``welcome_manual_markdown_pdf``), never crashes the whole PDF.
- An empty manual (no sections), sections with no body, and sections with no
  images all render cleanly.
"""
from __future__ import annotations

import html as html_mod
import io
import logging
from dataclasses import dataclass, field

from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import LETTER
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import (
    Image,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
)
from reportlab.platypus.flowables import Flowable

from app.services.welcome_manuals.welcome_manual_markdown_pdf import (
    markdown_to_flowables,
)

logger = logging.getLogger(__name__)

# Cap the rendered height of any embedded image so a tall photo can't push the
# rest of the section off the page. Width is bounded by the content area.
_MAX_IMAGE_HEIGHT = 4.0 * inch


@dataclass(frozen=True)
class SectionImagePdfData:
    image_bytes: bytes
    caption: str | None = None


@dataclass(frozen=True)
class SectionPdfData:
    title: str
    body: str | None = None
    images: list[SectionImagePdfData] = field(default_factory=list)


@dataclass(frozen=True)
class WelcomeManualPdfData:
    title: str
    intro_text: str | None = None
    sections: list[SectionPdfData] = field(default_factory=list)


def _build_image_flowable(
    image: SectionImagePdfData,
    content_width: float,
    caption_style: ParagraphStyle,
) -> list[Flowable]:
    """Build the flowables for one image (scaled to fit) + its caption.

    Returns an empty list if the image can't be decoded — a corrupt image must
    never crash the whole PDF.
    """
    try:
        reader = Image(io.BytesIO(image.image_bytes))
    except Exception:  # noqa: BLE001 — defensive; skip undecodable images
        logger.warning(
            "welcome_manual_pdf.skip_image reason=undecodable bytes=%d",
            len(image.image_bytes or b""),
            exc_info=True,
        )
        return []

    intrinsic_w = float(reader.drawWidth) or content_width
    intrinsic_h = float(reader.drawHeight) or _MAX_IMAGE_HEIGHT
    scale = min(
        content_width / intrinsic_w,
        _MAX_IMAGE_HEIGHT / intrinsic_h,
        1.0,
    )
    reader.drawWidth = intrinsic_w * scale
    reader.drawHeight = intrinsic_h * scale

    flowables: list[Flowable] = [Spacer(1, 4), reader]
    if image.caption:
        safe_caption = html_mod.escape(image.caption)
        flowables.append(Paragraph(safe_caption, caption_style))
    flowables.append(Spacer(1, 10))
    return flowables


def generate_welcome_manual_pdf(data: WelcomeManualPdfData) -> bytes:
    """Return raw PDF bytes for a guest welcome manual.

    Pure: depends only on ``data`` (including pre-fetched image bytes).
    """
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=LETTER)
    styles = getSampleStyleSheet()
    title_style = styles["Title"]
    heading_style = styles["Heading2"]
    body_style = styles["BodyText"]
    caption_style = ParagraphStyle(
        "WelcomeManualCaption",
        parent=styles["Italic"],
        fontSize=8,
        textColor="#6b7280",
        spaceBefore=2,
        alignment=TA_CENTER,
    )

    content_width = doc.width

    story: list[Flowable] = [
        Paragraph(html_mod.escape(data.title), title_style),
        Spacer(1, 12),
    ]

    if data.intro_text and data.intro_text.strip():
        story.extend(markdown_to_flowables(data.intro_text, body_style))
        story.append(Spacer(1, 8))

    for section in data.sections:
        story.append(Paragraph(html_mod.escape(section.title), heading_style))
        story.append(Spacer(1, 4))
        if section.body and section.body.strip():
            story.extend(markdown_to_flowables(section.body, body_style))
        for image in section.images:
            story.extend(_build_image_flowable(image, content_width, caption_style))
        story.append(Spacer(1, 10))

    doc.build(story)
    return buffer.getvalue()
