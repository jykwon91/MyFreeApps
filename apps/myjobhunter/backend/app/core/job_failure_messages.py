"""What MyJobHunter tells the user when work fails and the cause isn't a classified Claude failure.

Storage, database, fetch and validation errors carry text meant for logs, so
the job row, HTTP detail (and so the UI) gets one of these instead.
"""
from __future__ import annotations

RESUME_PARSE_FAILED_MESSAGE = "Something went wrong reading this resume. Try uploading it again."
REFINEMENT_PREP_FAILED_MESSAGE = "Something went wrong preparing your suggestions. Try again."
JOB_ANALYSIS_FAILED_MESSAGE = "Couldn't analyze this job. Try again or paste the description text."
