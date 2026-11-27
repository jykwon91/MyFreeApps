import uuid
from dataclasses import dataclass, field


@dataclass(frozen=True)
class RuleFiling:
    """What a rule the person set up does beyond the category and property."""

    transaction_scope: str | None = None
    split_property_ids: list[uuid.UUID] = field(default_factory=list)
