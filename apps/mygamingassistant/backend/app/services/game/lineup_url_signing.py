"""Screenshot / clip object-URL signing for the lineup library.

Extracted from ``lineup_service`` (file-size no-growth discipline) — a cohesive
unit: turn a stored MinIO/R2 object key into the URL the browser fetches.

Two serving modes, chosen by ``settings.minio_public_base_url``:

- **Public CDN (prod R2):** base set → return a plain ``{base}/{key}`` URL, no
  presigning. Prod R2 holds only accepted (public) clips behind a public custom
  domain, so the URL needs no signature and Cloudflare's edge caches it. See
  ``memory/project_mga_prod_storage_r2.md``.
- **Presigned (local MinIO / CI):** base unset → sign a short-lived GET URL.

``lineup_service`` re-imports ``_object_key_from_value`` + ``_sign_screenshot_url``
so existing call sites — and tests that patch
``lineup_service._sign_screenshot_url`` — keep working unchanged.
"""
from __future__ import annotations

from typing import Optional
from urllib.parse import quote, unquote, urlsplit

from app.core.config import settings
from app.core.storage import get_storage

# Presigned GET URLs for screenshots in card view — 24 hours so images stay
# visible without re-auth on reload. Unused in public-CDN mode, where URLs are
# unsigned and cached by R2/Cloudflare.
_READ_URL_TTL = 24 * 3600  # seconds


def _object_key_from_value(value: str) -> str:
    """Return the bare MinIO object key from a stored screenshot column value.

    Normally *value* is already a bare key (``pending/<vid>/<n>-stand.png`` or
    ``<user_id>/<lineup_id>/stand.png``) — the column's intended content.

    A historical bug (fixed alongside migration 0007) persisted a *presigned
    URL* into the key column: ``_sign_lineup`` assigned the signed URL back
    onto the ORM instance, and mutating flows (accept/patch/create) committed
    the request session, flushing that URL into the object-key column. Reads
    then signed the URL *again*, producing a URL whose "key" was a URL-encoded
    URL → 404 → broken image.

    This peels every URL layer so signing always receives the real key. It is
    idempotent for already-clean keys (returns them unchanged), so it doubles
    as defense-in-depth even after the data-repair migration runs.
    """
    seen = 0
    while value[:4].lower() == "http" and seen < 5:
        parts = urlsplit(value)
        if not parts.scheme or not parts.netloc:
            break
        # URL path is "/<bucket>/<key...>" — drop the leading bucket segment.
        path = parts.path.lstrip("/")
        _, _, key = path.partition("/")
        value = unquote(key or path)
        seen += 1
    return value


def _sign_screenshot_url(stored: Optional[str]) -> Optional[str]:
    """Return a public read URL for the screenshot/clip, or None if unset.

    Two modes, chosen by ``settings.minio_public_base_url``:

    - **Public CDN (prod R2):** when ``minio_public_base_url`` is set, return a
      plain ``{base}/{key}`` URL — no presigning. Prod R2 holds only accepted
      (public) clips behind a public custom domain, so the URL needs no
      signature and Cloudflare's edge can cache it (R2's free-egress win).
    - **Presigned (local MinIO / CI):** when unset, sign a short-lived GET URL
      against MinIO, as before.

    Defensive: extracts the real object key first so a row whose column was
    corrupted with a presigned URL still resolves (and never double-signs).
    """
    if not stored:
        return None
    key = _object_key_from_value(stored)
    if not key:
        return None
    base = settings.minio_public_base_url
    if base:
        # quote(safe="/") keeps path separators while encoding any stray unsafe
        # chars; deterministic keys are already URL-safe so this is a no-op for
        # them, but it hardens against a future key containing e.g. a space.
        return f"{base.rstrip('/')}/{quote(key, safe='/')}"
    storage = get_storage()
    return storage.generate_presigned_url(key, expires_in_seconds=_READ_URL_TTL)


__all__ = ["_READ_URL_TTL", "_object_key_from_value", "_sign_screenshot_url"]
