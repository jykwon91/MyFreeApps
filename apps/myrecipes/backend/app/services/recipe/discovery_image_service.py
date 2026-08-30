"""Thumbnails for discovered recipes, fetched through us rather than direct.

Discovery results point at pictures on third-party sites. Three constraints
decide the shape of this module, and they rule out the obvious approaches:

1. **The app's CSP is ``img-src 'self' data: blob:``** (apps/myrecipes/app.yaml).
   A remote ``<img src>`` is blocked outright. Widening the CSP to ``https:``
   to fix that would also hand every future XSS an exfiltration channel, so
   the images come through the backend instead.
2. **``<img>`` sends no ``Authorization`` header**, so the proxy cannot be
   gated on the bearer token the rest of the API uses.
3. **A proxy that fetches any URL is an open proxy** — anyone could launder
   traffic through the VPS.

So the target is authorised instead of the caller: every image URL is signed
when the discovery response is built
(:mod:`platform_shared.core.signed_url`), and the proxy fetches only URLs
carrying a live signature. Replaying a signed URL is harmless — the attacker
could have fetched that public image directly — but they cannot mint one for
a target of their choosing. The SSRF guard
(:mod:`platform_shared.core.url_safety`) then independently stops even a
*signed* target from being an internal address, because the signer's input
came from a language model reading attacker-influenced pages.

YouTube thumbnails are derived from the video id rather than trusted from the
model: ``i.ytimg.com`` publishes a deterministic path per video, so for the
one source type where a correct picture is guaranteed, we compute it.
"""
from __future__ import annotations

import html
import logging
import re
from urllib.parse import parse_qs, quote, urljoin, urlparse

import httpx

from platform_shared.core.signed_url import (
    SignatureError,
    sign_payload,
    verify_payload,
)
from platform_shared.core.url_safety import UnsafeURLError, assert_url_safe

from app.core.config import settings

logger = logging.getLogger(__name__)

# Long enough that a user can browse results and open one without the grid
# going blank behind them; short enough that a leaked link dies quickly.
_SIGNATURE_TTL_SECONDS = 60 * 60  # 1 hour

_FETCH_TIMEOUT_SECONDS = 10.0
# Thumbnails are small. 8 MB is generous for a hero image and bounds memory —
# the response is buffered, not streamed, so this is a real ceiling.
_MAX_IMAGE_BYTES = 8 * 1024 * 1024

# Follow redirects by hand so the SSRF guard sees every hop: a public URL can
# 302 into an internal one. Image CDNs chain 2-3 hops at most.
_MAX_REDIRECTS = 4
_REDIRECT_STATUSES = frozenset({301, 302, 303, 307, 308})

# Raster formats only. Anything else (HTML, JSON, octet-stream) is refused:
# the proxy must not become a general fetcher returning arbitrary bodies from
# arbitrary hosts.
#
# ``image/svg+xml`` is deliberately EXCLUDED. An SVG is a document that can
# carry script, and this endpoint serves from the app's own origin — a user
# who opens the proxy URL directly would execute a third party's markup as
# us. Scripts do not run in an ``<img>``, but the direct-navigation path is
# enough to make SVG a same-origin XSS vector. No recipe photo is an SVG.
_ALLOWED_IMAGE_TYPES = frozenset(
    {
        "image/jpeg",
        "image/png",
        "image/webp",
        "image/gif",
        "image/avif",
    }
)

_USER_AGENT = (
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36 "
    "MyRecipes/1.0 (+https://myrecipes.myfreeapps.org)"
)

_YOUTUBE_ID = re.compile(r"^[A-Za-z0-9_-]{11}$")


class ImageFetchError(RuntimeError):
    """The image could not be fetched. Maps to 404 — the tile falls back."""


# ---------------------------------------------------------------------------
# Building signed URLs (response side)
# ---------------------------------------------------------------------------


