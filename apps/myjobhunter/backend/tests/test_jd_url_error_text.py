"""A job URL the server can't use is refused in our words, never a library's.

Covers the two routes that fetch a job posting (``/applications/extract-from-url``
and ``/jobs/analyze``): the SSRF guard's reason (it names the host and the
private address it resolved to) and urllib / json errors stay out of replies.
"""
from __future__ import annotations

import ipaddress
import uuid

import pytest
from bs4 import BeautifulSoup
from platform_shared.core.url_safety_messages import UNSAFE_URL_DETAIL

from app.services.extraction.jd_url_fetcher import validate_url
from app.services.extraction.jd_url_parser import find_jobposting_schema
from app.services.job_analysis import job_analysis_service
from app.services.job_analysis.job_analysis_invalid_url_error import JobAnalysisInvalidUrlError

_INTERNAL_HOST = "postgres"
_INTERNAL_IP = "172.18.0.5"


def _resolve_internal(host: str, port: int) -> list[ipaddress.IPv4Address | ipaddress.IPv6Address]:
    return [ipaddress.ip_address(_INTERNAL_IP)]


@pytest.fixture
def internal_dns(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("platform_shared.core.url_safety._resolve_host", _resolve_internal)


class TestValidateUrl:
    def test_malformed_bracketed_host_gets_our_wording(self) -> None:
        with pytest.raises(ValueError) as exc_info:
            validate_url("http://[zz]/job")
        assert str(exc_info.value) == "url is not well formed"

    def test_our_scheme_wording_still_shows(self) -> None:
        with pytest.raises(ValueError, match="url scheme must be http or https"):
            validate_url("ftp://jobs.example.com/1")


class TestJsonLdWithHugeInteger:
    def test_block_python_cannot_parse_is_skipped(self) -> None:
        huge = "9" * 5000
        html = f"""<html><head>
        <script type="application/ld+json">{{"a": {huge}}}</script>
        <script type="application/ld+json">{{"@type": "JobPosting", "title": "OK"}}</script>
        </head><body></body></html>"""
        result = find_jobposting_schema(BeautifulSoup(html, "lxml"))
        assert result is not None
        assert result["title"] == "OK"


class TestUnsafeUrlReply:
    @pytest.mark.asyncio
    async def test_extract_route_hides_the_resolved_address(
        self, internal_dns: None, user_factory, as_user,
    ) -> None:
        user = await user_factory()
        async with await as_user(user) as authed:
            resp = await authed.post(
                "/applications/extract-from-url",
                json={"url": f"http://{_INTERNAL_HOST}/job"},
            )
        assert resp.status_code == 400, resp.text
        assert resp.json()["detail"] == UNSAFE_URL_DETAIL
        assert _INTERNAL_IP not in resp.text
        assert "non-public" not in resp.text

    @pytest.mark.asyncio
    async def test_extract_route_still_shows_our_scheme_wording(
        self, user_factory, as_user, monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        async def refuse(url: str, *, user_id: uuid.UUID) -> None:
            validate_url("ftp://jobs.example.com/1")

        monkeypatch.setattr("app.api.applications.extract_from_url", refuse)
        user = await user_factory()
        async with await as_user(user) as authed:
            resp = await authed.post(
                "/applications/extract-from-url",
                json={"url": "https://jobs.example.com/1"},
            )
        assert resp.status_code == 400, resp.text
        assert resp.json()["detail"] == "url scheme must be http or https, got 'ftp'"

    @pytest.mark.asyncio
    async def test_job_analysis_hides_the_resolved_address(self, internal_dns: None) -> None:
        with pytest.raises(JobAnalysisInvalidUrlError) as exc_info:
            await job_analysis_service.analyze(
                uuid.uuid4(), url=f"http://{_INTERNAL_HOST}/job", jd_text=None,
            )
        assert str(exc_info.value) == UNSAFE_URL_DETAIL
