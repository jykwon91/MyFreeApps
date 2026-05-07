"""Substitute placeholder values into template source text.

Supports three input forms:
- Markdown / plain text — pure ``str.replace`` after sorting keys longest-first
  so ``[NUMBER OF DAYS]`` substitutes before ``[NUMBER]``.
- DOCX — uses ``python-docx`` if available. DOCX splits text across multiple
  ``runs`` whenever formatting changes, so a placeholder like
  ``[TENANT FULL NAME]`` may be split as ``[TENANT``, ``FULL``, ``NAME]``
  across three runs. We merge consecutive runs in each paragraph before
  substituting, then preserve the merged formatting (font of the first run).
- PDF output (rendered_original) — generated via ``reportlab`` from the
  rendered Markdown. We avoid weasyprint due to its native dependency
  footprint on Windows (per the spec's stop conditions).

When ``python-docx`` is not installed (e.g. in CI without the optional dep),
``render_docx_bytes`` falls back to MD rendering of the extracted text — the
caller is told the fallback fired so it can record the limitation.

Signature placeholders (any bracketed key matching ``*SIGNATURE``) get a
special substitution: a long underscore line, drawn at render time, so the
rendered doc has a blank signing line in place of literal
``[LANDLORD SIGNATURE]`` text. Signatures are applied at signing time, not
generation time.
"""
from __future__ import annotations

import io
import logging
import re

logger = logging.getLogger(__name__)

SIGNATURE_LINE = "_______________________________"
_SIGNATURE_KEY_RE = re.compile(r"\[([A-Z][A-Z0-9 _\-]*?SIGNATURE)\]")


def _augment_with_signature_lines(
    template_text: str, values: dict[str, str],
) -> dict[str, str]:
    """Return ``values`` with any unfilled ``*SIGNATURE`` keys mapped to a blank line.

    Scans ``template_text`` for bracketed signature keys not already in
    ``values`` and adds them with the underscore signature line. The
    caller's ``values`` dict is not mutated.
    """
    augmented = dict(values)
    for match in _SIGNATURE_KEY_RE.finditer(template_text):
        key = match.group(1)
        if key not in augmented:
            augmented[key] = SIGNATURE_LINE
    return augmented


def _build_substitution_pattern(values: dict[str, str]) -> list[tuple[str, str]]:
    """Return ``[(bracketed_key, replacement_value)]`` sorted longest-key-first.

    Sorting longest-first prevents partial overlap: ``[NUMBER OF DAYS]`` must
    be replaced before ``[NUMBER]`` or the latter would gobble the prefix.
    """
    items = [(f"[{key}]", str(value if value is not None else "")) for key, value in values.items()]
    items.sort(key=lambda kv: len(kv[0]), reverse=True)
    return items


def render_md(template_text: str, values: dict[str, str]) -> str:
    """Replace ``[KEY]`` tokens in ``template_text`` with ``values[KEY]``.

    Pure function. Unknown keys (placeholders not in ``values``) are left as
    bracketed text so the host can spot them in the rendered output. Any
    ``*SIGNATURE`` placeholder absent from ``values`` is replaced with a
    blank signature line.
    """
    augmented = _augment_with_signature_lines(template_text, values)
    output = template_text
    for needle, replacement in _build_substitution_pattern(augmented):
        output = output.replace(needle, replacement)
    return output


def render_docx_bytes(
    docx_bytes: bytes,
    values: dict[str, str],
) -> tuple[bytes, bool]:
    """Render a DOCX file's bytes with placeholder substitutions.

    Returns ``(rendered_bytes, used_docx_library)``. When ``python-docx`` is
    not installed, ``used_docx_library`` is False and the original bytes are
    returned unchanged — the caller should fall back to a generated MD file.
    """
    try:
        import docx  # type: ignore[import-untyped]
    except ImportError:
        logger.warning(
            "python-docx not installed — DOCX rendering disabled, returning original bytes",
        )
        return docx_bytes, False

    try:
        document = docx.Document(io.BytesIO(docx_bytes))
    except Exception:  # noqa: BLE001
        logger.warning("Failed to parse DOCX bytes — returning original", exc_info=True)
        return docx_bytes, False

    # Walk every paragraph (top-level + table cells) to find SIGNATURE keys
    # the caller didn't supply, so the rendered doc shows a blank signing line.
    # Known limitation: section headers/footers and tables nested inside table
    # cells are not walked. The same paragraphs are also untouched by
    # ``_substitute_in_paragraphs`` below, so this mirrors the existing
    # substitution scope rather than expanding it.
    all_text_chunks: list[str] = []
    for paragraph in document.paragraphs:
        all_text_chunks.append("".join(run.text for run in paragraph.runs))
    for table in document.tables:
        for row in table.rows:
            for cell in row.cells:
                for paragraph in cell.paragraphs:
                    all_text_chunks.append("".join(run.text for run in paragraph.runs))
    augmented = _augment_with_signature_lines("\n".join(all_text_chunks), values)

    pattern = _build_substitution_pattern(augmented)
    _substitute_in_paragraphs(document.paragraphs, pattern)
    for table in document.tables:
        for row in table.rows:
            for cell in row.cells:
                _substitute_in_paragraphs(cell.paragraphs, pattern)

    out = io.BytesIO()
    document.save(out)
    return out.getvalue(), True


def _substitute_in_paragraphs(paragraphs, pattern: list[tuple[str, str]]) -> None:
    """Merge runs in each paragraph, then substitute. ``pattern`` is longest-first.

    The merge step is necessary because Word splits a single visual placeholder
    across multiple runs whenever formatting changes mid-token. If we don't
    merge, ``str.replace`` will not find the bracketed key.
    """
    for paragraph in paragraphs:
        runs = paragraph.runs
        if not runs:
            continue
        # Merge: concatenate all run text into the first run, blank the rest.
        merged_text = "".join(run.text for run in runs)
        for needle, replacement in pattern:
            merged_text = merged_text.replace(needle, replacement)
        runs[0].text = merged_text
        for run in runs[1:]:
            run.text = ""


def render_pdf_from_text(rendered_text: str) -> bytes:
    """Generate a simple PDF from rendered plain/markdown text via ``reportlab``.

    This is intentionally low-fidelity for Phase 1 — it lays out paragraphs
    on letter-size pages with a default font and no markdown styling. The
    fidelity story improves in Phase 2 once we're confident enough to add
    weasyprint or pandoc as a dep.
    """
    try:
        from reportlab.lib.pagesizes import LETTER
        from reportlab.lib.styles import getSampleStyleSheet
        from reportlab.platypus import (
            Paragraph,
            SimpleDocTemplate,
            Spacer,
        )
    except ImportError:  # pragma: no cover — reportlab is in pyproject deps
        raise RuntimeError("reportlab is required for PDF rendering") from None

    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=LETTER)
    styles = getSampleStyleSheet()
    body_style = styles["BodyText"]

    story = []
    for raw_paragraph in rendered_text.split("\n\n"):
        text = raw_paragraph.strip()
        if not text:
            story.append(Spacer(1, 12))
            continue
        # Preserve single newlines as <br/> within a paragraph for reportlab.
        safe = (
            text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
        ).replace("\n", "<br/>")
        story.append(Paragraph(safe, body_style))
        story.append(Spacer(1, 8))

    doc.build(story)
    return buffer.getvalue()
