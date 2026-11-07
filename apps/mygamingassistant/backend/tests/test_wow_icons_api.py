"""GET /wow/icons/{build}/{fileDataId}.webp and /wow/satellite/{build}/{uiMapId}.webp —
served from object storage, cached for a year.

Nothing but a build and a numeric id may reach a storage key; a missing image
is a 404 the browser doesn't keep.
"""
from __future__ import annotations

from collections.abc import AsyncIterator

import pytest
import pytest_asyncio
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from minio.error import S3Error

from app.api import wow_icons
from app.services.wow import icon_service

_BUILD = "1.60.1.70790"
_WEBP = b"RIFF\x00\x00\x00\x00WEBPVP8 "


def _missing(key: str) -> S3Error:
    return S3Error(None, "NoSuchKey", "missing", key, "req", "host")  # type: ignore[arg-type]


class _FakeStorage:
    def __init__(self, objects: dict[str, bytes]) -> None:
        self.objects = objects
        self.reads: list[str] = []

    def download_file(self, key: str) -> bytes:
        self.reads.append(key)
        if key not in self.objects:
            raise _missing(key)
        return self.objects[key]


@pytest.fixture
def storage(monkeypatch: pytest.MonkeyPatch) -> _FakeStorage:
    fake = _FakeStorage({f"wow/{_BUILD}/icons/134829.webp": _WEBP, f"wow/{_BUILD}/satellite/1429.webp": _WEBP})
    monkeypatch.setattr(icon_service, "get_storage", lambda: fake)
    icon_service._cached_download.cache_clear()
    icon_service._cached_satellite_download.cache_clear()
    yield fake
    icon_service._cached_download.cache_clear()
    icon_service._cached_satellite_download.cache_clear()


@pytest_asyncio.fixture
async def http() -> AsyncIterator[AsyncClient]:
    app = FastAPI()
    app.include_router(wow_icons.router)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        yield client


@pytest.mark.asyncio
async def test_published_icon_is_webp_cached_for_a_year(http: AsyncClient, storage: _FakeStorage) -> None:
    response = await http.get(f"/wow/icons/{_BUILD}/134829.webp")
    assert response.status_code == 200
    assert response.headers["content-type"] == "image/webp"
    assert response.headers["cache-control"] == "public, max-age=31536000, immutable"
    assert response.content == _WEBP


@pytest.mark.asyncio
async def test_repeat_reads_come_from_the_process_cache(http: AsyncClient, storage: _FakeStorage) -> None:
    await http.get(f"/wow/icons/{_BUILD}/134829.webp")
    await http.get(f"/wow/icons/{_BUILD}/134829.webp")
    assert storage.reads == [f"wow/{_BUILD}/icons/134829.webp"]


@pytest.mark.asyncio
async def test_unpublished_icon_is_a_404_not_kept(http: AsyncClient, storage: _FakeStorage) -> None:
    response = await http.get(f"/wow/icons/{_BUILD}/999.webp")
    assert response.status_code == 404
    assert response.headers["cache-control"] == "no-store"


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("build", "file_name"),
    [
        (_BUILD, "134829.png"),
        (_BUILD, "..%2Fsecret.webp"),
        (_BUILD, "abc.webp"),
        ("latest", "134829.webp"),
        ("1.60.1", "134829.webp"),
        (_BUILD, "12345678901.webp"),
    ],
)
async def test_malformed_names_never_reach_storage(
    http: AsyncClient, storage: _FakeStorage, build: str, file_name: str
) -> None:
    response = await http.get(f"/wow/icons/{build}/{file_name}")
    assert response.status_code == 404
    assert storage.reads == []


def test_icon_key_normalises_the_file_id() -> None:
    assert icon_service.asset_key(icon_service.ICONS, _BUILD, "0134829.webp") == f"wow/{_BUILD}/icons/134829.webp"


@pytest.mark.parametrize(
    ("build", "file_name"),
    [(_BUILD, "1429.webp\n"), (f"{_BUILD}\n", "1429.webp"), (_BUILD, " 1429.webp")],
)
def test_trailing_or_leading_junk_makes_no_key(build: str, file_name: str) -> None:
    assert icon_service.asset_key(icon_service.SATELLITE, build, file_name) is None


@pytest.mark.asyncio
async def test_published_satellite_view_is_webp_cached_for_a_year(http: AsyncClient, storage: _FakeStorage) -> None:
    response = await http.get(f"/wow/satellite/{_BUILD}/1429.webp")
    assert response.status_code == 200
    assert response.headers["content-type"] == "image/webp"
    assert response.headers["cache-control"] == "public, max-age=31536000, immutable"
    assert response.content == _WEBP
    assert storage.reads == [f"wow/{_BUILD}/satellite/1429.webp"]


@pytest.mark.asyncio
async def test_unpublished_satellite_view_is_a_404_not_kept(http: AsyncClient, storage: _FakeStorage) -> None:
    response = await http.get(f"/wow/satellite/{_BUILD}/1411.webp")
    assert response.status_code == 404
    assert response.headers["cache-control"] == "no-store"


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("build", "file_name"),
    [
        (_BUILD, "1429.png"),
        (_BUILD, "..%2F..%2Ficons%2F134829.webp"),
        (_BUILD, "..%2Fsecret.webp"),
        (_BUILD, "%2E%2E%2F1429.webp"),
        (_BUILD, "1429.webp%00.png"),
        (_BUILD, "1429%2F.webp"),
        (_BUILD, "-1.webp"),
        (_BUILD, "1234567.webp"),
        ("..", "1429.webp"),
        ("1.60.1.70790%2F..", "1429.webp"),
        ("latest", "1429.webp"),
    ],
)
async def test_malformed_satellite_names_never_reach_storage(
    http: AsyncClient, storage: _FakeStorage, build: str, file_name: str
) -> None:
    response = await http.get(f"/wow/satellite/{build}/{file_name}")
    assert response.status_code == 404
    assert storage.reads == []


def test_satellite_key_normalises_the_map_id() -> None:
    assert icon_service.asset_key(icon_service.SATELLITE, _BUILD, "01429.webp") == f"wow/{_BUILD}/satellite/1429.webp"


@pytest.mark.parametrize("kind", ["", "maps", "..", "icons/../satellite", "ICONS"])
def test_only_known_kinds_make_a_key(kind: str) -> None:
    assert icon_service.asset_key(kind, _BUILD, "1429.webp") is None
