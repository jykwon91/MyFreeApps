"""Read a big Blizzard answer one array row at a time, never whole.

An auction-house answer is up to ``max_bytes`` of JSON; buffering and parsing it whole costs
several times that in Python objects. ``stream_array_rows`` parses the bytes as they arrive
(``ijson``) and hands out the rows of one top-level array, so memory stays flat however big the
answer is. Failures become the caller's ``error_cls`` exactly as ``blizzard_http.send`` does: a
non-200 carries Blizzard's status and code, a network failure the exception name, an answer over
``max_bytes`` (counted on the bytes streamed) or not a JSON object is refused.

Between chunks control goes back to the event loop, so the scheduler's tick and heartbeat keep
running while a big answer is read.
"""
from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Any

import httpx
import ijson

from app.services.wow.blizzard.blizzard_http import E, error_from
from app.services.wow.blizzard.json_array_stream import JsonArrayStream

_OBJECT_START = ord("{")


class _BodyReader:
    """The async file-like ``ijson`` reads: the response's bytes, capped, one network chunk per read."""

    def __init__(self, response: httpx.Response, *, error_cls: type[E], max_bytes: int) -> None:
        self._chunks = response.aiter_bytes()
        self._error_cls = error_cls
        self._max_bytes = max_bytes
        self._read = 0
        self._started = False

    async def read(self, size: int = -1) -> bytes:
        if size == 0:
            # ijson's first call, to learn whether the source is bytes: consume nothing.
            return b""
        try:
            chunk = await anext(self._chunks, b"")
        except httpx.HTTPError as exc:
            raise self._error_cls(f"request failed: {type(exc).__name__}") from exc
        self._read += len(chunk)
        if self._read > self._max_bytes:
            raise self._error_cls(f"answer is over the {self._max_bytes} byte cap", status_code=200)
        if not self._started:
            self._check_is_object(chunk)
        # Let the scheduler's tick and heartbeat run between chunks.
        await asyncio.sleep(0)
        return chunk

    def _check_is_object(self, chunk: bytes) -> None:
        first = chunk.lstrip()[:1]
        if not first:
            return
        self._started = True
        if first[0] != _OBJECT_START:
            raise self._error_cls("answer is not a JSON object", status_code=200)


async def _empty_rows() -> AsyncIterator[dict[str, Any]]:
    """An async generator that yields nothing — used for 304 Not Modified responses."""
    return
    yield  # type: ignore[misc]  # makes this an async generator


async def _rows(reader: _BodyReader, array_key: str, error_cls: type[E]) -> AsyncIterator[dict[str, Any]]:
    try:
        async for row in ijson.items_async(reader, f"{array_key}.item", use_float=True):
            if isinstance(row, dict):
                yield row
    except ijson.JSONError as exc:
        raise error_cls("answer is not JSON", status_code=200) from exc


@asynccontextmanager
async def stream_array_rows(
    http: httpx.AsyncClient,
    method: str,
    url: str,
    *,
    array_key: str,
    error_cls: type[E],
    max_bytes: int,
    allow_not_modified: bool = False,
    **kwargs: Any,
) -> AsyncIterator[JsonArrayStream]:
    """One request; the rows of the answer's top-level ``array_key`` array, read as they arrive.

    A missing ``array_key`` is an answer with no rows. The connection closes when the block ends.
    When ``allow_not_modified=True`` a 304 response yields an empty stream with ``not_modified=True``
    instead of raising an error.
    """
    try:
        async with http.stream(method, url, **kwargs) as response:
            if allow_not_modified and response.status_code == httpx.codes.NOT_MODIFIED:
                yield JsonArrayStream(headers=response.headers, rows=_empty_rows(), not_modified=True)
                return
            if response.status_code != httpx.codes.OK:
                await response.aread()
                raise error_from(response, error_cls)
            reader = _BodyReader(response, error_cls=error_cls, max_bytes=max_bytes)
            yield JsonArrayStream(headers=response.headers, rows=_rows(reader, array_key, error_cls))
    except httpx.HTTPError as exc:
        raise error_cls(f"request failed: {type(exc).__name__}") from exc
