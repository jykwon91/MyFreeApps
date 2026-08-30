"""Tests for recipe discovery (POST /discovery/search, /discovery/detail).

The shared ``ResearchService`` is mocked by patching the module-level
instance, so no network and no API key are needed in CI. What the tests are
actually about is the *untrusted* boundary: everything the model returns was
influenced by third-party web pages, so the coercion layer is exercised with
the shapes a hostile or sloppy page would produce — bad URLs, wrong types,
absurd numbers, duplicates, and a missing payload.

The thumbnail proxy is tested for its two security properties: it fetches
only URLs this app signed, and it refuses anything that is not an image.
"""
from __future__ import annotations

from urllib.parse import parse_qs, urlparse

import pytest
from httpx import AsyncClient

from platform_shared.core.signed_url import sign_payload
from platform_shared.extraction import (
    ExtractionError,
    ExtractionParseError,
    ResearchResponse,
    WebSource,
)

from app.core.config import settings
from app.services.recipe import discovery_service as ds

_GOOD_RESULTS = {
    "recipes": [
        {
            "title": "Flan Napolitano",
            "source_type": "website",
            "site_name": "Serious Eats",
            "url": "https://www.seriouseats.com/flan-napolitano",
            "image_url": "https://cdn.seriouseats.com/flan.jpg",
            "summary": "A cream-cheese-enriched flan with a dense, silky set.",
            "why_notable": "The only version that water-baths at 325F.",
            "total_minutes": 90,
            "difficulty": "medium",
        },
        {
            "title": "Authentic Mexican Flan",
            "source_type": "blog",
            "site_name": "Mexico in My Kitchen",
            "url": "https://www.mexicoinmykitchen.com/flan",
            "image_url": None,
            "summary": "The home-style version, five ingredients.",
            "total_minutes": 75,
        },
        {
            "title": "Perfect Flan Every Time",
            # source_type is corrected from the URL, not trusted.
            "source_type": "website",
            "site_name": "Some Channel",
            "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
            "summary": "Technique walkthrough.",
        },
    ]
}

_GOOD_DETAIL = {
    "title": "Flan Napolitano",
    "summary": "A dense, cream-cheese flan.",
    "site_name": "Serious Eats",
    "image_url": "https://cdn.seriouseats.com/flan.jpg",
    "draft": {
        "title": "Flan Napolitano",
        "description": "Silky and dense.",
        "source": "Serious Eats",
        "servings": "8",
        "prep_minutes": 20,
        "cook_minutes": 70,
        "ingredients": [
            {"name": "sweetened condensed milk", "quantity": 1, "unit": "can", "note": None},
            {"name": "cream cheese", "quantity": 4, "unit": "oz", "note": "softened"},
        ],
        "steps": [
            {"instruction": "Caramelize the sugar."},
            {"instruction": "Blend the custard."},
        ],
    },
    "tips": ["Do not let the caramel darken past amber."],
    "community_notes": ["Commenters say to strain the custard twice."],
}


class _FakeResearch:
    """Stand-in for the shared ResearchService — no network, no API key."""

    def __init__(self, configured=True, data=None, raises=None, sources=None):
        self._configured = configured
        self._data = data
        self._raises = raises
        self._sources = sources or []
        self.calls: list[dict] = []

    def is_configured(self) -> bool:
        return self._configured

    def _respond(self, **kwargs):
        self.calls.append(kwargs)
        if self._raises is not None:
            raise self._raises
        return ResearchResponse(
            data=self._data,
            sources=self._sources,
            input_tokens=1000,
            output_tokens=200,
            total_tokens=1200,
            model=ds._MODEL,
            server_tool_uses=3,
        )

    async def search(self, system_prompt, user_prompt, **kwargs):
        return self._respond(prompt=user_prompt, **kwargs)

    async def read_page(self, system_prompt, user_prompt, **kwargs):
        return self._respond(prompt=user_prompt, **kwargs)


def _mock_research(monkeypatch, **kwargs) -> _FakeResearch:
    fake = _FakeResearch(**kwargs)
    monkeypatch.setattr(ds, "_research", fake)
    return fake


