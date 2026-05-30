"""Markdown → reportlab flowables for the guest welcome manual PDF.

Pure module — no DB, no storage, no I/O. ``markdown_to_flowables`` turns a
host-authored Markdown string (a section ``body`` or the manual ``intro_text``)
into reportlab ``Flowable`` objects that ``SimpleDocTemplate`` can render.

Why ``markdown-it-py`` (+ ``mdit-py-plugins`` via the ``gfm-like`` preset): it
is the Python port of the markdown-it family the frontend's react-markdown /
remark-gfm lineage descends from, so the GFM feature set (tables, strikethrough,
autolinks) lines up with what ``frontend/.../ui/Markdown.tsx`` renders in the
browser. It exposes a flat *token stream* rather than only an HTML string, which
maps cleanly onto reportlab flowables. Browser parity is the north star — same
elements supported, not pixel-identity.

Robustness (hard requirement): malformed Markdown or an unsupported node must
NEVER crash the PDF. The converter falls back to escaped plain paragraphs if
parsing raises; each block is rendered defensively so one bad block degrades to
escaped plain text instead of aborting the document. All source text is
HTML-escaped before injection into reportlab inline markup so a literal ``<``
can't break the ``Paragraph`` parser.
"""
from __future__ import annotations

import html as html_mod
import logging
from urllib.parse import urlsplit

from markdown_it import MarkdownIt
from markdown_it.token import Token
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.platypus import (
    HRFlowable,
    ListFlowable,
    ListItem,
    Paragraph,
    Preformatted,
    Spacer,
    Table,
    TableStyle,
)
from reportlab.platypus.flowables import Flowable

logger = logging.getLogger(__name__)

# Markdown heading levels map onto these reportlab style names. ``h1`` in a
# guide must not dwarf the page (the manual TITLE already owns the largest
# style), so headings start one rung below Title and flatten out at h4+ — this
# mirrors the frontend's "scale headings down one level" decision.
_HEADING_STYLE_BY_LEVEL: dict[int, str] = {
    1: "Heading2",
    2: "Heading3",
    3: "Heading4",
    4: "Heading5",
    5: "Heading6",
    6: "Heading6",
}

# Only these URL schemes are emitted as live links; anything else (javascript:,
# data:, vbscript:, file:, …) renders as the link text alone, matching the
# allowlist in the frontend Markdown component (fail-closed).
_ALLOWED_LINK_SCHEMES = frozenset({"http", "https", "mailto"})

_SPACE_AFTER_PARAGRAPH = 6
_SPACE_AFTER_HEADING = 4
_SPACE_AROUND_BLOCK = 8
_LIST_INDENT = 14
_TABLE_PADDING = 4


def _escape(text: str) -> str:
    """Escape text for safe injection into reportlab's ``Paragraph`` markup."""
    return html_mod.escape(text, quote=False)


def _is_safe_link(href: str) -> bool:
    """True when ``href`` uses an allowlisted scheme (fail-closed)."""
    try:
        scheme = urlsplit(href).scheme.lower()
    except ValueError:
        return False
    # Scheme-relative ("//host") and relative ("/path", "page") links have an
    # empty scheme; treat them as safe — they can't carry a javascript: payload.
    return scheme == "" or scheme in _ALLOWED_LINK_SCHEMES


def _render_inline(tokens: list[Token]) -> str:
    """Render an ``inline`` token's children into reportlab inline markup.

    Supports bold (``<b>``), italic (``<i>``), strikethrough (``<strike>``),
    inline code (monospaced ``<font>``), links (``<a href>`` with the URL kept
    visible) and hard breaks. Every text fragment is escaped first. An
    unrecognised inline token degrades to its escaped text content.
    """
    parts: list[str] = []
    for tok in tokens:
        ttype = tok.type
        if ttype == "text":
            parts.append(_escape(tok.content))
        elif ttype == "softbreak":
            parts.append(" ")
        elif ttype == "hardbreak":
            parts.append("<br/>")
        elif ttype == "strong_open":
            parts.append("<b>")
        elif ttype == "strong_close":
            parts.append("</b>")
        elif ttype == "em_open":
            parts.append("<i>")
        elif ttype == "em_close":
            parts.append("</i>")
        elif ttype == "s_open":
            parts.append("<strike>")
        elif ttype == "s_close":
            parts.append("</strike>")
        elif ttype == "code_inline":
            parts.append(f'<font face="Courier">{_escape(tok.content)}</font>')
        elif ttype == "link_open":
            href = tok.attrs.get("href", "")
            href_str = href if isinstance(href, str) else str(href)
            if _is_safe_link(href_str):
                parts.append(f'<a href="{_escape(href_str)}" color="#2563eb">')
            else:
                # Unsafe scheme: drop the anchor, keep the (escaped) link text.
                parts.append("")
        elif ttype == "link_close":
            parts.append("</a>")
        elif ttype == "image":
            # Inline images aren't embedded in the PDF body (section images are
            # a separate, curated upload). Keep the alt text so nothing is lost.
            alt = _escape(tok.content) if tok.content else ""
            if alt:
                parts.append(alt)
        elif ttype == "html_inline":
            # Raw inline HTML is never injected — escape it so it shows as
            # literal text (matches the frontend's no-rehype-raw policy).
            parts.append(_escape(tok.content))
        elif tok.content:
            # Unknown inline token — keep any escaped textual content.
            parts.append(_escape(tok.content))
    rendered = "".join(parts)
    return rendered.strip() if rendered.strip() else rendered


