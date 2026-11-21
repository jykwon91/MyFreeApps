"""The coded 409 the resume-refinement answer routes send for a stale answer.

``{"code", "message"}``, the shape Discover's triage 409s use, so clients
key on the code, not the wording. Accept, accept-flagged, write-my-own and
skip send it when the client says which suggestion it was showing and the
session has since moved on: nothing was applied, and the client reloads the
session to show the current suggestion.
"""
from __future__ import annotations

SUGGESTION_CHANGED_CODE = "REFINEMENT_SUGGESTION_CHANGED"
SUGGESTION_CHANGED_MESSAGE = (
    "That suggestion had already changed, so nothing was applied. "
    "The current one is showing now."
)
