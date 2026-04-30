"""Repository for ``inquiry_spam_assessments`` (T0).

Append-only — every check that runs against an inquiry writes a row here so the
operator can inspect the full triage trail in the inquiry detail page. The
assessments table has no UPDATE / DELETE paths.
"""
from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.inquiries.inquiry_spam_assessment import InquirySpamAssessment


async def create(
    db: AsyncSession,
    *,
    inquiry_id: uuid.UUID,
    assessment_type: str,
    passed: bool | None,
    score: float | None = None,
    flags: list[str] | None = None,
    details_json: dict[str, Any] | None = None,
) -> InquirySpamAssessment:
    """Append one row to the assessment audit trail."""
    row = InquirySpamAssessment(
        inquiry_id=inquiry_id,
        assessment_type=assessment_type,
        passed=passed,
        score=score,
        flags=flags,
        details_json=details_json,
    )
    db.add(row)
    await db.flush()
    return row


async def list_by_inquiry(
    db: AsyncSession,
    inquiry_id: uuid.UUID,
) -> list[InquirySpamAssessment]:
    """Newest-first audit trail for the operator's expandable detail panel."""
    result = await db.execute(
        select(InquirySpamAssessment)
        .where(InquirySpamAssessment.inquiry_id == inquiry_id)
        .order_by(desc(InquirySpamAssessment.created_at))
    )
    return list(result.scalars().all())
