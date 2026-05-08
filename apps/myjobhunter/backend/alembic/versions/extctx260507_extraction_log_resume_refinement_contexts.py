"""Extend ``chk_extraction_log_context_type`` to permit resume-refinement
and JD-URL extraction context values.

The CHECK constraint on ``extraction_logs.context_type`` was last
extended in ``disco260507_discovery_tables.py`` to add ``'job_analysis'``.
It still rejects three context values that the application code already
writes:

- ``resume_critique`` — emitted by ``critique_service.run_critique``
  during resume-refinement session start.
- ``resume_rewrite`` — emitted by ``rewrite_service.run_rewrite`` during
  per-target proposal generation.
- ``jd_url_parse`` — emitted by ``jd_url_extractor`` when fetching +
  parsing a JD from a pasted URL on the Add Application flow.

These were silently swallowed until PR #426 removed the bare
``try/except`` around the extraction-log INSERT in
``claude_service._record_log``. Now the IntegrityError propagates out
of the ``finally`` block in ``call_claude_with_meta``, surfacing as a
500 on POST /api/resume-refinement/sessions (and on JD-URL parsing).

No data backfill — historical rows are unaffected. New rows for these
contexts will land correctly going forward, restoring per-feature cost
rollups for resume refinement and URL-based JD ingestion.

Revision ID: extctx260507
Revises: discrsn260507
Create Date: 2026-05-07
"""
from typing import Sequence, Union

from alembic import op


revision: str = "extctx260507"
down_revision: Union[str, None] = "discrsn260507"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_OLD_EXTRACTION_CONTEXTS = (
    "resume_parse",
    "jd_parse",
    "company_research",
    "cover_letter",
    "resume_tailor",
    "email_classify",
    "job_analysis",
    "other",
)
_NEW_EXTRACTION_CONTEXTS = _OLD_EXTRACTION_CONTEXTS + (
    "resume_critique",
    "resume_rewrite",
    "jd_url_parse",
)


def _quote_list(values: tuple[str, ...]) -> str:
    return ",".join(f"'{v}'" for v in values)


def upgrade() -> None:
    op.drop_constraint(
        "chk_extraction_log_context_type",
        "extraction_logs",
        type_="check",
    )
    op.create_check_constraint(
        "chk_extraction_log_context_type",
        "extraction_logs",
        f"context_type IN ({_quote_list(_NEW_EXTRACTION_CONTEXTS)})",
    )


def downgrade() -> None:
    op.drop_constraint(
        "chk_extraction_log_context_type",
        "extraction_logs",
        type_="check",
    )
    op.create_check_constraint(
        "chk_extraction_log_context_type",
        "extraction_logs",
        f"context_type IN ({_quote_list(_OLD_EXTRACTION_CONTEXTS)})",
    )
