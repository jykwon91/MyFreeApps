from dataclasses import dataclass

from app.models.extraction.extraction_failure_kind import ExtractionFailureKind


@dataclass(frozen=True)
class ExtractionFailure:
    """A classified extraction failure: what went wrong, and whether to try again."""

    kind: ExtractionFailureKind
    retryable: bool
