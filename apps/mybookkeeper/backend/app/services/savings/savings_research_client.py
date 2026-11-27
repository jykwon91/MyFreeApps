"""The one ResearchService the savings job calls Claude through."""
from platform_shared.extraction import ResearchService

from app.core.config import settings
from app.core.savings_constants import RESEARCH_MODEL, RESEARCH_TIMEOUT_SECONDS

research_service = ResearchService(
    api_key=settings.anthropic_api_key,
    model=RESEARCH_MODEL,
    timeout_seconds=RESEARCH_TIMEOUT_SECONDS,
)
