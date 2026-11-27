"""Everything the Savings page shows in one read."""
import datetime as _dt

from pydantic import BaseModel

from app.schemas.savings.savings_idea_response import SavingsIdeaResponse
from app.schemas.savings.savings_run_response import SavingsRunResponse


class SavingsOverviewResponse(BaseModel):
    research_enabled: bool
    # Sum over the open ideas listed below.
    total_savings_low_cents: int
    total_savings_high_cents: int
    last_researched_at: _dt.datetime | None
    # None while research is off or a run is in progress.
    next_research_due_at: _dt.datetime | None
    run_in_progress: bool
    latest_run: SavingsRunResponse | None
    manual_runs_left: int
    manual_run_limit: int
    # When "Research now" is available again; None unless the limit is reached.
    next_manual_run_at: _dt.datetime | None
    ideas: list[SavingsIdeaResponse]
