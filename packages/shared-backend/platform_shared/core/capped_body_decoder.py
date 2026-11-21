"""Decode a response body chunk by chunk without producing more than asked for."""
from __future__ import annotations

import zlib

# zlib ``wbits``: gzip framing, zlib framing, and raw deflate (no framing).
_GZIP_WBITS = 16 + zlib.MAX_WBITS
_ZLIB_WBITS = zlib.MAX_WBITS
_RAW_DEFLATE_WBITS = -zlib.MAX_WBITS


class CappedBodyDecoder:
    """Decodes ``identity``, ``gzip`` or ``deflate`` with a bound on each output.

    ``decode`` never returns more than ``max_length`` bytes for one raw chunk,
    so a highly compressed chunk cannot balloon in memory before the caller
    compares it with its cap. HTTP ``deflate`` should be zlib-framed, but some
    servers send raw deflate; as in httpx, a zlib error on the first chunk
    switches to raw deflate.

    Raises:
        zlib.error: the body is not valid data for its coding.
    """

    def __init__(self, coding: str) -> None:
        if coding not in ("identity", "gzip", "deflate"):
            raise ValueError(f"unsupported content coding {coding!r}")
        self._coding = coding
        self._started = False
        self._inflater: zlib._Decompress | None = None
        if coding == "gzip":
            self._inflater = zlib.decompressobj(_GZIP_WBITS)
        elif coding == "deflate":
            self._inflater = zlib.decompressobj(_ZLIB_WBITS)

    def decode(self, chunk: bytes, *, max_length: int) -> bytes:
        """Decode ``chunk``, returning at most ``max_length`` (>= 1) bytes.

        When the result is exactly ``max_length`` bytes long the caller must
        treat the body as over its cap: input may remain undecoded.
        """
        if self._inflater is None:
            return chunk
        if self._inflater.eof:
            # Anything after the end of the stream is ignored, never buffered.
            return b""
        try:
            out = self._inflater.decompress(chunk, max_length)
        except zlib.error:
            if self._coding != "deflate" or self._started:
                raise
            self._inflater = zlib.decompressobj(_RAW_DEFLATE_WBITS)
            out = self._inflater.decompress(chunk, max_length)
        self._started = True
        return out

    def flush(self) -> bytes:
        """Any output still held once the raw stream has ended."""
        if self._inflater is None or self._inflater.eof:
            return b""
        return self._inflater.flush()