@pytest.fixture(autouse=True)
def _no_network(monkeypatch):
    """Keep the coercion tests off the network.

    Two stubs. ``assert_url_safe`` treats every host as public so the SSRF
    guard never hits real DNS (tests that care about the guard rejecting a
    target patch it themselves). ``fetch_og_image`` returns nothing, so
    thumbnail resolution falls through to the derived-YouTube and
    model-supplied paths without fetching anybody's home page — the og:image
    step has its own tests below.
    """
    from app.services.recipe import discovery_image_service as dis

    async def _ok(url, **kwargs):
        return urlparse(url)

    async def _no_og(page_url):
        return None

    monkeypatch.setattr(ds, "assert_url_safe", _ok)
    monkeypatch.setattr(dis, "fetch_og_image", _no_og)


class TestSearch:
    @pytest.mark.asyncio
    async def test_unauthenticated_returns_401(self, client: AsyncClient) -> None:
        resp = await client.post("/discovery/search", json={"query": "mexican flan"})
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_happy_path(self, user_factory, as_user, monkeypatch) -> None:
        fake = _mock_research(monkeypatch, data=_GOOD_RESULTS)
        user = await user_factory()
        async with await as_user(user) as authed:
            resp = await authed.post("/discovery/search", json={"query": "mexican flan"})

        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["query"] == "mexican flan"
        assert [r["title"] for r in body["recipes"]] == [
            "Flan Napolitano",
            "Authentic Mexican Flan",
            "Perfect Flan Every Time",
        ]
        # The query reaches the model.
        assert "mexican flan" in fake.calls[0]["prompt"]

    @pytest.mark.asyncio
    async def test_youtube_source_type_corrected_from_url(
        self, user_factory, as_user, monkeypatch
    ) -> None:
        """The URL is definitive; a mislabelled result is fixed, not trusted."""
        _mock_research(monkeypatch, data=_GOOD_RESULTS)
        user = await user_factory()
        async with await as_user(user) as authed:
            resp = await authed.post("/discovery/search", json={"query": "flan"})
        assert resp.json()["recipes"][2]["source_type"] == "youtube"

    @pytest.mark.asyncio
    async def test_youtube_thumbnail_is_derived_not_trusted(
        self, user_factory, as_user, monkeypatch
    ) -> None:
        """A YouTube card's picture comes from the video id, so it always works."""
        _mock_research(monkeypatch, data=_GOOD_RESULTS)
        user = await user_factory()
        async with await as_user(user) as authed:
            resp = await authed.post("/discovery/search", json={"query": "flan"})

        proxied = resp.json()["recipes"][2]["image_url"]
        target = parse_qs(urlparse(proxied).query)["url"][0]
        assert target == "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg"

    @pytest.mark.asyncio
    async def test_images_are_proxied_and_signed(
        self, user_factory, as_user, monkeypatch
    ) -> None:
        """No card points the browser at a third-party host (the CSP forbids it)."""
        _mock_research(monkeypatch, data=_GOOD_RESULTS)
        user = await user_factory()
        async with await as_user(user) as authed:
            resp = await authed.post("/discovery/search", json={"query": "flan"})

        first = resp.json()["recipes"][0]["image_url"]
        assert first.startswith("/discovery/image?url=")
        query = parse_qs(urlparse(first).query)
        assert query["url"] == ["https://cdn.seriouseats.com/flan.jpg"]
        assert query["sig"][0]  # signed
        # A result with no picture gets none — the frontend renders a tile.
        assert resp.json()["recipes"][1]["image_url"] is None

    @pytest.mark.asyncio
    async def test_not_configured_returns_503(self, user_factory, as_user, monkeypatch) -> None:
        _mock_research(monkeypatch, configured=False)
        user = await user_factory()
        async with await as_user(user) as authed:
            resp = await authed.post("/discovery/search", json={"query": "flan"})
        assert resp.status_code == 503

    @pytest.mark.asyncio
    async def test_upstream_error_returns_503(self, user_factory, as_user, monkeypatch) -> None:
        _mock_research(
            monkeypatch,
            raises=ExtractionError("overloaded", error_type="overloaded_error", status=529),
        )
        user = await user_factory()
        async with await as_user(user) as authed:
            resp = await authed.post("/discovery/search", json={"query": "flan"})
        assert resp.status_code == 503
        # The provider's internals never reach the user.
        assert "overloaded_error" not in resp.text

    @pytest.mark.asyncio
    async def test_unparseable_response_returns_422(
        self, user_factory, as_user, monkeypatch
    ) -> None:
        _mock_research(monkeypatch, raises=ExtractionParseError("no json"))
        user = await user_factory()
        async with await as_user(user) as authed:
            resp = await authed.post("/discovery/search", json={"query": "flan"})
        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_no_results_returns_422(self, user_factory, as_user, monkeypatch) -> None:
        _mock_research(monkeypatch, data={"recipes": []})
        user = await user_factory()
        async with await as_user(user) as authed:
            resp = await authed.post("/discovery/search", json={"query": "asdfgh"})
        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_short_query_rejected(self, user_factory, as_user, monkeypatch) -> None:
        _mock_research(monkeypatch, data=_GOOD_RESULTS)
        user = await user_factory()
        async with await as_user(user) as authed:
            resp = await authed.post("/discovery/search", json={"query": "a"})
        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_rate_limited_after_budget(self, user_factory, as_user, monkeypatch) -> None:
        """The throttle is a spend ceiling, not an auth control."""
        _mock_research(monkeypatch, data=_GOOD_RESULTS)
        user = await user_factory()
        async with await as_user(user) as authed:
            for _ in range(20):
                assert (
                    await authed.post("/discovery/search", json={"query": "flan"})
                ).status_code == 200
            assert (
                await authed.post("/discovery/search", json={"query": "flan"})
            ).status_code == 429


