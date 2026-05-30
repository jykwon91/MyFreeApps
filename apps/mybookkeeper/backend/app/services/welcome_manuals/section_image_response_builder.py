"""Inject per-request presigned URLs into WelcomeManualSectionImageResponse rows.

Single-seam rule (same as listings' photo_response_builder): presigned URLs for
welcome-manual images are minted ONLY through this module. Each row is
HEAD-checked; missing objects are flagged ``is_available=False`` so the UI can
render a placeholder instead of a broken image.
"""
from __future__ import annotations

from app.schemas.welcome_manuals.welcome_manual_section_image_response import (
    WelcomeManualSectionImageResponse,
)
from app.services.storage.presigned_url_attacher import (
    attach_presigned_url_with_head_check,
)


def attach_presigned_urls(
    images: list[WelcomeManualSectionImageResponse],
) -> list[WelcomeManualSectionImageResponse]:
    return attach_presigned_url_with_head_check(
        images,
        sentry_event_name="welcome_manual_image_storage_object_missing",
    )
