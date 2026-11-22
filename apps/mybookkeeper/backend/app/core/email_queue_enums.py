"""Canonical ``email_queue.status`` values.

String + ``CheckConstraint``, never SQLAlchemy ``Enum``. The migration that
added the constraint (``emailqueueretry261121``) spells the same list out.

  pending               listed in Gmail, bytes not fetched yet
  fetching              legacy: no longer written, kept so old rows stay valid
  fetched               bytes stored, waiting for (or between) Claude reads
  extracting            claimed by a drain that is reading it
  done                  read and saved
  processed_as_booking  read as a booking confirmation, not a document
  skipped               nothing to read (no attachment worth reading, a bounce)
  failed                gave up; the user can retry it
  dismissed             dismissed by the user while it was being read; kept
                        only so the email is not fetched again
"""
from app.core.sql_in_list import sql_in_list

EMAIL_QUEUE_STATUSES: tuple[str, ...] = (
    "pending",
    "fetching",
    "fetched",
    "extracting",
    "done",
    "processed_as_booking",
    "skipped",
    "failed",
    "dismissed",
)

EMAIL_QUEUE_STATUSES_SQL = sql_in_list(EMAIL_QUEUE_STATUSES)
