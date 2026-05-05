"""Service-layer errors for the resume-refinement feature.

Routers translate these to HTTP responses; tests assert on the
specific subclass instead of substring-matching on the error message.
"""


class ResumeRefinementError(Exception):
    """Base for all resume-refinement service errors."""


class SourceJobNotReady(ResumeRefinementError):
    """The source resume_upload_jobs row is not status=complete yet."""


class SourceJobNotFound(ResumeRefinementError):
    """The source resume_upload_jobs row does not exist or is not the user's."""


class SessionNotFound(ResumeRefinementError):
    """The requested session does not exist or is not the user's."""


class SessionNotActive(ResumeRefinementError):
    """The session is completed or abandoned and cannot be modified."""


class NoPendingProposal(ResumeRefinementError):
    """The user tried to accept/skip a proposal but there isn't one."""


class NoMoreTargets(ResumeRefinementError):
    """The improvement_targets list has been fully consumed."""


class HallucinationGuardFailed(ResumeRefinementError):
    """The AI proposal introduced facts not present in the source."""

    def __init__(self, missing_facts: list[str]):
        super().__init__(
            f"Proposal introduces facts not in source: {', '.join(missing_facts[:5])}"
        )
        self.missing_facts = missing_facts


class CritiqueRetryExceeded(ResumeRefinementError):
    """Claude failed to return a usable critique after retries."""