class TestSearchCoercion:
    """The model's JSON is schema-valid but its *values* came off the web."""

    @pytest.mark.asyncio
    async def test_hostile_and_sloppy_rows_are_dropped_or_clamped(
        self, user_factory, as_user, monkeypatch
    ) -> None:
        _mock_research(
            monkeypatch,
            data={
                "recipes": [
                    # javascript: URL — must never reach an href.
                    {"title": "XSS", "url": "javascript:alert(1)", "summary": "no"},
                    # Relative URL — not openable.
                    {"title": "Relative", "url": "/recipes/flan", "summary": "no"},
                    # No title.
                    {"title": "   ", "url": "https://ok.example/a", "summary": "no"},
                    # Duplicate of a later valid row.
                    {"title": "Dupe", "url": "https://ok.example/keep", "summary": "first"},
                    {"title": "Dupe again", "url": "https://ok.example/keep", "summary": "second"},
                    # Absurd time + unknown difficulty are dropped, row kept.
                    {
                        "title": "Odd numbers",
                        "url": "https://ok.example/odd",
                        "summary": "s",
                        "total_minutes": 999999,
                        "difficulty": "impossible",
                    },
                    # Non-dict row.
                    "not a dict",
                ]
            },
        )
        user = await user_factory()
        async with await as_user(user) as authed:
            resp = await authed.post("/discovery/search", json={"query": "flan"})

        recipes = resp.json()["recipes"]
        assert [r["url"] for r in recipes] == [
            "https://ok.example/keep",
            "https://ok.example/odd",
        ]
        assert recipes[0]["summary"] == "first"  # first of the duplicates wins
        assert recipes[1]["total_minutes"] is None
        assert recipes[1]["difficulty"] is None

    @pytest.mark.asyncio
    async def test_result_count_capped(self, user_factory, as_user, monkeypatch) -> None:
        _mock_research(
            monkeypatch,
            data={
                "recipes": [
                    {"title": f"R{i}", "url": f"https://ok.example/{i}", "summary": "s"}
                    for i in range(50)
                ]
            },
        )
        user = await user_factory()
        async with await as_user(user) as authed:
            resp = await authed.post("/discovery/search", json={"query": "flan"})
        assert len(resp.json()["recipes"]) == ds._MAX_RESULTS

    @pytest.mark.asyncio
    async def test_non_image_url_is_not_proxied(
        self, user_factory, as_user, monkeypatch
    ) -> None:
        _mock_research(
            monkeypatch,
            data={
                "recipes": [
                    {
                        "title": "R",
                        "url": "https://ok.example/r",
                        "summary": "s",
                        "image_url": "file:///etc/passwd",
                    }
                ]
            },
        )
        user = await user_factory()
        async with await as_user(user) as authed:
            resp = await authed.post("/discovery/search", json={"query": "flan"})
        assert resp.json()["recipes"][0]["image_url"] is None


