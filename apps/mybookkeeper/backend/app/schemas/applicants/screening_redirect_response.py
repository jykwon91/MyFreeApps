"""Response shape for ``GET /applicants/{id}/screening/redirect``.

PR 3.3 (rentals Phase 3, KeyCheck redirect-only): the backend looks up the
configured screening provider's dashboard URL and hands it to the frontend,
which then opens the URL in a new tab. The host completes the screening on
the provider's site and uploads the resulting PDF via the upload endpoint.
"""
from __future__ import annotations

from pydantic import BaseModel, ConfigDict


class ScreeningRedirectResponse(BaseModel):
    redirect_url: str
    provider: str

    model_config = ConfigDict(from_attributes=True)
