"""Request schemas for the Analyze-a-job endpoints."""
from __future__ import annotations

from pydantic import AnyHttpUrl, BaseModel, ConfigDict, model_validator


class JobAnalysisRequest(BaseModel):
    """Body for ``POST /jobs/analyze``.

    Exactly one of ``url`` / ``jd_text`` must be present. The model
    validator enforces this so the route handler never receives a
    request that's both empty and superficially valid.

    The "exactly one" constraint mirrors the operator workflow: pasting
    a URL fetches the JD server-side; pasting text skips fetching. We
    don't accept both because then we'd have to reconcile two sources
    of truth, and there's no UX path that produces both.
    """

    model_config = ConfigDict(extra="forbid")

    url: AnyHttpUrl | None = None
    jd_text: str | None = None

    @model_validator(mode="after")
    def _exactly_one_source(self) -> "JobAnalysisRequest":
        has_url = self.url is not None
        has_text = bool(self.jd_text and self.jd_text.strip())
        if has_url == has_text:
            # Both true OR both false — both are invalid.
            raise ValueError(
                "Provide either url OR jd_text — not both, not neither.",
            )
        return self
