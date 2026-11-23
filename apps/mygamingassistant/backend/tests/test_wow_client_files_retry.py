"""client_file survives a wago.tools 429 by backing off, but not other HTTP errors."""
import urllib.error

import pytest

from scripts.wow_world_map import sources
from scripts.wow_world_map.walk import client_files


def _http_error(code: int) -> urllib.error.HTTPError:
    return urllib.error.HTTPError("https://wago.tools/x", code, "err", {}, None)  # type: ignore[arg-type]


def test_retries_after_rate_limit(monkeypatch: pytest.MonkeyPatch, tmp_path) -> None:
    monkeypatch.setattr(sources, "CACHE_DIR", tmp_path)
    monkeypatch.setattr(client_files.time, "sleep", lambda _s: None)
    calls: list[int] = []

    def fake_fetch(_url: str, dest):
        calls.append(1)
        if len(calls) < 3:
            raise _http_error(429)
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(b"ok")
        return dest

    monkeypatch.setattr(sources, "_fetch", fake_fetch)
    assert client_files.client_file(1) == b"ok"
    assert len(calls) == 3


def test_other_http_errors_are_not_retried(monkeypatch: pytest.MonkeyPatch, tmp_path) -> None:
    monkeypatch.setattr(sources, "CACHE_DIR", tmp_path)
    monkeypatch.setattr(client_files.time, "sleep", lambda _s: None)
    calls: list[int] = []

    def fake_fetch(_url: str, _dest):
        calls.append(1)
        raise _http_error(404)

    monkeypatch.setattr(sources, "_fetch", fake_fetch)
    with pytest.raises(urllib.error.HTTPError):
        client_files.client_file(1)
    assert len(calls) == 1
