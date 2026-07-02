"""Record app-sent Gmail message IDs so the sync never re-ingests them.

MBK sends email through the SAME Gmail account it ingests from (rent
receipts, inquiry replies). Those sent messages live in the user's mailbox
and can match the ingestion search query — a rent receipt matches
``subject:receipt`` + ``has:attachment`` — so without this record the next
sync would feed the app's own output back into Claude extraction. A rent
receipt would then be re-extracted as a second income transaction under the
TENANT's name, which the payer-keyed dedup cannot match against the original
Zelle notification when someone else (spouse, family) sent the money.

Recording the exact Gmail message ID at send time is deliberately the ONLY
mechanism: filtering by from-address (``-from:me``) or subject shape would
also drop legitimate emails the user forwards to themselves, which the
ingestion query explicitly supports.

The recorded row lives in ``email_filter_logs`` — the same audit table the
bounce filter writes to — and ``email_discovery_service`` excludes every
logged message ID from discovery.
"""
import logging
import uuid

from app.db.session import unit_of_work
from app.repositories import email_filter_log_repo
from app.services.email.constants import (
    EMAIL_FILTER_LOG_FROM_ADDRESS_MAX_LEN,
    EMAIL_FILTER_LOG_SUBJECT_MAX_LEN,
)
from app.services.email.header_truncation import truncate_header

logger = logging.getLogger(__name__)


async def record_app_sent_email(
    *,
    organization_id: uuid.UUID,
    user_id: uuid.UUID,
    message_id: str,
    from_address: str | None,
    subject: str | None,
    reason: str,
) -> None:
    """Best-effort: never raises. The email is already sent — failing the
    caller's operation here would make the user retry and send a duplicate
    email. On failure the message stays eligible for re-ingestion, so log
    loudly enough for Sentry to surface it.
    """
    try:
        async with unit_of_work() as db:
            await email_filter_log_repo.insert_ignore_conflict(
                db,
                organization_id=organization_id,
                user_id=user_id,
                message_id=message_id,
                from_address=truncate_header(
                    from_address, EMAIL_FILTER_LOG_FROM_ADDRESS_MAX_LEN
                ),
                subject=truncate_header(subject, EMAIL_FILTER_LOG_SUBJECT_MAX_LEN),
                reason=reason,
            )
    except Exception:
        logger.error(
            "Could not record app-sent email %s (reason=%s) — the Gmail sync "
            "may re-ingest it and create a duplicate transaction",
            message_id, reason,
            exc_info=True,
        )