class TestDetail:
    @pytest.mark.asyncio
    async def test_unauthenticated_returns_401(self, client: AsyncClient) -> None:
        resp = await client.post(
            "/discovery/detail", json={"url": "https://ok.example/r"}
        )
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_happy_path_returns_saveable_draft(
        self, user_factory, as_user, monkeypatch
    ) -> None:
        fake = _mock_research(
            monkeypatch,
            data=_GOOD_DETAIL,
            sources=[WebSource(url="https://www.seriouseats.com/flan-napolitano", title="F")],
        )
        user = await user_factory()
        async with await as_user(user) as authed:
            resp = await authed.post(
                "/discovery/detail",
                json={
                    "url": "https://www.seriouseats.com/flan-napolitano",
                    "title": "Flan Napolitano",
                },
            )

        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["draft"]["title"] == "Flan Napolitano"
        assert len(body["draft"]["ingredients"]) == 2
        assert body["draft"]["ingredients"][1]["note"] == "softened"
        assert body["tips"] == ["Do not let the caramel darken past amber."]
        assert body["community_notes"]
        assert body["sources"] == ["https://www.seriouseats.com/flan-napolitano"]
        # The URL is in the prompt — that is how web_fetch is told what to read.
        assert "https://www.seriouseats.com/flan-napolitano" in fake.calls[0]["prompt"]

    @pytest.mark.asyncio
    async def test_draft_is_editor_shaped(self, user_factory, as_user, monkeypatch) -> None:
        """"Save to my recipes" reuses the photo-import editor, so the draft
        must satisfy the same create request the editor posts."""
        from app.schemas.recipe.recipe_schemas import RecipeCreateRequest

        _mock_research(monkeypatch, data=_GOOD_DETAIL)
        user = await user_factory()
        async with await as_user(user) as authed:
            detail = (
                await authed.post(
                    "/discovery/detail", json={"url": "https://ok.example/r"}
                )
            ).json()
            RecipeCreateRequest.model_validate(detail["draft"])  # no ValidationError

            saved = await authed.post("/recipes", json=detail["draft"])
        assert saved.status_code == 201, saved.text

    @pytest.mark.asyncio
    async def test_unreadable_page_returns_422(
        self, user_factory, as_user, monkeypatch
    ) -> None:
        """An empty recipe is a failure, not a card with nothing in it."""
        _mock_research(
            monkeypatch,
            data={"title": "T", "summary": "s", "draft": {"title": "T", "ingredients": [], "steps": []}},
        )
        user = await user_factory()
        async with await as_user(user) as authed:
            resp = await authed.post(
                "/discovery/detail", json={"url": "https://ok.example/r"}
            )
        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_unsafe_url_rejected_before_any_fetch(
        self, user_factory, as_user, monkeypatch
    ) -> None:
        """The client can send any URL — an internal one must not be fetched."""
        from platform_shared.core.url_safety import UnsafeURLError

        fake = _mock_research(monkeypatch, data=_GOOD_DETAIL)

        async def _reject(url, **kwargs):
            raise UnsafeURLError("non-public address")

        monkeypatch.setattr(ds, "assert_url_safe", _reject)

        user = await user_factory()
        async with await as_user(user) as authed:
            resp = await authed.post(
                "/discovery/detail", json={"url": "http://169.254.169.254/latest/meta-data/"}
            )
        assert resp.status_code == 400
        assert fake.calls == []  # never reached the model


