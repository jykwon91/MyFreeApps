"""Markdown → DOCX / PDF export pipeline for refined resumes.

Per the spec, the conversion fidelity is non-negotiable: company
names, dates, and section headings present in the markdown MUST
appear in the rendered document. The constrained markdown subset
emitted by ``markdown_renderer`` and enforced by the rewrite prompt
guarantees compatible input.

Tools:
- DOCX: pandoc native (``pandoc -f markdown -t docx``).
- PDF:  pandoc → HTML5, then weasyprint → PDF. Avoids requiring a
  TeX install in the runtime image.

Both paths produce text-selectable output suitable for ATS uploads
(no rasterized layouts, no embedded fonts the parser can't read).
"""
from __future__ import annotations

import asyncio
import io
import logging
import re
import shutil
from typing import Literal

logger = logging.getLogger(__name__)

ExportFormat = Literal["docx", "pdf"]

# Default print stylesheet for the PDF path. Single-column, generous
# margins, ATS-friendly font fallbacks. Kept inline so the pipeline
# is fully self-contained — no static assets to ship.
_PDF_CSS = """\
@page { size: Letter; margin: 0.6in 0.7in; }
body {
  font-family: "Liberation Serif", "DejaVu Serif", Georgia, serif;
  font-size: 11pt;
  line-height: 1.35;
  color: #111;
}
h1 {
  font-size: 18pt;
  font-weight: bold;
  margin: 0 0 4pt 0;
  border-bottom: 1px solid #999;
  padding-bottom: 2pt;
}
h2 {
  font-size: 13pt;
  font-weight: bold;
  margin: 14pt 0 4pt 0;
  text-transform: uppercase;
  letter-spacing: 0.5pt;
}
h3 {
  font-size: 11.5pt;
  font-weight: bold;
  margin: 8pt 0 2pt 0;
}
p, ul, ol { margin: 0 0 4pt 0; }
ul { padding-left: 18pt; }
li { margin-bottom: 2pt; }
em { color: #444; font-style: italic; }
strong { font-weight: bold; }
"""


class ExportFidelityError(RuntimeError):
    """The exported document is missing facts the source markdown carries."""

    def __init__(self, missing_facts: list[str]):
        super().__init__(
            f"Exported document missing facts: {', '.join(missing_facts[:5])}"
        )
        self.missing_facts = missing_facts


async def export_resume(markdown: str, fmt: ExportFormat) -> bytes:
    """Convert resume markdown to the requested document format.

    Args:
        markdown: Resume in the constrained markdown subset.
        fmt: ``'docx'`` or ``'pdf'``.

    Returns:
        Raw bytes of the rendered document.

    Raises:
        ValueError: when ``fmt`` is unsupported.
        RuntimeError: when the underlying tool fails or is missing.
        ExportFidelityError: when the round-trip check finds missing facts.
    """
    if fmt == "docx":
        out = await _markdown_to_docx(markdown)
    elif fmt == "pdf":
        out = await _markdown_to_pdf(markdown)
    else:
        raise ValueError(f"Unsupported export format: {fmt!r}")

    _verify_round_trip(markdown=markdown, output_bytes=out, fmt=fmt)
    return out


