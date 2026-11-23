"""Source URL was malformed — HTTP 400."""
from __future__ import annotations

from app.services.job_analysis.job_analysis_error import JobAnalysisError


class JobAnalysisInvalidUrlError(JobAnalysisError):
    """Source URL was malformed — HTTP 400."""
