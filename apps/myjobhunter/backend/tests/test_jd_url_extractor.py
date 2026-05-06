"""Tests for the JD URL extractor service + POST /applications/extract-from-url.

The service's two-tier strategy gives us four orthogonal paths to cover:

1. **Schema.org fast path** — page contains a JSON-LD JobPosting block.
   Should map fields directly without invoking Claude.
2. **HTML fallback** — page has no JSON-LD JobPosting; visible text is
   stripped and shipped to Claude.
3. **Auth-walled domain** — URL matches the hard-coded blocklist
   (linkedin.com/jobs, glassdoor.com/job-listing). Should raise
   ``JDFetchAuthRequiredError`` BEFORE making a network call.
4. **Empty / tiny page** — fetched body has <500 visible bytes after
   stripping. Same auth-required signal.

We never make real HTTP requests — every fetch is mocked at the
``httpx.AsyncClient`` boundary. Claude is mocked at the
``claude_service.call_claude`` boundary, matching the pattern used in
``test_jd_parsing_service.py``.

The HTTP endpoint tests run through FastAPI's TestClient via the
``user_factory`` + ``as_user`` fixtures defined in ``conftest.py``.
"""
from __future__ import annotations

import json
import uuid
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest

from app.services.extraction.jd_url_extractor import (
    ExtractedJD,
    JDFetchAuthRequiredError,
    JDFetchError,
    JDFetchTimeoutError,
    _find_jobposting_schema,
    _strip_visible_text,
    _validate_url,
    extract_from_url,
)
from bs4 import BeautifulSoup


# ---------------------------------------------------------------------------
# Fixtures + helpers
# ---------------------------------------------------------------------------


SAMPLE_SCHEMA_PAYLOAD = {
    "@context": "https://schema.org/",
    "@type": "JobPosting",
    "title": "Senior Backend Engineer",
    "description": "<p>Build APIs at scale. Strong Python required.</p>",
    "hiringOrganization": {
        "@type": "Organization",
        "name": "Acme Corp",
    },
    "jobLocation": {
        "@type": "Place",
        "address": {
            "@type": "PostalAddress",
            "addressLocality": "San Francisco",
            "addressRegion": "CA",
            "addressCountry": "US",
        },
    },
    "responsibilities": [
        "Design backend services",
        "Mentor engineers",
    ],
}


def _wrap_html_with_schema(payload: object) -> str:
    """Return an HTML doc with the given JSON-LD payload embedded.

    The payload may be a single dict, a list, or a graph wrapper — we
    embed it verbatim and add enough body text so any caller falling
    through to the visible-text fallback wouldn't trigger the
    auth-walled short-circuit by accident.
    """
    body_filler = "x" * 600
    return f"""
    <!doctype html>
    <html><head>
      <title>Job posting</title>
      <script type="application/ld+json">{json.dumps(payload)}</script>
    </head>
    <body>
      <h1>Job</h1>
      <p>Some visible page content that would be enough text on its own.</p>
      {body_filler}
    </body>
    </html>
    """


def _build_httpx_response(text: str, status_code: int = 200) -> httpx.Response:
    """Build a real httpx.Response so .text / .content / .status_code align."""
    return httpx.Response(
        status_code=status_code,
        content=text.encode("utf-8"),
        request=httpx.Request("GET", "https://example.test/job"),
    )


class _FakeAsyncClient:
    """Stand-in for ``httpx.AsyncClient`` in async-with usage.

    Implements ``__aenter__`` / ``__aexit__`` and a ``get`` coroutine that
    returns / raises whatever was configured in the constructor.
    """

    def __init__(
        self,
        *,
        response: httpx.Response | None = None,
        raise_exc: BaseException | None = None,
    ) -> None:
        self._response = response
        self._raise = raise_exc
        self.last_url: str | None = None
        self.last_headers: dict[str, str] | None = None

    async def __aenter__(self) -> "_FakeAsyncClient":
        return self

    async def __aexit__(self, *args: Any) -> None:
        return None

    async def get(self, url: str) -> httpx.Response:
        self.last_url = url
        if self._raise is not None:
            raise self._raise
        assert self._response is not None
        return self._response


def _patch_httpx(client: _FakeAsyncClient) -> Any:
    """Patch httpx.AsyncClient to return ``client`` regardless of args."""
    return patch(
        "app.services.extraction.jd_url_extractor.httpx.AsyncClient",
        return_value=client,
    )


# ---------------------------------------------------------------------------
# _validate_url — pure
# ---------------------------------------------------------------------------


