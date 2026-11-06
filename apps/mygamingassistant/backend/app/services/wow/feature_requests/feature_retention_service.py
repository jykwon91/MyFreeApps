"""Retention for feature-request data (runs daily from the scheduler, and via
``python -m app.cli purge-wow-feature-submissions``).

- rejected / needs_clarification submissions: deleted after 14 days;
- a story-linked submission's raw text + clarification answer: NULLed 180
  days after it was triaged (the refined story stays);
- every ``ip_hash`` (submissions and votes): NULLed after 30 days.
"""
import logging
from datetime import datetime, timedelta, timezone

from app.core.wow_feature_request_enums import VERDICT_NEEDS_CLARIFICATION, VERDICT_REJECTED
from app.core.wow_feature_request_limits import (
    IP_HASH_RETENTION_DAYS,
    LINKED_RAW_TEXT_RETENTION_DAYS,
    UNLINKED_SUBMISSION_RETENTION_DAYS,
)
from app.db.session import unit_of_work
from app.repositories.wow import feature_submission_repo, feature_vote_repo
from app.services.wow.feature_requests.purge_result import PurgeResult

logger = logging.getLogger(__name__)


async def purge_feature_request_data(*, now: datetime | None = None) -> PurgeResult:
    now = now or datetime.now(timezone.utc)
    async with unit_of_work() as db:
        deleted = await feature_submission_repo.delete_unlinked_before(
            db,
            verdicts=(VERDICT_REJECTED, VERDICT_NEEDS_CLARIFICATION),
            before=now - timedelta(days=UNLINKED_SUBMISSION_RETENTION_DAYS),
        )
        cleared_texts = await feature_submission_repo.clear_text_triaged_before(
            db, before=now - timedelta(days=LINKED_RAW_TEXT_RETENTION_DAYS)
        )
        ip_cutoff = now - timedelta(days=IP_HASH_RETENTION_DAYS)
        submission_ips = await feature_submission_repo.clear_ip_hash_before(db, before=ip_cutoff)
        vote_ips = await feature_vote_repo.clear_ip_hash_before(db, before=ip_cutoff)
    result = PurgeResult(
        deleted_submissions=deleted,
        cleared_texts=cleared_texts,
        cleared_submission_ip_hashes=submission_ips,
        cleared_vote_ip_hashes=vote_ips,
    )
    logger.info(
        "wow feature retention: deleted=%d texts_cleared=%d submission_ips_cleared=%d vote_ips_cleared=%d",
        result.deleted_submissions,
        result.cleared_texts,
        result.cleared_submission_ip_hashes,
        result.cleared_vote_ip_hashes,
    )
    return result
