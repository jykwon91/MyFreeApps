"""Unit tests for the pure Markdown → reportlab-flowables converter.

The converter (``markdown_to_flowables``) turns host-authored Markdown (a
section body or the manual intro) into reportlab flowables. These tests assert
each supported GFM feature produces structured flowables, that link URLs are
preserved, that unsafe link schemes degrade to plain text, and — the hard
robustness contract — that malformed Markdown never raises.
"""
from __future__ import annotations

from reportlab.lib.styles import getSampleStyleSheet
from reportlab.platypus import (
    HRFlowable,
    ListFlowable,
    Paragraph,
    Preformatted,
    Table,
)
from reportlab.platypus.flowables import Flowable

from app.services.welcome_manuals.welcome_manual_markdown_pdf import (
    markdown_to_flowables,
)


def _body_style():
    return getSampleStyleSheet()["BodyText"]


def _render(md: str) -> list[Flowable]:
    return markdown_to_flowables(md, _body_style())


def _paragraph_texts(flowables: list[Flowable]) -> list[str]:
    return [f.text for f in flowables if isinstance(f, Paragraph)]


class TestEmptyAndPlain:
    def test_empty_string_returns_no_flowables(self) -> None:
        assert markdown_to_flowables("", _body_style()) == []

    def test_whitespace_only_returns_no_flowables(self) -> None:
        assert markdown_to_flowables("   \n  \n", _body_style()) == []

    def test_plain_paragraph_renders_as_paragraph(self) -> None:
        flowables = _render("Just a simple sentence with no markup.")
        texts = _paragraph_texts(flowables)
        assert any("Just a simple sentence" in t for t in texts)

    def test_plain_multiline_body_renders_each_paragraph(self) -> None:
        flowables = _render("First paragraph.\n\nSecond paragraph.")
        texts = _paragraph_texts(flowables)
        assert any("First paragraph" in t for t in texts)
        assert any("Second paragraph" in t for t in texts)


class TestInlineMarkup:
    def test_bold_maps_to_b_tag(self) -> None:
        texts = _paragraph_texts(_render("This is **bold** text."))
        assert any("<b>bold</b>" in t for t in texts)

    def test_italic_maps_to_i_tag(self) -> None:
        texts = _paragraph_texts(_render("This is *italic* text."))
        assert any("<i>italic</i>" in t for t in texts)

    def test_strikethrough_maps_to_strike_tag(self) -> None:
        texts = _paragraph_texts(_render("This is ~~gone~~ now."))
        assert any("<strike>gone</strike>" in t for t in texts)

    def test_inline_code_maps_to_courier_font(self) -> None:
        texts = _paragraph_texts(_render("Run `npm test` first."))
        assert any('<font face="Courier">npm test</font>' in t for t in texts)

    def test_inline_code_with_angle_bracket_is_escaped(self) -> None:
        # A literal < inside code must be escaped so it can't break the
        # Paragraph mini-language parser.
        texts = _paragraph_texts(_render("Use `a < b` carefully."))
        assert any("&lt;" in t for t in texts)
        # And rendering must not have raised.
        assert texts


class TestHeadings:
    def test_h1_renders_a_paragraph(self) -> None:
        texts = _paragraph_texts(_render("# Top heading"))
        assert any("Top heading" in t for t in texts)

    def test_h2_and_h3_render(self) -> None:
        flowables = _render("## Second\n\n### Third")
        texts = _paragraph_texts(flowables)
        assert any("Second" in t for t in texts)
        assert any("Third" in t for t in texts)

    def test_deep_heading_does_not_crash(self) -> None:
        # h6 still maps to a valid style; h7+ syntax is treated as text by GFM.
        assert _render("###### Deep heading")


class TestLists:
    def test_bullet_list_produces_list_flowable(self) -> None:
        flowables = _render("- one\n- two\n- three")
        assert any(isinstance(f, ListFlowable) for f in flowables)

    def test_ordered_list_produces_list_flowable(self) -> None:
        flowables = _render("1. first\n2. second")
        assert any(isinstance(f, ListFlowable) for f in flowables)

    def test_nested_list_renders_without_error(self) -> None:
        md = "- parent a\n  - child a1\n  - child a2\n- parent b"
        flowables = _render(md)
        list_flowables = [f for f in flowables if isinstance(f, ListFlowable)]
        assert list_flowables
        # The top-level list exists; nested list is embedded inside its items.
        assert len(list_flowables) >= 1