class TestValidateUrl:
    def test_https_url_ok(self) -> None:
        result = _validate_url("https://jobs.example.com/posting/abc")
        assert result.scheme == "https"
        assert result.netloc == "jobs.example.com"

    def test_http_url_ok(self) -> None:
        result = _validate_url("http://example.com/")
        assert result.scheme == "http"

    def test_bare_string_rejected(self) -> None:
        with pytest.raises(ValueError, match="non-empty"):
            _validate_url("")

    def test_relative_url_rejected(self) -> None:
        with pytest.raises(ValueError, match="scheme"):
            _validate_url("/jobs/abc")

    def test_ftp_scheme_rejected(self) -> None:
        with pytest.raises(ValueError, match="scheme"):
            _validate_url("ftp://example.com/file")

    def test_file_scheme_rejected(self) -> None:
        with pytest.raises(ValueError, match="scheme"):
            _validate_url("file:///etc/passwd")

    def test_data_scheme_rejected(self) -> None:
        with pytest.raises(ValueError, match="scheme"):
            _validate_url("data:text/plain,hello")

    def test_missing_host_rejected(self) -> None:
        with pytest.raises(ValueError, match="host"):
            _validate_url("https://")


# ---------------------------------------------------------------------------
# Schema.org JobPosting fast path
# ---------------------------------------------------------------------------


class TestFindJobPostingSchema:
    def test_finds_top_level_jobposting(self) -> None:
        html = _wrap_html_with_schema(SAMPLE_SCHEMA_PAYLOAD)
        soup = BeautifulSoup(html, "lxml")
        result = _find_jobposting_schema(soup)
        assert result is not None
        assert result["title"] == "Senior Backend Engineer"

    def test_finds_jobposting_in_list(self) -> None:
        payload = [
            {"@type": "WebPage", "name": "Careers"},
            SAMPLE_SCHEMA_PAYLOAD,
        ]
        html = _wrap_html_with_schema(payload)  # type: ignore[arg-type]
        soup = BeautifulSoup(html, "lxml")
        result = _find_jobposting_schema(soup)
        assert result is not None
        assert result["title"] == "Senior Backend Engineer"

    def test_finds_jobposting_in_graph(self) -> None:
        payload = {
            "@context": "https://schema.org",
            "@graph": [
                {"@type": "Organization", "name": "Acme"},
                SAMPLE_SCHEMA_PAYLOAD,
            ],
        }
        html = _wrap_html_with_schema(payload)
        soup = BeautifulSoup(html, "lxml")
        result = _find_jobposting_schema(soup)
        assert result is not None
        assert result["title"] == "Senior Backend Engineer"

    def test_handles_type_array(self) -> None:
        payload = dict(SAMPLE_SCHEMA_PAYLOAD)
        payload["@type"] = ["JobPosting", "Thing"]  # type: ignore[assignment]
        html = _wrap_html_with_schema(payload)
        soup = BeautifulSoup(html, "lxml")
        result = _find_jobposting_schema(soup)
        assert result is not None

    def test_returns_none_when_no_jobposting(self) -> None:
        html = """<html><head>
        <script type="application/ld+json">{"@type": "Article"}</script>
        </head><body></body></html>"""
        soup = BeautifulSoup(html, "lxml")
        assert _find_jobposting_schema(soup) is None

    def test_skips_malformed_json_block(self) -> None:
        html = """<html><head>
        <script type="application/ld+json">not json</script>
        <script type="application/ld+json">{"@type": "JobPosting", "title": "OK"}</script>
        </head><body></body></html>"""
        soup = BeautifulSoup(html, "lxml")
        result = _find_jobposting_schema(soup)
        assert result is not None
        assert result["title"] == "OK"


# ---------------------------------------------------------------------------
# _strip_visible_text — pure
# ---------------------------------------------------------------------------


class TestStripVisibleText:
    def test_removes_script_and_style(self) -> None:
        html = """<html><body>
        <script>var noisy = 1;</script>
        <style>.x { color: red; }</style>
        <p>Real content here</p>
        </body></html>"""
        soup = BeautifulSoup(html, "lxml")
        text = _strip_visible_text(soup)
        assert "noisy" not in text
        assert "color: red" not in text
        assert "Real content here" in text

    def test_collapses_excessive_blank_lines(self) -> None:
        html = "<html><body>\n\n\n\n\n<p>One</p>\n\n\n\n\n<p>Two</p></body></html>"
        soup = BeautifulSoup(html, "lxml")
        text = _strip_visible_text(soup)
        # Three or more blank lines collapse to two newlines (one blank line).
        assert "\n\n\n" not in text


# ---------------------------------------------------------------------------
# extract_from_url — schema.org happy path
# ---------------------------------------------------------------------------


