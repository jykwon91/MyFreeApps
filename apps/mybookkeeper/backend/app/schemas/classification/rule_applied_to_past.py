from pydantic import BaseModel


class RuleAppliedToPast(BaseModel):
    """How many past payments a payee rule refiled."""

    applied: int