def _append_link_urls(tokens: list[Token], rendered: str) -> str:
    """Append the destination of any explicit link as a trailing ``(url)``.

    A printed PDF hides reportlab's ``<a>`` destination, so to never silently
    drop a link target we surface ``[text](url)`` URLs as ``(url)`` — but NOT
    for autolinks (``markup == "linkify"``, the text already IS the URL) nor
    when the link text already equals the URL.
    """
    suffixes: list[str] = []
    for idx, tok in enumerate(tokens):
        if tok.type != "link_open":
            continue
        href = tok.attrs.get("href", "")
        href_str = href if isinstance(href, str) else str(href)
        if not _is_safe_link(href_str) or not href_str:
            continue
        if tok.markup == "linkify":
            continue
        # Collect the link's visible text to compare against the URL.
        text_parts: list[str] = []
        depth = 1
        for follow in tokens[idx + 1 :]:
            if follow.type == "link_open":
                depth += 1
            elif follow.type == "link_close":
                depth -= 1
                if depth == 0:
                    break
            elif follow.type == "text":
                text_parts.append(follow.content)
        link_text = "".join(text_parts).strip()
        if link_text and link_text != href_str:
            suffixes.append(f"({_escape(href_str)})")
    if suffixes:
        return f"{rendered} {' '.join(suffixes)}"
    return rendered


class _StyleBundle:
    """Resolved reportlab styles for the converter (built once per call)."""

    def __init__(self, base_style: ParagraphStyle) -> None:
        sheet = getSampleStyleSheet()
        self.body = base_style
        self.headings: dict[int, ParagraphStyle] = {
            level: sheet[name] for level, name in _HEADING_STYLE_BY_LEVEL.items()
        }
        self.blockquote = ParagraphStyle(
            "WelcomeManualBlockquote",
            parent=base_style,
            leftIndent=12,
            textColor="#4b5563",
            borderPadding=0,
        )
        self.code_block = ParagraphStyle(
            "WelcomeManualCodeBlock",
            parent=base_style,
            fontName="Courier",
            fontSize=8.5,
            leftIndent=8,
            backColor="#f3f4f6",
            borderPadding=6,
            spaceBefore=2,
            spaceAfter=2,
        )
        self.table_cell = ParagraphStyle(
            "WelcomeManualTableCell",
            parent=base_style,
            fontSize=9,
            leading=12,
        )


def _heading(token: Token, inline: Token, styles: _StyleBundle) -> list[Flowable]:
    level = int(token.tag[1]) if token.tag[1:].isdigit() else 1
    style = styles.headings.get(level, styles.headings[1])
    text = _render_inline(inline.children or [])
    return [Paragraph(text or "&nbsp;", style), Spacer(1, _SPACE_AFTER_HEADING)]


def _paragraph(inline: Token, styles: _StyleBundle) -> list[Flowable]:
    children = inline.children or []
    text = _append_link_urls(children, _render_inline(children))
    if not text:
        return []
    return [Paragraph(text, styles.body), Spacer(1, _SPACE_AFTER_PARAGRAPH)]


def _code_block(token: Token, styles: _StyleBundle) -> list[Flowable]:
    code = token.content.rstrip("\n")
    return [Preformatted(code, styles.code_block), Spacer(1, _SPACE_AFTER_PARAGRAPH)]


def _horizontal_rule() -> list[Flowable]:
    return [
        Spacer(1, 4),
        HRFlowable(width="100%", thickness=0.5, color="#d1d5db"),
        Spacer(1, _SPACE_AFTER_PARAGRAPH),
    ]