class TestExtractFromUrlSchema:
    @pytest.mark.asyncio
    async def test_schema_org_happy_path(self) -> None:
        html = _wrap_html_with_schema(SAMPLE_SCHEMA_PAYLOAD)
        fake_client = _FakeAsyncClient(response=_build_httpx_response(html))

        with _patch_httpx(fake_client):
            result = await extract_from_url(
                "https://jobs.example.com/posting/abc",
                user_id=uuid.uuid4(),
            )

        assert isinstance(result, ExtractedJD)
        assert result.title == "Senior Backend Engineer"
        assert result.company == "Acme Corp"
        assert result.location == "San Francisco, CA, US"
        assert result.description_html is not None
        assert "Build APIs" in result.description_html
        assert result.requirements_text is not None
        assert "Design backend services" in result.requirements_text
        assert result.summary is None
        assert result.source_url == "https://jobs.example.com/posting/abc"

    @pytest.mark.asyncio
    async def test_schema_description_html_preserved(self) -> None:
        payload = {
            "@type": "JobPosting",
            "title": "Engineer",
            "description": "<div><strong>Bold</strong> emphasised text.</div>",
        }
        html = _wrap_html_with_schema(payload)
        fake_client = _FakeAsyncClient(response=_build_httpx_response(html))

        with _patch_httpx(fake_client):
            result = await extract_from_url(
                "https://example.com/posting",
                user_id=uuid.uuid4(),
            )

        assert result.description_html is not None
        assert "<strong>Bold</strong>" in result.description_html

    @pytest.mark.asyncio
    async def test_schema_org_missing_optional_fields(self) -> None:
        # Title only — verify nullable mapping works without crashing.
        payload = {"@type": "JobPosting", "title": "Engineer"}
        html = _wrap_html_with_schema(payload)
        fake_client = _FakeAsyncClient(response=_build_httpx_response(html))

        with _patch_httpx(fake_client):
            result = await extract_from_url(
                "https://example.com/posting",
                user_id=uuid.uuid4(),
            )

        assert result.title == "Engineer"
        assert result.company is None
        assert result.location is None
        assert result.description_html is None
        assert result.requirements_text is None

    @pytest.mark.asyncio
    async def test_schema_does_not_invoke_claude(self) -> None:
        """The fast path must NOT spend Claude tokens."""
        html = _wrap_html_with_schema(SAMPLE_SCHEMA_PAYLOAD)
        fake_client = _FakeAsyncClient(response=_build_httpx_response(html))

        mock_call = AsyncMock()
        with _patch_httpx(fake_client), patch(
            "app.services.extraction.jd_url_extractor.claude_service.call_claude",
            mock_call,
        ):
            await extract_from_url(
                "https://example.com/posting",
                user_id=uuid.uuid4(),
            )

        mock_call.assert_not_called()


# ---------------------------------------------------------------------------
# extract_from_url — HTML-text Claude fallback
# ---------------------------------------------------------------------------


_NO_SCHEMA_HTML = """
<!doctype html>
<html><head><title>Job</title></head>
<body>
  <h1>Senior Engineer</h1>
  <h2>Acme Corp — Remote</h2>
  <p>We're looking for an engineer to build great things.</p>
""" + "<p>Plenty of body text. " * 50 + """
</body></html>
"""