class TestImageProxy:
    """Two properties: only URLs we signed, and only images."""

    @pytest.mark.asyncio
    async def test_unsigned_url_refused(self, client: AsyncClient) -> None:
        resp = await client.get(
            "/discovery/image", params={"url": "https://evil.example/x.jpg", "sig": "nope"}
        )
        assert resp.status_code == 403

    @pytest.mark.asyncio
    async def test_signature_does_not_transfer_to_another_url(
        self, client: AsyncClient
    ) -> None:
        """The signed material is the URL — a token cannot be reused."""
        signature = sign_payload(
            "https://cdn.example/ok.jpg", secret=settings.secret_key, ttl_seconds=300
        )
        resp = await client.get(
            "/discovery/image",
            params={"url": "https://evil.example/steal.jpg", "sig": signature},
        )
        assert resp.status_code == 403

    @pytest.mark.asyncio
    async def test_signed_image_is_served_with_hardened_headers(
        self, client: AsyncClient, monkeypatch
    ) -> None:
        from app.services.recipe import discovery_image_service as dis

        async def _fake_fetch(url, sig):
            return b"\xff\xd8\xff\xe0jpegbytes", "image/jpeg"

        monkeypatch.setattr(dis, "fetch_signed_image", _fake_fetch)
        resp = await client.get(
            "/discovery/image", params={"url": "https://cdn.example/ok.jpg", "sig": "x"}
        )
        assert resp.status_code == 200
        assert resp.headers["content-type"].startswith("image/jpeg")
        assert resp.headers["x-content-type-options"] == "nosniff"
        assert "default-src 'none'" in resp.headers["content-security-policy"]

    @pytest.mark.asyncio
    async def test_upstream_failure_is_404_not_500(
        self, client: AsyncClient, monkeypatch
    ) -> None:
        """A dead image must degrade to a placeholder tile, not an error page."""
        from app.services.recipe import discovery_image_service as dis

        async def _fail(url, sig):
            raise dis.ImageFetchError("Refusing non-image content type 'text/html'")

        monkeypatch.setattr(dis, "fetch_signed_image", _fail)
        resp = await client.get(
            "/discovery/image", params={"url": "https://cdn.example/x.jpg", "sig": "x"}
        )
        assert resp.status_code == 404


class TestYoutubeThumbnails:
    @pytest.mark.parametrize(
        "url,expected_id",
        [
            ("https://www.youtube.com/watch?v=dQw4w9WgXcQ", "dQw4w9WgXcQ"),
            ("https://youtu.be/dQw4w9WgXcQ", "dQw4w9WgXcQ"),
            ("https://www.youtube.com/shorts/dQw4w9WgXcQ", "dQw4w9WgXcQ"),
            ("https://m.youtube.com/watch?v=dQw4w9WgXcQ&t=30s", "dQw4w9WgXcQ"),
        ],
    )
    def test_recognised_forms(self, url: str, expected_id: str) -> None:
        from app.services.recipe.discovery_image_service import youtube_thumbnail_url

        assert youtube_thumbnail_url(url) == (
            f"https://i.ytimg.com/vi/{expected_id}/hqdefault.jpg"
        )

    @pytest.mark.parametrize(
        "url",
        [
            "https://www.seriouseats.com/flan",
            "https://www.youtube.com/watch?v=short",  # not an 11-char id
            "https://www.youtube.com/results?search_query=flan",
            "not a url",
        ],
    )
    def test_non_video_urls_get_nothing(self, url: str) -> None:
        from app.services.recipe.discovery_image_service import youtube_thumbnail_url

        assert youtube_thumbnail_url(url) is None


