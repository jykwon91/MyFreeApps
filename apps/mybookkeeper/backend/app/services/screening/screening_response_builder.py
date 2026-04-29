"""Inject per-request presigned URLs into ``ScreeningResultResponse`` rows.

Screening reports are PII-adjacent (the PDF contains the applicant's full
credit + criminal history) so the storage bucket stays private. The browser
fetches reports via short-lived presigned URLs minted on every read.

Mirrors ``services/listings/photo_response_builder.py`` — the seam where
presigned URLs are minted on read paths.
"""
from __future__ import annotations

import logging

from app.core.config import settings
from app.core.storage import StorageClient, get_storage
from app.schemas.applicants.screening_result_response import ScreeningResultResponse

logger = logging.getLogger(__name__)


def _sign_one(storage: StorageClient, key: str) -> str | None:
    try:
        return storage.generate_presigned_url(key, settings.presigned_url_ttl_seconds)
    except Exception:  # noqa: BLE001 — storage transport errors must degrade gracefully
        logger.warning("Failed to sign presigned URL for %s", key, exc_info=True)
        return None


def attach_presigned_urls(
    results: list[ScreeningResultResponse],
) -> list[ScreeningResultResponse]:
    """Return the same results with ``presigned_url`` populated.

    Rows whose ``report_storage_key`` is None get ``presigned_url=None``.
    When storage is unavailable (local dev, test env) every row gets None
    — the frontend treats None as "no download link, render the row text-only".
    """
    if not results:
        return results
    storage = get_storage()
    if storage is None:
        return [r.model_copy(update={"presigned_url": None}) for r in results]

    return [
        r.model_copy(update={
            "presigned_url": _sign_one(storage, r.report_storage_key)
            if r.report_storage_key
            else None,
        })
        for r in results
    ]