class TestExtractFromUrlHtmlFallback:
    @pytest.mark.asyncio
    async def test_html_fallback_invokes_claude(self) -> None:
        fake_client = _FakeAsyncClient(
            response=_build_httpx_response(_NO_SCHEMA_HTML),
        )
        claude_payload = {
            "title": "Senior Engineer",
            "company": "Acme Corp",
            "location": "Remote",
            "summary": "Engineer at Acme.",
            "must_have_requirements": ["Python", "Postgres"],
            "nice_to_have_requirements": ["Kubernetes"],
            "responsibilities": ["Build things"],
            "remote_type": "remote",
            "salary_min": None,
            "salary_max": None,
            "salary_currency": None,
            "salary_period": None,
            "seniority": "senior",
        }

        with _patch_httpx(fake_client), patch(
            "app.services.extraction.jd_url_extractor.claude_service.call_claude",
            new_callable=AsyncMock,
            return_value=claude_payload,
        ) as mock_call:
            user_id = uuid.uuid4()
            result = await extract_from_url(
                "https://example.com/posting",
                user_id=user_id,
            )

        # Claude was called with the stripped visible text + the JD-parsing prompt.
        mock_call.assert_called_once()
        call_kwargs = mock_call.call_args.kwargs
        assert call_kwargs["context_type"] == "jd_url_parse"
        assert call_kwargs["user_id"] == user_id
        assert call_kwargs["context_id"] is None
        # The user_content must be plain text with the JD body — verify our
        # h1 / h2 made it through and HTML tags did not.
        user_content = call_kwargs["user_content"]
        assert "Senior Engineer" in user_content
        assert "Acme Corp" in user_content
        assert "<h1>" not in user_content
        assert "<p>" not in user_content

        # Result is mapped from the Claude response.
        assert result.title == "Senior Engineer"
        assert result.company == "Acme Corp"
        assert result.location == "Remote"
        assert result.summary == "Engineer at Acme."
        assert result.requirements_text is not None
        assert "Must have:" in result.requirements_text
        assert "Python" in result.requirements_text
        assert "Nice to have:" in result.requirements_text
        assert "Kubernetes" in result.requirements_text
        assert result.description_html is None
        assert result.source_url == "https://example.com/posting"

    @pytest.mark.asyncio
    async def test_claude_failure_raises_jdfetcherror(self) -> None:
        import anthropic

        fake_client = _FakeAsyncClient(
            response=_build_httpx_response(_NO_SCHEMA_HTML),
        )
        with _patch_httpx(fake_client), patch(
            "app.services.extraction.jd_url_extractor.claude_service.call_claude",
            new_callable=AsyncMock,
            side_effect=anthropic.APIConnectionError(request=None),
        ):
            with pytest.raises(JDFetchError, match="AI extraction"):
                await extract_from_url(
                    "https://example.com/posting",
                    user_id=uuid.uuid4(),
                )

    @pytest.mark.asyncio
    async def test_claude_invalid_json_raises_jdfetcherror(self) -> None:
        fake_client = _FakeAsyncClient(
            response=_build_httpx_response(_NO_SCHEMA_HTML),
        )
        with _patch_httpx(fake_client), patch(
            "app.services.extraction.jd_url_extractor.claude_service.call_claude",
            new_callable=AsyncMock,
            side_effect=ValueError("invalid json"),
        ):
            with pytest.raises(JDFetchError, match="AI extraction"):
                await extract_from_url(
                    "https://example.com/posting",
                    user_id=uuid.uuid4(),
                )


# ---------------------------------------------------------------------------
# Auth-walled domains + tiny pages
# ---------------------------------------------------------------------------


class TestAuthWalledShortCircuit:
    @pytest.mark.parametrize(
        "url",
        [
            "https://www.linkedin.com/jobs/view/123456",
            "https://linkedin.com/jobs/view/abc",
            "https://www.glassdoor.com/job-listing/software-engineer-acme-JV_KO0,17_KE18,22.htm",
        ],
    )
    @pytest.mark.asyncio
    async def test_auth_walled_domain_short_circuits(self, url: str) -> None:
        # The fetcher should never be called.
        sentinel = MagicMock()
        with patch(
            "app.services.extraction.jd_url_extractor.httpx.AsyncClient",
            sentinel,
        ):
            with pytest.raises(JDFetchAuthRequiredError):
                await extract_from_url(url, user_id=uuid.uuid4())
        sentinel.assert_not_called()

    @pytest.mark.asyncio
    async def test_tiny_page_after_strip_raises_auth_required(self) -> None:
        # Page with no JSON-LD and <500 visible bytes.
        tiny_html = "<html><body><p>Sign in to view this listing.</p></body></html>"
        fake_client = _FakeAsyncClient(response=_build_httpx_response(tiny_html))

        with _patch_httpx(fake_client):
            with pytest.raises(JDFetchAuthRequiredError):
                await extract_from_url(
                    "https://acme.example.com/login",
                    user_id=uuid.uuid4(),
                )

    @pytest.mark.asyncio
    async def test_401_response_raises_auth_required(self) -> None:
        fake_client = _FakeAsyncClient(
            response=_build_httpx_response("Unauthorized", status_code=401),
        )
        with _patch_httpx(fake_client):
            with pytest.raises(JDFetchAuthRequiredError):
                await extract_from_url(
                    "https://acme.example.com/protected",
                    user_id=uuid.uuid4(),
                )

    @pytest.mark.asyncio
    async def test_403_response_raises_auth_required(self) -> None:
        fake_client = _FakeAsyncClient(
            response=_build_httpx_response("Forbidden", status_code=403),
        )
        with _patch_httpx(fake_client):
            with pytest.raises(JDFetchAuthRequiredError):
                await extract_from_url(
                    "https://acme.example.com/protected",
                    user_id=uuid.uuid4(),
                )


# ---------------------------------------------------------------------------
# Error mapping: timeout / non-2xx / network failures
# ---------------------------------------------------------------------------