def youtube_thumbnail_url(page_url: str) -> str | None:
    """The canonical thumbnail for a YouTube watch/short/youtu.be URL.

    Derived, not trusted: for this one source type the correct image is a
    pure function of the video id, so a model-supplied guess can only be
    worse.
    """
    try:
        parsed = urlparse(page_url)
    except ValueError:
        return None

    host = (parsed.hostname or "").lower().removeprefix("www.")
    video_id: str | None = None

    if host == "youtu.be":
        video_id = parsed.path.lstrip("/").split("/")[0]
    elif host in ("youtube.com", "m.youtube.com", "music.youtube.com"):
        if parsed.path == "/watch":
            video_id = (parse_qs(parsed.query).get("v") or [None])[0]
        else:
            for prefix in ("/shorts/", "/embed/", "/live/", "/v/"):
                if parsed.path.startswith(prefix):
                    video_id = parsed.path[len(prefix):].split("/")[0]
                    break

    if not video_id or not _YOUTUBE_ID.match(video_id):
        return None
    # hqdefault exists for every video; maxresdefault 404s on older uploads.
    return f"https://i.ytimg.com/vi/{video_id}/hqdefault.jpg"


def signed_image_path(remote_url: str | None, *, page_url: str = "") -> str | None:
    """A proxied, signed path for ``remote_url``, or ``None`` if unusable.

    A YouTube page's derived thumbnail always wins over the model's guess.
    Returns ``None`` rather than raising: a result with no picture renders a
    placeholder tile, which is a better outcome than failing the whole search
    over one bad image URL.
    """
    candidate = youtube_thumbnail_url(page_url) if page_url else None
    if candidate is None:
        candidate = (remote_url or "").strip() or None
    if candidate is None:
        return None

    # Cheap syntactic screen only — no DNS here. The authoritative SSRF check
    # runs at fetch time, when we are about to make the request. Doing a
    # resolve per result would add a DNS round-trip to every card for a check
    # that has to be repeated anyway.
    parsed = urlparse(candidate)
    if parsed.scheme not in ("http", "https") or not parsed.hostname:
        return None

    # One argument per line, magic trailing comma: collapsed onto one line the
    # trailing `ttl_seconds=_SIGNATURE_TTL_SECONDS` reads to gitleaks'
    # generic-api-key heuristic as a secret assigned after `secret=`, and the
    # scan fails on a constant's name.
    signature = sign_payload(
        candidate,
        secret=settings.secret_key,
        ttl_seconds=_SIGNATURE_TTL_SECONDS,
    )
    return f"/discovery/image?url={quote(candidate, safe='')}&sig={signature}"


async def resolve_thumbnail(remote_url: str | None, *, page_url: str) -> str | None:
    """The best available signed thumbnail path for one discovered result.

    Sources in descending order of reliability:

    1. **A derived YouTube thumbnail** — a pure function of the video id.
    2. **The page's own ``og:image``** — what the publisher declares as the
       preview for this URL, and what every link unfurler uses. Costs one
       bounded HTTP read of the page head.
    3. **The model's suggestion** — a URL it saw on the page. Usable, but it
       is the only one of the three nobody authoritative vouched for, so it
       ranks last.

    The publisher's own answer beats the model's for the same reason the
    YouTube one does: it cannot be a near-miss. In practice the model returns
    null for most results (it is told a wrong picture is worse than none), so
    without step 2 a typical search is mostly placeholder tiles.
    """
    derived = signed_image_path(None, page_url=page_url)
    if derived is not None:
        return derived
    return signed_image_path(await fetch_og_image(page_url) or remote_url)


# ---------------------------------------------------------------------------
# Reading a page's declared preview image
# ---------------------------------------------------------------------------

_OG_TIMEOUT_SECONDS = 6.0
# Enough to cover <head> on a heavyweight recipe page without pulling the whole
# document. The read stops at this cap whether or not a tag was found.
_OG_MAX_BYTES = 192 * 1024

# Deliberately two simple passes rather than one clever pattern: find bounded
# <meta …> tags, then read the content attribute out of each. Nothing here
# nests quantifiers, so a hostile page cannot make the scan superlinear.
_META_TAG = re.compile(rb"<meta[^>]{0,800}>", re.IGNORECASE)
_CONTENT_ATTR = re.compile(rb"""content\s*=\s*["']([^"']{1,2000})["']""", re.IGNORECASE)
_OG_KEYS = (b"og:image", b"twitter:image")


def _og_image_from_html(head: bytes, page_url: str) -> str | None:
    for match in _META_TAG.finditer(head):
        tag = match.group(0).lower()
        if not any(key in tag for key in _OG_KEYS):
            continue
        content = _CONTENT_ATTR.search(match.group(0))
        if content is None:
            continue
        raw = html.unescape(content.group(1).decode("utf-8", "replace")).strip()
        if not raw:
            continue
        # Publishers often use a protocol-relative or site-relative path.
        absolute = urljoin(page_url, raw)
        if urlparse(absolute).scheme in ("http", "https"):
            return absolute
    return None


