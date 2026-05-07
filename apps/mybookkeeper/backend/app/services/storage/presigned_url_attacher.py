"""Generic helper for attaching presigned URLs + is_available flags.

Every domain that surfaces stored objects to the user (leases, lease
receipts, insurance attachments, listing-blackout attachments, listing
photos, screening result PDFs, lease-template files) needs the same
shape on read paths:

1. ``HEAD`` the underlying object via ``StorageClient.object_exists``.
2. If present, mint a short-lived presigned URL.
3. If missing (NoSuchKey), set ``is_available=False`` and skip the URL
   so the UI can render a "File missing — re-upload" affordance.
4. Emit a Sentry warning so the operator has observability without a
   diagnostic API surfacing user data.

Transient S3 errors (network blip, signature mismatch, server 5xx)
propagate as exceptions per ``object_exists`` so MinIO outages crash
the request loudly instead of being mistaken for data loss. This
matches the rule in ``services/leases/attachment_response_builder.py``:
silent ``presigned_url=None`` placeholders for outages were the source
of the PR #201–#204 outage trail and are no longer permitted.
"""
from __future__ import annotations

import logging
from typing import Callable, TypeVar
from urllib.parse import quote

import sentry_sdk
from pydantic import BaseModel

from app.core.config import settings
from app.core.storage import get_storage

logger = logging.getLogger(__name__)

_T = TypeVar("_T", bound=BaseModel)


def build_attachment_disposition(filename: str) -> str:
    """Build a ``Content-Disposition: attachment`` header value.

    Emits both the legacy ASCII ``filename=`` and the RFC 5987
    ``filename*=UTF-8''<percent-encoded>`` form so non-ASCII names round-
    trip cleanly across browsers. Inner double-quotes and backslashes in
    the ASCII form are escaped per RFC 6266; falling back to the
    percent-encoded form on browsers that respect ``filename*`` covers
    everything else (e.g. accented characters, emoji).
    """
    safe_ascii = filename.replace("\\", "\\\\").replace('"', '\\"')
    encoded = quote(filename, safe="")
    return f'attachment; filename="{safe_ascii}"; filename*=UTF-8\'\'{encoded}'


def attach_presigned_url_with_head_check(
    items: list[_T],
    *,
    storage_key_attr: str = "storage_key",
    presigned_url_attr: str = "presigned_url",
    is_available_attr: str = "is_available",
    sentry_event_name: str,
    extra_sentry_tags: dict[str, str] | None = None,
    download_filename_resolver: Callable[[_T], str | None] | None = None,
) -> list[_T]:
    """Attach a presigned URL + is_available flag to each item in-place
    (returns new model copies — Pydantic models are immutable).

    Args:
        items: list of Pydantic models with ``storage_key`` (or override
            via ``storage_key_attr``) plus ``presigned_url`` and
            ``is_available`` fields.
        storage_key_attr: attribute name on each item holding the storage
            key. Defaults to ``"storage_key"``.
        presigned_url_attr: attribute name to write the URL into.
        is_available_attr: attribute name for the orphan flag.
        sentry_event_name: Sentry message string emitted on a missing
            object. Domain-specific so dashboards can group / alert per
            domain.
        extra_sentry_tags: additional fixed tags to attach to every
            Sentry event (e.g., ``{"domain": "insurance"}``). Per-row
            tags such as ``lease_id`` / ``attachment_id`` are wired
            automatically when the model exposes those attributes.
        download_filename_resolver: optional callable that maps a row to
            the human-readable download filename. When provided and it
            returns a non-empty string, the presigned URL is signed with
            ``response-content-disposition: attachment; filename="..."``
            so MinIO emits the header on the GET — the browser saves the
            file under that name instead of the storage-key GUID.
            Returning ``None`` skips the disposition for that row (used
            by inline-displayed assets like listing photos).

    Returns:
        New list of model copies with the two fields set. Items whose
        ``storage_key`` is ``None`` are returned unchanged (no HEAD,
        no URL, no is_available flip) — used for screening rows that
        haven't had a report uploaded yet.
    """
    if not items:
        return items

    storage = get_storage()
    out: list[_T] = []
    for item in items:
        key = getattr(item, storage_key_attr, None)
        if not key:
            out.append(item)
            continue
        if not storage.object_exists(key):
            logger.warning(
                "Stored object missing for %s: id=%s key=%s",
                sentry_event_name,
                getattr(item, "id", "?"),
                key,
            )
            with sentry_sdk.new_scope() as scope:
                if extra_sentry_tags:
                    for tag_key, tag_value in extra_sentry_tags.items():
                        scope.set_tag(tag_key, tag_value)
                # Auto-tag from common attribute names so dashboards can
                # filter by row identity without each domain wiring this.
                for attr in ("id", "lease_id", "applicant_id", "listing_id"):
                    value = getattr(item, attr, None)
                    if value is not None:
                        scope.set_tag(attr, str(value))
                scope.set_extra("storage_key", key)
                sentry_sdk.capture_message(sentry_event_name, level="warning")
            out.append(item.model_copy(update={
                presigned_url_attr: None,
                is_available_attr: False,
            }))
            continue
        disposition: str | None = None
        if download_filename_resolver is not None:
            resolved = download_filename_resolver(item)
            if resolved:
                disposition = build_attachment_disposition(resolved)
        url = storage.generate_presigned_url(
            key,
            settings.presigned_url_ttl_seconds,
            response_content_disposition=disposition,
        )
        out.append(item.model_copy(update={
            presigned_url_attr: url,
            is_available_attr: True,
        }))
    return out
