"""The reply to "Research now": the run that was opened."""
import uuid

from pydantic import BaseModel


class SavingsResearchStartedResponse(BaseModel):
    run_id: uuid.UUID
