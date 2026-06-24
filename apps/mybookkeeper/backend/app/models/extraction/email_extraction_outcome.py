"""Outcome of persisting an email's extracted documents.

Carries both the number of transactions/documents created and, when zero
were created, a human-readable reason. The reason is written to the
``email_queue`` row so the Sync Sessions UI can explain why an email that
synced successfully produced no records — closing the "silent drop"
observability gap where utility bills were fetched, run through Claude, and
dropped with no trace.
"""
from dataclasses import dataclass


@dataclass(frozen=True)
class EmailExtractionOutcome:
    records_added: int
    skip_reason: str | None = None
