"""Limits for the fetches behind discovered-recipe thumbnails.

Both targets come from attacker-influenced input (a model reading third-party
pages), so every fetch has a per-phase timeout, one overall deadline, and a
body cap the read stops at.
"""
from __future__ import annotations

from typing import Final

# --- The image proxy (``fetch_signed_image``) -------------------------------

# Seconds for any single phase (connect, one read, ...).
IMAGE_PHASE_TIMEOUT_SECONDS: Final = 10.0

# Seconds for the whole fetch, redirects and body included. A server dripping
# bytes just inside the phase timeout is cut off here.
IMAGE_TOTAL_TIMEOUT_SECONDS: Final = 15.0

# Thumbnails are small. 8 MB is generous for a hero image.
IMAGE_MAX_BYTES: Final = 8 * 1024 * 1024

# Raster formats only. Anything else (HTML, JSON, octet-stream) is refused:
# the proxy must not become a general fetcher returning arbitrary bodies from
# arbitrary hosts.
#
# ``image/svg+xml`` is deliberately EXCLUDED. An SVG is a document that can
# carry script, and this endpoint serves from the app's own origin — a user
# who opens the proxy URL directly would execute a third party's markup as
# us. Scripts do not run in an ``<img>``, but the direct-navigation path is
# enough to make SVG a same-origin XSS vector. No recipe photo is an SVG.
ALLOWED_IMAGE_TYPES: Final[frozenset[str]] = frozenset(
    {
        "image/jpeg",
        "image/png",
        "image/webp",
        "image/gif",
        "image/avif",
    }
)

# --- Reading a page's declared preview image (``fetch_og_image``) -----------

# A user is waiting on the search this runs inside, so these are tighter.
OG_PHASE_TIMEOUT_SECONDS: Final = 6.0
OG_TOTAL_TIMEOUT_SECONDS: Final = 8.0

# Enough to cover <head> on a heavyweight recipe page without pulling the
# whole document. The read stops here whether or not a tag was found.
OG_MAX_BYTES: Final = 192 * 1024

# --- Both --------------------------------------------------------------------

# Redirect hops followed. Image CDNs chain 2-3 at most.
DISCOVERY_FETCH_MAX_REDIRECTS: Final = 4
