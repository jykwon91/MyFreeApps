"""Boot guard for the public host that lineup clips and screenshots are served from."""
import logging
import socket
from urllib.parse import urlsplit

from app.core.config import settings
from app.core.media_public_base_url_unresolvable_error import MediaPublicBaseUrlUnresolvableError

logger = logging.getLogger("app")


def check_media_public_base_url_resolvable() -> None:
    """Fail loud in prod if the configured public media host does not resolve.

    ``minio_public_base_url`` drives clip/screenshot read URLs (see
    ``lineup_url_signing._sign_screenshot_url``):

    - **Empty (default prod mode):** URLs are presigned against the R2 S3
      endpoint, which is always reachable — there is no separate public host to
      check, so this guard is a no-op.
    - **Set:** URLs become plain ``{base}/{key}`` against that host. If the host
      does not resolve, every clip is a dead link while /health stays green.
      That is the exact silent failure this guard converts into a loud boot
      crash (prod) or a warning (dev/CI).
    """
    base = settings.minio_public_base_url
    if not base:
        return  # presigned mode — no separate public host to verify
    host = urlsplit(base).hostname
    if not host:
        raise MediaPublicBaseUrlUnresolvableError(
            f"MINIO_PUBLIC_BASE_URL={base!r} is not a valid absolute URL (no host). "
            "Set it to the full https URL of a BOUND R2 custom domain, or leave it "
            "empty to serve presigned R2 URLs (the default prod mode). See "
            "apps/mygamingassistant/backend/.env.docker.example."
        )
    try:
        socket.getaddrinfo(host, 443)
    except socket.gaierror as exc:
        msg = (
            f"MINIO_PUBLIC_BASE_URL host {host!r} does not resolve ({exc}). Every "
            "lineup clip/screenshot URL would point at a dead host while /health "
            "stays green (the 2026-07-10 incident). Either bind that domain as an "
            "R2 custom domain (requires the DNS zone on Cloudflare — see "
            "apps/mygamingassistant/TECH_DEBT.md), or leave MINIO_PUBLIC_BASE_URL "
            "empty to serve presigned R2 URLs (the default prod mode). See "
            "apps/mygamingassistant/backend/.env.docker.example."
        )
        if settings.environment == "production":
            raise MediaPublicBaseUrlUnresolvableError(msg) from exc
        logger.warning("_on_startup: %s (non-production — continuing)", msg)