def _consume_list(
    tokens: list[Token], start: int, styles: _StyleBundle
) -> tuple[ListFlowable, int]:
    """Build a (possibly nested) ``ListFlowable`` from a ``*_list_open`` token.

    Returns the flowable and the index of the token AFTER the matching
    ``*_list_close``. Nested lists recurse — a ``bullet_list_open`` /
    ``ordered_list_open`` encountered inside a list item is consumed in place.
    """
    open_tok = tokens[start]
    ordered = open_tok.type == "ordered_list_open"
    items: list[ListItem] = []
    idx = start + 1
    depth = 1
    while idx < len(tokens) and depth > 0:
        tok = tokens[idx]
        if tok.type in ("bullet_list_close", "ordered_list_close"):
            depth -= 1
            idx += 1
            continue
        if tok.type == "list_item_open":
            item_flowables, idx = _consume_list_item(tokens, idx, styles)
            if item_flowables:
                items.append(ListItem(item_flowables, leftIndent=_LIST_INDENT))
            continue
        idx += 1
    bullet_type = "1" if ordered else "bullet"
    list_flowable = ListFlowable(
        items,
        bulletType=bullet_type,
        leftIndent=_LIST_INDENT,
        bulletFontName="Helvetica",
    )
    return list_flowable, idx


def _consume_list_item(
    tokens: list[Token], start: int, styles: _StyleBundle
) -> tuple[list[Flowable], int]:
    """Build the flowables for one ``list_item_open`` … ``list_item_close``."""
    flowables: list[Flowable] = []
    idx = start + 1
    while idx < len(tokens):
        tok = tokens[idx]
        if tok.type == "list_item_close":
            idx += 1
            break
        if tok.type in ("bullet_list_open", "ordered_list_open"):
            nested, idx = _consume_list(tokens, idx, styles)
            flowables.append(nested)
            continue
        if tok.type == "paragraph_open":
            inline = tokens[idx + 1] if idx + 1 < len(tokens) else None
            if inline is not None and inline.type == "inline":
                children = inline.children or []
                text = _append_link_urls(children, _render_inline(children))
                if text:
                    flowables.append(Paragraph(text, styles.body))
            idx += 3  # paragraph_open, inline, paragraph_close
            continue
        idx += 1
    return flowables, idx


def _consume_table(
    tokens: list[Token], start: int, styles: _StyleBundle
) -> tuple[Flowable | None, int]:
    """Build a reportlab ``Table`` from a GFM ``table_open`` block.

    Degrades to ``None`` (caller skips) if the table has no rows. Cell content
    is rendered through the inline pipeline so bold/links inside cells survive.
    """
    rows: list[list[Paragraph]] = []
    current: list[Paragraph] = []
    header_row_count = 0
    in_header = False
    idx = start + 1
    while idx < len(tokens):
        tok = tokens[idx]
        if tok.type == "table_close":
            idx += 1
            break
        if tok.type == "thead_open":
            in_header = True
        elif tok.type == "thead_close":
            in_header = False
        elif tok.type == "tr_open":
            current = []
        elif tok.type == "tr_close":
            if current:
                rows.append(current)
                if in_header:
                    header_row_count += 1
        elif tok.type in ("th_open", "td_open"):
            inline = tokens[idx + 1] if idx + 1 < len(tokens) else None
            cell_text = ""
            if inline is not None and inline.type == "inline":
                children = inline.children or []
                cell_text = _append_link_urls(children, _render_inline(children))
            current.append(Paragraph(cell_text or "&nbsp;", styles.table_cell))
        idx += 1

    if not rows:
        return None, idx

    # Normalise ragged rows so reportlab's Table doesn't choke.
    width = max(len(r) for r in rows)
    for r in rows:
        while len(r) < width:
            r.append(Paragraph("&nbsp;", styles.table_cell))

    table = Table(rows, hAlign="LEFT")
    table_style: list[tuple[object, ...]] = [
        ("GRID", (0, 0), (-1, -1), 0.5, "#d1d5db"),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), _TABLE_PADDING),
        ("RIGHTPADDING", (0, 0), (-1, -1), _TABLE_PADDING),
        ("TOPPADDING", (0, 0), (-1, -1), _TABLE_PADDING),
        ("BOTTOMPADDING", (0, 0), (-1, -1), _TABLE_PADDING),
    ]
    if header_row_count:
        table_style.append(
            ("BACKGROUND", (0, 0), (-1, header_row_count - 1), "#f3f4f6")
        )
    table.setStyle(TableStyle(table_style))
    return table, idx


