"""Schema for POST /signed-leases — create a draft from one or more templates."""
from __future__ import annotations

import uuid
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class SignedLeaseCreateRequest(BaseModel):
    """Request body for creating a draft signed lease.

    The host can pass:
    - ``template_ids: [uuid, uuid, ...]`` for multi-template generation
    - ``template_id: uuid`` for backward compatibility with single-template clients

    At least one of the two must be provided. If both are provided,
    ``template_ids`` wins. The server normalises to ``template_ids`` internally.
    """

    template_ids: list[uuid.UUID] | None = None
    # Back-compat: legacy single-template clients still send ``template_id``.
    # Normalised into ``template_ids`` by the validator below.
    template_id: uuid.UUID | None = None
    applicant_id: uuid.UUID
    listing_id: uuid.UUID | None = None
    values: dict[str, Any] = Field(default_factory=dict)

    model_config = ConfigDict(extra="forbid")

    @field_validator("template_ids")
    @classmethod
    def _dedupe_template_ids(cls, v: list[uuid.UUID] | None) -> list[uuid.UUID] | None:
        if v is None:
            return None
        seen: set[uuid.UUID] = set()
        deduped: list[uuid.UUID] = []
        for tid in v:
            if tid not in seen:
                seen.add(tid)
                deduped.append(tid)
        return deduped

    @model_validator(mode="after")
    def _normalise_template_ids(self) -> "SignedLeaseCreateRequest":
        if self.template_ids is None or len(self.template_ids) == 0:
            if self.template_id is None:
                raise ValueError(
                    "Either 'template_ids' (list) or 'template_id' (single) is required",
                )
            # Promote legacy single-template field into the list form.
            self.template_ids = [self.template_id]
        return self

    @property
    def resolved_template_ids(self) -> list[uuid.UUID]:
        """Return the canonical, deduped, ordered list of template IDs."""
        # ``_normalise_template_ids`` guarantees this is set after validation.
        assert self.template_ids is not None  # noqa: S101 — invariant
        return self.template_ids
