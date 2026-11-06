"""Failure modes of WoW feature requests (public submit/vote + triage).

The API layer (``app/api/wow_features.py``) maps each class to an HTTP status
and a machine-readable detail. ``error_type`` carries Anthropic's documented
``error.type`` (or our own code) for logs.
"""


class FeatureRequestError(Exception):
    """Base class, never raised directly."""

    def __init__(self, message: str, *, error_type: str | None = None) -> None:
        super().__init__(message)
        self.error_type = error_type


class FeatureRequestInputError(FeatureRequestError):
    """The request is unusable (text too short/long after cleaning)."""


class FeatureRequestNotFoundError(FeatureRequestError):
    """The story or parent submission doesn't exist (or isn't public)."""


class FeatureClarificationAnsweredError(FeatureRequestError):
    """The parent submission was already followed up, or isn't a question."""


class FeatureInboxFullError(FeatureRequestError):
    """Too many untriaged submissions; triage has to catch up."""


class FeatureRequestNotConfiguredError(FeatureRequestError):
    """ANTHROPIC_API_KEY is not set on this deployment."""


class FeatureRequestDailyCapError(FeatureRequestError):
    """The global daily cap of refinements is used up."""


class FeatureRefinerRateLimitedError(FeatureRequestError):
    """Anthropic answered rate_limit_error."""


class FeatureRefinerMisconfiguredError(FeatureRequestError):
    """Anthropic rejected our credentials or permissions (operator problem)."""


class FeatureRefinerUpstreamError(FeatureRequestError):
    """Anthropic overloaded / errored / timed out / unreachable, or no tool call."""


class StoryNotVotableError(FeatureRequestError):
    """Votes are only taken on open / planned / in_progress stories."""


class VoteLimitError(FeatureRequestError):
    """This network already cast the most votes allowed on this story."""


class TriageConflictError(FeatureRequestError):
    """A triage write conflicts with the story's state (merge rules, status)."""


class StoryChangedError(FeatureRequestError):
    """If-Match didn't match the story's updated_at: someone changed it."""
