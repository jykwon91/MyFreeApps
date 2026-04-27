"""Pydantic schema for the rendered-template preview endpoint.

Returned by GET /inquiries/{id}/render-template/{template_id}. The host's
UI shows the rendered subject + body in a read-only preview the user can
edit before sending. Variable substitution (and the dog-disclosure
auto-prepend) happens server-side so backend and frontend always agree on
the rendered text.
"""
from __future__ import annotations

from pydantic import BaseModel, ConfigDict


class RenderedTemplateResponse(BaseModel):
    subject: str
    body: str

    model_config = ConfigDict(extra="forbid")
