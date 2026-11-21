"""Raised when a company's research is asked for while a run is already in flight."""
from __future__ import annotations


class ResearchAlreadyRunningError(Exception):
    """Another request is running this company's research; this one would pay for it twice."""