async def fetch_og_image(page_url: str) -> str | None:
    """The ``og:image`` a page declares for itself, or ``None``.

    Best-effort by design: this runs while a user waits on a search, so every
    failure — unreachable host, non-HTML response, no tag, an internal address
    the SSRF guard rejects — resolves to "no picture" rather than an error. A
    missing thumbnail costs a placeholder tile; a raised exception would cost
    the whole search.
    """
    try:
        # Redirects are walked by hand, as in ``fetch_signed_image``: a public
        # URL can 302 into an internal one, so every hop is checked, not just
        # the one we were handed.
        async with httpx.AsyncClient(
            follow_redirects=False,
            timeout=httpx.Timeout(_OG_TIMEOUT_SECONDS),
            headers={"User-Agent": _USER_AGENT, "Accept": "text/html,*/*;q=0.5"},
        ) as client:
            current_url = page_url
            for _ in range(_MAX_REDIRECTS + 1):
                await assert_url_safe(current_url)
                async with client.stream("GET", current_url) as response:
                    if response.status_code in _REDIRECT_STATUSES:
                        location = response.headers.get("location")
                        if not location:
                            return None
                        current_url = urljoin(current_url, location)
                        continue
                    if response.status_code >= 400:
                        return None
                    if "html" not in response.headers.get("content-type", "").lower():
                        return None
                    head = bytearray()
                    async for chunk in response.aiter_bytes():
                        head.extend(chunk)
                        if len(head) >= _OG_MAX_BYTES:
                            break
                    return _og_image_from_html(bytes(head), current_url)
        return None
    except (UnsafeURLError, httpx.HTTPError, UnicodeError, ValueError) as exc:
        logger.info("No og:image for a discovery result: %s", type(exc).__name__)
        return None


# ---------------------------------------------------------------------------
# Serving the proxy (request side)
# ---------------------------------------------------------------------------


async def fetch_signed_image(url: str, signature: str) -> tuple[bytes, str]:
    """Fetch a previously-signed image URL. Returns ``(body, content_type)``.

    Raises:
        SignatureError: the URL was not one we emitted, or the token expired.
        UnsafeURLError: the target (or a redirect hop) is not a public address.
        ImageFetchError: upstream failure, wrong content type, or oversized.
    """
    # Order matters: verify before spending a DNS lookup or a socket on
    # attacker-supplied input.
    verify_payload(url, signature, secret=settings.secret_key)

    headers = {"User-Agent": _USER_AGENT, "Accept": "image/*,*/*;q=0.8"}
    try:
        async with httpx.AsyncClient(
            follow_redirects=False,
            timeout=httpx.Timeout(_FETCH_TIMEOUT_SECONDS),
            headers=headers,
        ) as client:
            current_url = url
            for _ in range(_MAX_REDIRECTS + 1):
                await assert_url_safe(current_url)
                response = await client.get(current_url)
                if response.status_code in _REDIRECT_STATUSES:
                    location = response.headers.get("location")
                    if not location:
                        break
                    current_url = urljoin(current_url, location)
                    continue
                break
            else:
                raise ImageFetchError(f"Too many redirects fetching {url}")
    except UnsafeURLError:
        raise  # a ValueError the route maps to 400
    except httpx.HTTPError as exc:
        raise ImageFetchError(f"Network error fetching image: {exc}") from exc

    if response.status_code >= 400:
        raise ImageFetchError(f"Upstream returned HTTP {response.status_code}")

    # Strip parameters: "image/jpeg; charset=binary" is still image/jpeg.
    content_type = response.headers.get("content-type", "").split(";")[0].strip().lower()
    if content_type not in _ALLOWED_IMAGE_TYPES:
        raise ImageFetchError(f"Refusing non-image content type {content_type!r}")

    if len(response.content) > _MAX_IMAGE_BYTES:
        raise ImageFetchError("Image exceeds the size limit")

    return response.content, content_type


__all__ = [
    "ImageFetchError",
    "SignatureError",
    "UnsafeURLError",
    "fetch_og_image",
    "fetch_signed_image",
    "resolve_thumbnail",
    "signed_image_path",
    "youtube_thumbnail_url",
]