def _blockquote(
    tokens: list[Token], start: int, styles: _StyleBundle
) -> tuple[list[Flowable], int]:
    """Render a blockquote's inner paragraphs as indented styled paragraphs."""
    flowables: list[Flowable] = []
    idx = start + 1
    depth = 1
    while idx < len(tokens) and depth > 0:
        tok = tokens[idx]
        if tok.type == "blockquote_open":
            depth += 1
        elif tok.type == "blockquote_close":
            depth -= 1
            idx += 1
            continue
        elif tok.type == "inline":
            children = tok.children or []
            text = _append_link_urls(children, _render_inline(children))
            if text:
                flowables.append(Paragraph(text, styles.blockquote))
        idx += 1
    if flowables:
        flowables.append(Spacer(1, _SPACE_AFTER_PARAGRAPH))
    return flowables, idx


def _plain_text_fallback(md_text: str, style: ParagraphStyle) -> list[Flowable]:
    """Escaped-plain-text rendering — the safety net when Markdown fails.

    Mirrors the historical ``_escape_paragraphs`` behaviour: split on blank
    lines, escape, single newline → ``<br/>``.
    """
    flowables: list[Flowable] = []
    for raw in md_text.split("\n\n"):
        chunk = raw.strip()
        if not chunk:
            continue
        safe = _escape(chunk).replace("\n", "<br/>")
        try:
            flowables.append(Paragraph(safe, style))
        except Exception:  # noqa: BLE001 — last-resort; never crash the PDF
            logger.warning("welcome_manual_md.plain_fallback_failed", exc_info=True)
            continue
        flowables.append(Spacer(1, _SPACE_AFTER_PARAGRAPH))
    return flowables


def _render_block(
    tokens: list[Token], idx: int, styles: _StyleBundle
) -> tuple[list[Flowable], int]:
    """Render the block starting at ``tokens[idx]`` → (flowables, next index).

    A failure rendering any single block is caught and degraded to escaped
    plain text for that block's raw content, never aborting the document.
    """
    tok = tokens[idx]
    try:
        if tok.type == "heading_open":
            inline = tokens[idx + 1]
            return _heading(tok, inline, styles), idx + 3
        if tok.type == "paragraph_open":
            inline = tokens[idx + 1]
            return _paragraph(inline, styles), idx + 3
        if tok.type == "fence" or tok.type == "code_block":
            return _code_block(tok, styles), idx + 1
        if tok.type == "hr":
            return _horizontal_rule(), idx + 1
        if tok.type in ("bullet_list_open", "ordered_list_open"):
            list_flowable, next_idx = _consume_list(tokens, idx, styles)
            return [list_flowable, Spacer(1, _SPACE_AFTER_PARAGRAPH)], next_idx
        if tok.type == "blockquote_open":
            return _blockquote(tokens, idx, styles)
        if tok.type == "table_open":
            table, next_idx = _consume_table(tokens, idx, styles)
            if table is None:
                return [], next_idx
            return [table, Spacer(1, _SPACE_AROUND_BLOCK)], next_idx
        if tok.type == "html_block":
            # Raw HTML is never injected — render it as escaped plain text so
            # the content is preserved (not dropped) and not interpreted.
            return _plain_text_fallback(tok.content or "", styles.body), idx + 1
    except Exception:  # noqa: BLE001 — degrade one block, never crash the PDF
        logger.warning(
            "welcome_manual_md.block_render_failed type=%s",
            tok.type,
            exc_info=True,
        )
        fallback = _plain_text_fallback(tok.content or "", styles.body)
        return fallback, idx + 1
    # Unrecognised block-level token (e.g. html_block) — skip it.
    return [], idx + 1


def markdown_to_flowables(
    md_text: str, body_style: ParagraphStyle
) -> list[Flowable]:
    """Convert host-authored Markdown into reportlab flowables.

    Pure: depends only on ``md_text`` and ``body_style``. GFM subset supported —
    paragraphs, bold/italic/strikethrough/inline-code, headings (h1–h6), bullet
    + ordered + nested lists, links (URL preserved), blockquotes, fenced code
    blocks, horizontal rules and tables.

    Robustness: if Markdown parsing or top-level conversion raises, the entire
    text degrades to escaped plain-text paragraphs; per-block failures degrade
    only that block. The PDF always builds.
    """
    if not md_text or not md_text.strip():
        return []

    styles = _StyleBundle(body_style)

    try:
        md = MarkdownIt("gfm-like")
        tokens = md.parse(md_text)
    except Exception:  # noqa: BLE001 — malformed input must not crash the PDF
        logger.warning("welcome_manual_md.parse_failed", exc_info=True)
        return _plain_text_fallback(md_text, body_style)

    flowables: list[Flowable] = []
    idx = 0
    while idx < len(tokens):
        block_flowables, next_idx = _render_block(tokens, idx, styles)
        flowables.extend(block_flowables)
        # Guarantee forward progress even if a handler returns the same index.
        idx = next_idx if next_idx > idx else idx + 1

    if not flowables:
        return _plain_text_fallback(md_text, body_style)
    return flowables
