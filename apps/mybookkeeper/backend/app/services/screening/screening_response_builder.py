"""Inject per-request presigned URLs into ``ScreeningResultResponse`` rows.

Screening reports are PII-adjacent (the PDF contains the applicant's full
credit + criminal history) so the storage bucket stays private. The browser
fetches reports via short-lived presigned URLs minted on every read.

Single-seam rule: presigned URLs for screening reports are minted ONLY
through this module. Each row is HEAD-checked via the shared
``attach_presigned_url_with_head_check`` helper; missing objects are
flagged ``is_available=False`` so the UI can render a "Report missing"
affordance. Rows whose ``report_storage_key`` is ``None`` (no report
uploaded yet) skip the HEAD entirely and pass through unchanged.
"""
from __future__ import annotations

from app.schemas.applicants.screening_result_response import ScreeningResultResponse
from app.services.storage.presigned_url_attacher import (
    attach_presigned_url_with_head_check,
)


def attach_presigned_urls(
    results: list[ScreeningResultResponse],
) -> list[ScreeningResultResponse]:
    return attach_presigned_url_with_head_check(
        results,
        storage_key_attr="report_storage_key",
        sentry_event_name="screening_report_storage_object_missing",
    )
