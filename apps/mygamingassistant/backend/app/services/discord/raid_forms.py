"""Form (modal) builders the raid bot's cards share — pure.

A form is a list of labelled text boxes.  One opened from a raid's card
answers to ``raid:v1:m:<event>:<name>`` (``raid_custom_id.MODALS``), so its
submit finds the raid again.
"""
from __future__ import annotations

from typing import Any, Final

from platform_shared.services.discord import COMPONENT_TYPE_LABEL, COMPONENT_TYPE_TEXT_INPUT

from app.models.wow.wow_raid_event import WowRaidEvent
from app.services.discord.interaction import modal_response
from app.services.wow import raid_custom_id

# Each form's one input (Role limits has a box per role, named by the role).
FIELD: Final = "value"


def text_box(
    label: str,
    hint: str | None,
    *,
    style: int,
    value: str | None,
    max_length: int,
    required: bool,
    custom_id: str = FIELD,
    placeholder: str | None = None,
) -> dict[str, Any]:
    """A labelled text box holding *value* (cut to *max_length*); *hint* goes under the label."""
    text_input: dict[str, Any] = {
        "type": COMPONENT_TYPE_TEXT_INPUT,
        "custom_id": custom_id,
        "style": style,
        "max_length": max_length,
        "required": required,
    }
    if required:
        text_input["min_length"] = 1
    if value:
        text_input["value"] = value[:max_length]
    if placeholder is not None:
        text_input["placeholder"] = placeholder
    field: dict[str, Any] = {"type": COMPONENT_TYPE_LABEL, "label": label, "component": text_input}
    if hint is not None:
        field["description"] = hint
    return field


def event_form(event: WowRaidEvent, name: str, title: str, *fields: dict[str, Any]) -> dict[str, Any]:
    """The raid's form *name* (a type-9 response): its submit carries ``raid:v1:m:<event>:<name>``."""
    return modal_response(raid_custom_id.encode("m", event.id, name), title, list(fields))
