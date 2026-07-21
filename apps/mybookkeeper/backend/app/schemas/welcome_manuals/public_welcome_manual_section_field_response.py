from pydantic import BaseModel, ConfigDict


class PublicWelcomeManualSectionFieldResponse(BaseModel):
    """Guest-safe field projection — label/value only. No ``id``,
    ``section_id``, or ``display_order``; ordering is carried by list order."""

    label: str
    value: str | None = None

    model_config = ConfigDict(from_attributes=True)
