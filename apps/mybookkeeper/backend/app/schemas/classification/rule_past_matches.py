from pydantic import BaseModel


class RulePastMatches(BaseModel):
    """How many past payments a payee rule would refile."""

    count: int