class TestOgImage:
    """The publisher's declared preview image — the picture for most results.

    The model returns null for most `image_url` fields (it is told a wrong
    picture is worse than none), so without this step a typical search is
    mostly placeholder tiles.
    """

    @pytest.mark.parametrize(
        "markup,expected",
        [
            (
                b'<meta property="og:image" content="https://cdn.example/hero.jpg">',
                "https://cdn.example/hero.jpg",
            ),
            # Attribute order, quoting, and casing all vary in the wild.
            (
                b"<META CONTENT='https://cdn.example/a.png' PROPERTY='og:image'/>",
                "https://cdn.example/a.png",
            ),
            # Twitter's tag is the common fallback.
            (
                b'<meta name="twitter:image" content="https://cdn.example/t.jpg">',
                "https://cdn.example/t.jpg",
            ),
            # Site-relative and protocol-relative paths resolve against the page.
            (
                b'<meta property="og:image" content="/img/flan.jpg">',
                "https://blog.example/img/flan.jpg",
            ),
            (
                b'<meta property="og:image" content="//cdn.example/x.jpg">',
                "https://cdn.example/x.jpg",
            ),
            # Entities are decoded — query strings routinely carry &amp;.
            (
                b'<meta property="og:image" content="https://cdn.example/x?a=1&amp;b=2">',
                "https://cdn.example/x?a=1&b=2",
            ),
            # Nothing usable.
            (b"<meta charset='utf-8'><title>Flan</title>", None),
            (b'<meta property="og:image" content="">', None),
            (b'<meta property="og:image" content="javascript:alert(1)">', None),
            (b"", None),
        ],
    )
    def test_parses_the_declared_image(self, markup: bytes, expected: str | None) -> None:
        from app.services.recipe.discovery_image_service import _og_image_from_html

        assert _og_image_from_html(markup, "https://blog.example/recipes/flan") == expected

    def test_ignores_meta_tags_that_are_not_images(self) -> None:
        from app.services.recipe.discovery_image_service import _og_image_from_html

        markup = (
            b'<meta property="og:title" content="Flan">'
            b'<meta property="og:url" content="https://blog.example/flan">'
            b'<meta property="og:image" content="https://cdn.example/right.jpg">'
        )
        assert (
            _og_image_from_html(markup, "https://blog.example/flan")
            == "https://cdn.example/right.jpg"
        )

    @pytest.mark.asyncio
    async def test_derived_youtube_thumbnail_wins_without_fetching(
        self, monkeypatch
    ) -> None:
        """A YouTube result never costs a page read — the id is enough."""
        from app.services.recipe import discovery_image_service as dis

        async def _explode(page_url):
            raise AssertionError("should not fetch a YouTube page")

        monkeypatch.setattr(dis, "fetch_og_image", _explode)
        path = await dis.resolve_thumbnail(
            "https://cdn.example/model-guess.jpg",
            page_url="https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        )
        assert path is not None
        assert parse_qs(urlparse(path).query)["url"] == [
            "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg"
        ]

    @pytest.mark.asyncio
    async def test_page_declaration_beats_the_model_guess(self, monkeypatch) -> None:
        from app.services.recipe import discovery_image_service as dis

        async def _og(page_url):
            return "https://cdn.example/declared.jpg"

        monkeypatch.setattr(dis, "fetch_og_image", _og)
        path = await dis.resolve_thumbnail(
            "https://cdn.example/model-guess.jpg", page_url="https://blog.example/flan"
        )
        assert parse_qs(urlparse(path or "").query)["url"] == [
            "https://cdn.example/declared.jpg"
        ]

    @pytest.mark.asyncio
    async def test_falls_back_to_the_model_guess(self, monkeypatch) -> None:
        from app.services.recipe import discovery_image_service as dis

        async def _none(page_url):
            return None

        monkeypatch.setattr(dis, "fetch_og_image", _none)
        path = await dis.resolve_thumbnail(
            "https://cdn.example/model-guess.jpg", page_url="https://blog.example/flan"
        )
        assert parse_qs(urlparse(path or "").query)["url"] == [
            "https://cdn.example/model-guess.jpg"
        ]

    @pytest.mark.asyncio
    async def test_unreachable_page_is_not_an_error(self, monkeypatch) -> None:
        """A search must not fail because one publisher's server is down."""
        import httpx

        from app.services.recipe import discovery_image_service as dis

        async def _ok(url, **kwargs):
            return urlparse(url)

        monkeypatch.setattr(dis, "assert_url_safe", _ok)

        class _DeadClient:
            def __init__(self, *args, **kwargs):
                pass

            async def __aenter__(self):
                return self

            async def __aexit__(self, *exc):
                return False

            def stream(self, method, url):
                raise httpx.ConnectError("no route to host")

        monkeypatch.setattr(dis.httpx, "AsyncClient", _DeadClient)
        assert await dis.fetch_og_image("https://blog.example/flan") is None

    @pytest.mark.asyncio
    async def test_internal_address_is_never_fetched(self, monkeypatch) -> None:
        from platform_shared.core.url_safety import UnsafeURLError

        from app.services.recipe import discovery_image_service as dis

        async def _reject(url, **kwargs):
            raise UnsafeURLError("non-public address")

        def _explode(*args, **kwargs):
            raise AssertionError("must not open a connection to a rejected URL")

        monkeypatch.setattr(dis, "assert_url_safe", _reject)
        monkeypatch.setattr(dis.httpx, "AsyncClient", _explode)
        assert await dis.fetch_og_image("http://169.254.169.254/") is None
