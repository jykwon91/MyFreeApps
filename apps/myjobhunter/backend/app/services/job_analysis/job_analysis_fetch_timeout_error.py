"""Source URL fetch timed out — HTTP 504."""
from __future__ import annotations

from app.services.job_analysis.job_analysis_error import JobAnalysisError


class JobAnalysisFetchTimeoutError(JobAnalysisError):
    """Source URL fetch timed out — HTTP 504."""
