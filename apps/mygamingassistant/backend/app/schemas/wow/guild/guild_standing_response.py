"""One live guild member's standing with the chosen faction."""
from pydantic import BaseModel


class GuildStandingResponse(BaseModel):
    # The member's character slug (the guild page's members carry the rest).
    slug: str
    # 0 = Hated … 7 = Exalted.
    tier: int
    # Progress within the tier, out of ``max``.
    value: int
    max: int
