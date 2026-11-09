"""Security regression tests for the resume export pipeline.

The resume markdown is fully user-controlled (set via the custom /
target-from-line endpoints), so the PDF path must not let an injected
resource reference turn into a server-side fetch. See
``export_service._pdf_url_fetcher`` and the ``-raw_html`` pandoc flag.
"""
import asyncio
import shutil
import sys

import pytest

from app.services.resume_refinement import export_service


class TestPdfUrlFetcherBlocksSSRF:
    """The authoritative control: only ``data:`` URIs may be fetched."""

    @pytest.fixture(autouse=True)
    def _needs_weasyprint(self):
        try:
            import weasyprint  # noqa: F401
        except Exception as exc:  # OSError when pango/cairo are absent locally
            pytest.skip(f"weasyprint unavailable: {exc}")

    @pytest.mark.parametrize(
        "url",
        [
            "file:///etc/passwd",  # local file read
            "file://C:/Users/x/.env",  # local file read (Windows form)
            "http://169.254.169.254/latest/meta-data/",  # cloud metadata SSRF
            "http://127.0.0.1:8002/internal-only",  # loopback SSRF
            "http://minio:9000/bucket",  # sibling-service SSRF
            "https://attacker.example/pixel.png",  # exfil / tracking
            "ftp://host/secret",
            "gopher://host/_",
            "",  # not a URI -> blocked
        ],
    )
    def test_non_data_urls_are_blocked(self, url):
        with pytest.raises(ValueError):
            export_service._pdf_url_fetcher().fetch(url)

    def test_data_uri_is_allowed(self):
        response = export_service._pdf_url_fetcher().fetch("data:text/plain,hi")
        assert response.read() == b"hi"

    def test_a_blocked_resource_is_skipped_and_the_pdf_still_renders(self):
        pixel = (
            "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJ"
            "AAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
        )
        html = (
            f'<p>Jane Doe</p><img src="{pixel}">'
            '<img src="file:///etc/passwd"><img src="http://127.0.0.1:1/x.png">'
        )
        assert export_service._html_to_pdf_bytes(html).startswith(b"%PDF")


@pytest.mark.skipif(
    shutil.which("pandoc") is None or sys.platform == "win32",
    reason="needs pandoc; asyncio subprocess unsupported on the win32 selector loop",
)
class TestPandocNeutralizesRawHtml:
    """Defence in depth: raw HTML in the draft must not survive to the sink."""

    def _html_for(self, markdown: str) -> str:
        captured: dict[str, str] = {}

        def _capture(html: str) -> bytes:
            captured["html"] = html
            return b"%PDF-1.7"

        # Intercept the weasyprint sink so this test needs no native libs.
        original = export_service._html_to_pdf_bytes
        export_service._html_to_pdf_bytes = _capture
        try:
            asyncio.run(export_service._markdown_to_pdf(markdown))
        finally:
            export_service._html_to_pdf_bytes = original
        return captured["html"]

    def test_injected_raw_img_and_style_are_escaped(self):
        md = (
            "# Jane\n\n"
            '- probe <img src="http://127.0.0.1:8002/internal-only">\n'
            '- <style>@import url("http://169.254.169.254/latest/meta-data/");</style>\n'
        )
        html = self._html_for(md)
        # The raw tags must be neutralized, not present as live elements.
        assert '<img src="http://127.0.0.1:8002/internal-only">' not in html
        assert "<style>" not in html.lower()
        # The literal text is still there, harmlessly escaped.
        assert "169.254.169.254" in html
        assert "&lt;style&gt;" in html or "&lt;img" in html
