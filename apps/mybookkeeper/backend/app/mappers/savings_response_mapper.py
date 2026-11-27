"""Savings rows → the Savings page's response schemas."""
from app.models.savings.savings_idea import SavingsIdea
from app.models.savings.savings_research_run import SavingsResearchRun
from app.schemas.savings.savings_card_details_response import SavingsCardDetailsResponse
from app.schemas.savings.savings_idea_response import SavingsIdeaResponse
from app.schemas.savings.savings_run_response import SavingsRunResponse


def idea_to_response(idea: SavingsIdea) -> SavingsIdeaResponse:
    card = SavingsCardDetailsResponse.model_validate(idea.card_details) if idea.card_details else None
    return SavingsIdeaResponse(
        id=idea.id,
        category=idea.category,
        title=idea.title,
        savings_low_cents=idea.savings_low_cents,
        savings_high_cents=idea.savings_high_cents,
        effort=idea.effort,
        why_it_fits=idea.why_it_fits,
        steps=list(idea.steps or []),
        source_urls=list(idea.source_urls or []),
        card_details=card,
        expires_on=idea.expires_on,
        status=idea.status,
        last_confirmed_at=idea.last_confirmed_at,
    )


def run_to_response(run: SavingsResearchRun) -> SavingsRunResponse:
    return SavingsRunResponse(
        id=run.id,
        trigger=run.trigger,
        status=run.status,
        started_at=run.started_at,
        finished_at=run.finished_at,
        error_type=run.error_type,
        ideas_found=run.ideas_found,
    )
