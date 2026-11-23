"""Source URL was auth-walled or returned an empty body — HTTP 422."""
from __future__ import annotations

from app.services.job_analysis.job_analysis_error import JobAnalysisError


class JobAnalysisFetchAuthRequiredError(JobAnalysisError):
    """Source URL was auth-walled or returned an empty body — HTTP 422."""
