"""Base for PATCH bodies: omitted means unchanged, explicit null is rejected for NOT NULL columns."""
from typing import ClassVar, Self

from pydantic import BaseModel, model_validator


class PatchModel(BaseModel):
    """Subclasses list the fields backed by NOT NULL columns in ``non_nullable_fields``.

    An omitted field is left alone by ``model_dump(exclude_unset=True)``. A field sent as an
    explicit null would be written to the database and fail the NOT NULL constraint, so it is
    rejected up front as a 422. Nullable columns (description, notes) are left out of the set
    and keep accepting null to clear them.
    """

    non_nullable_fields: ClassVar[frozenset[str]] = frozenset()

    @model_validator(mode="after")
    def _reject_explicit_nulls(self) -> Self:
        null_fields = sorted(
            name
            for name in self.model_fields_set & self.non_nullable_fields
            if getattr(self, name) is None
        )
        if null_fields:
            raise ValueError(f"{', '.join(null_fields)} must not be null; omit the field to leave it unchanged")
        return self