class TestLinks:
    def test_link_url_is_preserved(self) -> None:
        texts = _paragraph_texts(_render("See [our guide](https://example.com)."))
        joined = " ".join(texts)
        # The destination is never silently dropped — it appears either as an
        # <a href> or as a trailing (url).
        assert "https://example.com" in joined

    def test_bare_url_autolinks_without_duplicate_suffix(self) -> None:
        texts = _paragraph_texts(_render("Visit https://bare.example.com today."))
        joined = " ".join(texts)
        assert "https://bare.example.com" in joined
        # Autolink text already IS the URL, so no trailing "(url)" suffix is
        # added (that suffix is reserved for explicit [text](url) links).
        assert "today." in joined
        assert ") today" not in joined

    def test_unsafe_scheme_link_renders_as_inert_text(self) -> None:
        # markdown-it's link validator rejects javascript: — the syntax is left
        # as literal (inert) text rather than becoming a clickable anchor. The
        # security property that matters: it is NOT a live <a href> link.
        texts = _paragraph_texts(_render("[click](javascript:alert(1))"))
        joined = " ".join(texts)
        assert "click" in joined
        assert "<a href" not in joined

    def test_mailto_link_is_allowed(self) -> None:
        texts = _paragraph_texts(_render("[email](mailto:host@example.com)"))
        joined = " ".join(texts)
        assert "mailto:host@example.com" in joined


class TestBlockElements:
    def test_blockquote_renders_paragraph(self) -> None:
        texts = _paragraph_texts(_render("> Be quiet after 10pm."))
        assert any("Be quiet after 10pm" in t for t in texts)

    def test_fenced_code_block_renders_preformatted(self) -> None:
        flowables = _render("```\nwifi: GuestNet\npass: 12345\n```")
        assert any(isinstance(f, Preformatted) for f in flowables)

    def test_horizontal_rule_renders_hrflowable(self) -> None:
        flowables = _render("Above\n\n---\n\nBelow")
        assert any(isinstance(f, HRFlowable) for f in flowables)

    def test_table_renders_table_flowable(self) -> None:
        md = "| Item | Qty |\n|------|-----|\n| Towels | 4 |\n| Mugs | 6 |"
        flowables = _render(md)
        assert any(isinstance(f, Table) for f in flowables)

    def test_table_cell_content_preserved(self) -> None:
        md = "| Item | Qty |\n|------|-----|\n| Towels | 4 |"
        flowables = _render(md)
        tables = [f for f in flowables if isinstance(f, Table)]
        assert tables
        cell_texts = [
            cell.text
            for row in tables[0]._cellvalues  # noqa: SLF001 — test introspection
            for cell in row
            if isinstance(cell, Paragraph)
        ]
        assert any("Towels" in t for t in cell_texts)


class TestMixedContent:
    def test_mixed_document_renders_all_block_types(self) -> None:
        md = (
            "# Welcome\n\n"
            "Some **bold** intro.\n\n"
            "## Wi-Fi\n\n"
            "- SSID: GuestNet\n"
            "- Pass: `sunny123`\n\n"
            "1. Step one\n2. Step two\n\n"
            "> Quiet hours after 10pm.\n\n"
            "```\nemergency: 911\n```\n\n"
            "---\n\n"
            "Contact [host](https://host.example.com)."
        )
        flowables = _render(md)
        assert any(isinstance(f, Paragraph) for f in flowables)
        assert any(isinstance(f, ListFlowable) for f in flowables)
        assert any(isinstance(f, Preformatted) for f in flowables)
        assert any(isinstance(f, HRFlowable) for f in flowables)


class TestRobustness:
    """Malformed Markdown must NEVER raise — it degrades, the PDF still builds."""

    def test_unbalanced_bold_does_not_raise(self) -> None:
        assert _render("This **never closes the bold")

    def test_stray_angle_bracket_does_not_raise(self) -> None:
        flowables = _render("Use a < b and 3 > 2 in math.")
        # The stray < is escaped, not interpreted as a tag.
        assert _paragraph_texts(flowables)

    def test_broken_table_does_not_raise(self) -> None:
        # A malformed/ragged table must not crash; it either renders a degraded
        # table or plain text — never raises.
        assert _render("| only one column header\n| --- |\n| a | b | c |")

    def test_unclosed_code_fence_does_not_raise(self) -> None:
        assert _render("```\nstart of code that never closes")

    def test_deeply_nested_lists_do_not_raise(self) -> None:
        md = "- a\n  - b\n    - c\n      - d\n        - e"
        assert _render(md)

    def test_html_in_source_is_escaped_not_injected(self) -> None:
        # A line starting with <script> is a CommonMark html_block — the whole
        # line is raw HTML and is escaped (never injected), preserving the text
        # without becoming a live tag. This matches the frontend's
        # no-rehype-raw policy.
        flowables = _render("<script>alert('x')</script> and **safe**")
        texts = _paragraph_texts(flowables)
        joined = " ".join(texts)
        # The raw script tag must be escaped (no live <script>).
        assert "<script>" not in joined
        assert "&lt;script&gt;" in joined
        # Content is preserved (not silently dropped).
        assert "safe" in joined

    def test_inline_html_is_escaped(self) -> None:
        # Inline raw HTML (mid-paragraph) is escaped, not injected, while real
        # markdown around it still renders.
        flowables = _render("Be **careful** with <b>raw</b> html.")
        joined = " ".join(_paragraph_texts(flowables))
        assert "<b>careful</b>" in joined  # real markdown bold
        assert "&lt;b&gt;raw&lt;/b&gt;" in joined  # escaped raw html
