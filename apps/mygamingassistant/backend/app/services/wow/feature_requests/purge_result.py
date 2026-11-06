"""What one retention purge removed."""
from dataclasses import dataclass


@dataclass(frozen=True)
class PurgeResult:
    deleted_submissions: int
    cleared_texts: int
    cleared_submission_ip_hashes: int
    cleared_vote_ip_hashes: int