async def _markdown_to_docx(markdown: str) -> bytes:
    if shutil.which("pandoc") is None:
        raise RuntimeError(
            "pandoc binary not found; backend image must install it."
        )

    proc = await asyncio.create_subprocess_exec(
        "pandoc",
        "-f", "markdown",
        "-t", "docx",
        stdin=asyncio.subprocess.PIPE,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, stderr = await proc.communicate(markdown.encode("utf-8"))
    if proc.returncode != 0:
        raise RuntimeError(
            f"pandoc DOCX conversion failed: {stderr.decode('utf-8', 'ignore')[:500]}"
        )
    return stdout


async def _markdown_to_pdf(markdown: str) -> bytes:
    """Convert markdown → HTML5 (pandoc) → PDF (weasyprint)."""
    if shutil.which("pandoc") is None:
        raise RuntimeError(
            "pandoc binary not found; backend image must install it."
        )

    proc = await asyncio.create_subprocess_exec(
        "pandoc",
        "-f", "markdown",
        "-t", "html5",
        "--standalone",
        "--metadata", "title=Resume",
        stdin=asyncio.subprocess.PIPE,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    html_bytes, stderr = await proc.communicate(markdown.encode("utf-8"))
    if proc.returncode != 0:
        raise RuntimeError(
            f"pandoc HTML conversion failed: {stderr.decode('utf-8', 'ignore')[:500]}"
        )

    html = html_bytes.decode("utf-8")
    return await asyncio.to_thread(_html_to_pdf_bytes, html)


def _html_to_pdf_bytes(html: str) -> bytes:
    # Lazy import keeps weasyprint's heavy graph out of cold-start paths
    # that don't need it.
    from weasyprint import CSS, HTML

    buffer = io.BytesIO()
    HTML(string=html).write_pdf(target=buffer, stylesheets=[CSS(string=_PDF_CSS)])
    return buffer.getvalue()


def _verify_round_trip(*, markdown: str, output_bytes: bytes, fmt: ExportFormat) -> None:
    """Round-trip the rendered output back to text and assert key facts survive.

    Per the spec: company names + dates + section headings must appear
    in the output. We extract those tokens from the markdown and grep
    the output text. If any are missing, raise ExportFidelityError so
    the API retries (or surfaces the error to the user).
    """
    expected = _extract_anchor_tokens(markdown)
    if not expected:
        return

    text = _output_to_text(output_bytes, fmt)
    text_lc = text.lower()

    missing: list[str] = []
    for token in expected:
        if token.lower() not in text_lc:
            missing.append(token)

    if missing:
        logger.warning(
            "Export round-trip missing %d tokens (fmt=%s): %s",
            len(missing),
            fmt,
            missing[:5],
        )
        raise ExportFidelityError(missing)


def _extract_anchor_tokens(markdown: str) -> list[str]:
    """Return tokens that MUST survive the export — company-like names,
    dates, and section headings.

    Conservative: misses some fancy multi-word entities, but never
    invents anchors. The goal is "pass when in doubt" — only flag clear
    deletions.
    """
    tokens: list[str] = []

    # Section headings (## Foo, # Foo).
    for match in re.finditer(r"^#{1,6}\s+(.+?)\s*$", markdown, re.MULTILINE):
        heading = match.group(1).strip()
        # Strip markdown decoration (bold/italic) for anchor matching.
        cleaned = re.sub(r"[\*_`]", "", heading).strip()
        if cleaned:
            tokens.append(cleaned)

    # Years and date ranges (very strict — any 4-digit year preceded by
    # whitespace and followed by space/dash/end).
    for match in re.finditer(r"\b((?:19|20)\d{2})\b", markdown):
        tokens.append(match.group(1))

    # Bold tokens — usually company / school names in this format.
    for match in re.finditer(r"\*\*([^*\n]{2,80})\*\*", markdown):
        bold = match.group(1).strip()
        # Skip purely descriptive bold ("Languages:", "Frameworks:").
        if bold.endswith(":"):
            continue
        tokens.append(bold)

    # Deduplicate while preserving order.
    seen: set[str] = set()
    out: list[str] = []
    for tok in tokens:
        if tok not in seen:
            seen.add(tok)
            out.append(tok)
    return out


def _output_to_text(data: bytes, fmt: ExportFormat) -> str:
    if fmt == "pdf":
        try:
            from pypdf import PdfReader

            reader = PdfReader(io.BytesIO(data))
            return "\n".join((page.extract_text() or "") for page in reader.pages)
        except Exception:  # noqa: BLE001 — round-trip is best-effort
            logger.warning("PDF text extraction failed during round-trip", exc_info=True)
            return ""
    if fmt == "docx":
        try:
            import mammoth

            with io.BytesIO(data) as buf:
                result = mammoth.extract_raw_text(buf)
                return result.value or ""
        except Exception:  # noqa: BLE001
            logger.warning("DOCX text extraction failed during round-trip", exc_info=True)
            return ""
    return ""