class TestFetchErrors:
    @pytest.mark.asyncio
    async def test_timeout_raises_jdfetchtimeouterror(self) -> None:
        fake_client = _FakeAsyncClient(
            raise_exc=httpx.ConnectTimeout("timed out"),
        )
        with _patch_httpx(fake_client):
            with pytest.raises(JDFetchTimeoutError):
                await extract_from_url(
                    "https://slow.example.com/job",
                    user_id=uuid.uuid4(),
                )

    @pytest.mark.asyncio
    async def test_500_raises_jdfetcherror(self) -> None:
        fake_client = _FakeAsyncClient(
            response=_build_httpx_response("Bad gateway", status_code=502),
        )
        with _patch_httpx(fake_client):
            with pytest.raises(JDFetchError, match="HTTP 502"):
                await extract_from_url(
                    "https://broken.example.com/job",
                    user_id=uuid.uuid4(),
                )

    @pytest.mark.asyncio
    async def test_invalid_url_raises_value_error(self) -> None:
        with pytest.raises(ValueError):
            await extract_from_url("not-a-url", user_id=uuid.uuid4())


# ---------------------------------------------------------------------------
# HTTP endpoint tests via FastAPI TestClient
# ---------------------------------------------------------------------------


_VALID_URL = "https://jobs.example.com/posting/abc"


class TestExtractFromUrlEndpoint:
    @pytest.mark.asyncio
    async def test_happy_path_returns_200(
        self, user_factory, as_user,
    ) -> None:
        user = await user_factory()
        html = _wrap_html_with_schema(SAMPLE_SCHEMA_PAYLOAD)
        fake_client = _FakeAsyncClient(response=_build_httpx_response(html))

        with _patch_httpx(fake_client):
            async with await as_user(user) as authed:
                resp = await authed.post(
                    "/applications/extract-from-url",
                    json={"url": _VALID_URL},
                )

        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["title"] == "Senior Backend Engineer"
        assert body["company"] == "Acme Corp"
        assert body["location"] == "San Francisco, CA, US"
        assert body["source_url"] == _VALID_URL

    @pytest.mark.asyncio
    async def test_auth_required_returns_422(
        self, user_factory, as_user,
    ) -> None:
        user = await user_factory()

        async with await as_user(user) as authed:
            resp = await authed.post(
                "/applications/extract-from-url",
                json={"url": "https://www.linkedin.com/jobs/view/123"},
            )

        assert resp.status_code == 422, resp.text
        assert resp.json()["detail"] == "auth_required"

    @pytest.mark.asyncio
    async def test_timeout_returns_504(
        self, user_factory, as_user,
    ) -> None:
        user = await user_factory()
        fake_client = _FakeAsyncClient(
            raise_exc=httpx.ConnectTimeout("timed out"),
        )

        with _patch_httpx(fake_client):
            async with await as_user(user) as authed:
                resp = await authed.post(
                    "/applications/extract-from-url",
                    json={"url": _VALID_URL},
                )

        assert resp.status_code == 504, resp.text

    @pytest.mark.asyncio
    async def test_upstream_error_returns_502(
        self, user_factory, as_user,
    ) -> None:
        user = await user_factory()
        fake_client = _FakeAsyncClient(
            response=_build_httpx_response("Server error", status_code=500),
        )

        with _patch_httpx(fake_client):
            async with await as_user(user) as authed:
                resp = await authed.post(
                    "/applications/extract-from-url",
                    json={"url": _VALID_URL},
                )

        assert resp.status_code == 502, resp.text

    @pytest.mark.asyncio
    async def test_unauthenticated_returns_401(self, client) -> None:
        resp = await client.post(
            "/applications/extract-from-url",
            json={"url": _VALID_URL},
        )
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_malformed_url_returns_422(
        self, user_factory, as_user,
    ) -> None:
        # Pydantic AnyHttpUrl rejects non-URLs at the schema layer.
        user = await user_factory()
        async with await as_user(user) as authed:
            resp = await authed.post(
                "/applications/extract-from-url",
                json={"url": "not-a-url"},
            )
        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_extra_fields_rejected_422(
        self, user_factory, as_user,
    ) -> None:
        user = await user_factory()
        async with await as_user(user) as authed:
            resp = await authed.post(
                "/applications/extract-from-url",
                json={"url": _VALID_URL, "evil_field": "x"},
            )
        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_missing_url_returns_422(
        self, user_factory, as_user,
    ) -> None:
        user = await user_factory()
        async with await as_user(user) as authed:
            resp = await authed.post(
                "/applications/extract-from-url",
                json={},
            )
        assert resp.status_code == 422
