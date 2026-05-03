"""Response shape for ``GET /applicants/{id}/screening/providers``.

Returns the static provider grid metadata used by the frontend to render
the provider-selection UI. Costs and turnaround times are approximate and
operator-facing only — not a binding quote from the provider.
"""
from __future__ import annotations

from pydantic import BaseModel, ConfigDict


class ScreeningProviderInfo(BaseModel):
    name: str
    label: str
    description: str
    cost_label: str
    turnaround_label: str
    external_url: str

    model_config = ConfigDict(extra="forbid")


class ScreeningProvidersResponse(BaseModel):
    providers: list[ScreeningProviderInfo]

    model_config = ConfigDict(extra="forbid")
