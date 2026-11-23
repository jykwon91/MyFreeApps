"""Applicant, document, email, inquiry, money and vendor writes are audited.

These repositories used to change rows with bulk ``UPDATE`` / ``DELETE``
statements, which the audit listener never sees. Each case runs one write and
checks it left audit rows for the row it changed, naming the actor.
"""
from __future__ import annotations

import datetime as _dt
import uuid
from decimal import Decimal

import pytest
from platform_shared.testing.audited_write_case import AuditedWriteCase, run_audited_write_case
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.applicant_enums import APPLICANT_STAGES, REFERENCE_RELATIONSHIPS, SCREENING_PROVIDERS
from app.core.inquiry_enums import INQUIRY_SOURCES, INQUIRY_SPAM_STATUSES, INQUIRY_STAGES, INQUIRY_SUBMITTED_VIA
from app.core.insurance_enums import INSURANCE_ATTACHMENT_KINDS
from app.core.mortgage_enums import RATE_TYPES as MORTGAGE_RATE_TYPES
from app.core.tax_return_enums import FILING_STATUSES
from app.core.utility_plan_constants import RATE_TYPE_FIXED, SERVICE_TYPE_ELECTRICITY
from app.core.vendor_enums import VENDOR_CATEGORIES
from app.models.applicants.applicant import Applicant
from app.models.applicants.reference import Reference
from app.models.applicants.screening_result import ScreeningResult
from app.models.applicants.video_call_note import VideoCallNote
from app.models.documents.document import Document
from app.models.email.email_queue import EmailQueue
from app.models.extraction.extraction import Extraction
from app.models.extraction.extraction_prompt import ExtractionPrompt
from app.models.inquiries.inquiry import Inquiry
from app.models.inquiries.inquiry_reply_send import InquiryReplySend
from app.models.inquiries.reply_template import ReplyTemplate
from app.models.insurance.insurance_benchmark import InsuranceBenchmark
from app.models.insurance.insurance_policy import InsurancePolicy
from app.models.insurance.insurance_policy_attachment import InsurancePolicyAttachment
from app.models.mortgage.mortgage import Mortgage
from app.models.properties.market_rate_benchmark import MarketRateBenchmark
from app.models.properties.utility_plan import UtilityPlan
from app.models.tax.tax_advisor_suggestion import TaxAdvisorSuggestion
from app.models.tax.tax_return import TaxReturn
from app.models.transactions.reconciliation_source import ReconciliationSource
from app.models.transactions.rent_attribution_review_queue import RentAttributionReviewQueue
from app.models.transactions.transaction import Transaction
from app.models.vendors.vendor import Vendor
from app.repositories.applicants import applicant_repo, reference_repo, screening_result_repo, video_call_note_repo
from app.repositories.documents import document_repo
from app.repositories.email import email_queue_repo
from app.repositories.extraction import extraction_prompt_repo, extraction_repo
from app.repositories.inquiries import inquiry_reply_send_repo, inquiry_repo, reply_template_repo
from app.repositories.insurance import insurance_benchmark_repo, insurance_policy_attachment_repo, insurance_policy_repo
from app.repositories.mortgage import mortgage_repo
from app.repositories.properties import market_rate_benchmark_repo, utility_plan_repo
from app.repositories.tax import tax_advisor_repo, tax_return_repo
from app.repositories.transactions import (
    attribution_repo,
    reconciliation_repo,
    transaction_bulk_repo,
    transaction_reconciliation_repo,
)
from app.repositories.vendors import vendor_repo
from tests.audited_row_factory import make_row

ORG = uuid.uuid4()
USER = uuid.uuid4()
NOW = _dt.datetime(2026, 11, 1, 12, 0, tzinfo=_dt.UTC)


def _owned(model: type, **fields: object):  # type: ignore[no-untyped-def]
    async def seed(db: AsyncSession):  # type: ignore[no-untyped-def]
        return await make_row(db, model, organization_id=ORG, user_id=USER, **fields)
    return seed


def _row(model: type, **fields: object):  # type: ignore[no-untyped-def]
    async def seed(db: AsyncSession):  # type: ignore[no-untyped-def]
        return await make_row(db, model, **fields)
    return seed


def _of_applicant(model: type, **fields: object):  # type: ignore[no-untyped-def]
    """A child row of an applicant owned by ``USER`` (the repos scope through it)."""
    async def seed(db: AsyncSession):  # type: ignore[no-untyped-def]
        applicant = await make_row(db, Applicant, organization_id=ORG, user_id=USER, stage=APPLICANT_STAGES[0])
        return await make_row(db, model, applicant_id=applicant.id, **fields)
    return seed


_INQUIRY = {
    "source": INQUIRY_SOURCES[0], "stage": INQUIRY_STAGES[0],
    "submitted_via": INQUIRY_SUBMITTED_VIA[0], "spam_status": INQUIRY_SPAM_STATUSES[0],
}
_TRANSACTION = {
    "transaction_type": "income", "category": "rental_revenue", "status": "approved", "tax_year": 2026,
}
_CLAIMED = {"status": "extracting", "claimed_at": NOW}
_EMAIL_QUEUE = {"message_id": "gmail-1"}

CASES = [
    # Applicants
    AuditedWriteCase(
        "applicant.soft_delete", _owned(Applicant, stage=APPLICANT_STAGES[0]),
        lambda db, row: applicant_repo.soft_delete(db, applicant_id=row.id, organization_id=ORG, user_id=USER),
        "UPDATE", frozenset({"deleted_at"}),
    ),
    AuditedWriteCase(
        "reference.mark_contacted", _of_applicant(Reference, relationship=REFERENCE_RELATIONSHIPS[0]),
        lambda db, row: reference_repo.mark_contacted(
            db, reference_id=row.id, organization_id=ORG, user_id=USER, contacted_at=NOW, notes="Called",
        ),
        "UPDATE", frozenset({"contacted_at", "notes"}),
    ),
    AuditedWriteCase(
        "screening_result.update_status",
        _of_applicant(ScreeningResult, provider=SCREENING_PROVIDERS[0], status="pending"),
        lambda db, row: screening_result_repo.update_status(
            db, screening_result_id=row.id, organization_id=ORG, user_id=USER,
            status="pass", completed_at=NOW, adverse_action_snippet=None,
        ),
        "UPDATE", frozenset({"status", "completed_at"}),
    ),
    AuditedWriteCase(
        "video_call_note.update_note", _of_applicant(VideoCallNote),
        lambda db, row: video_call_note_repo.update_note(
            db, video_call_note_id=row.id, organization_id=ORG, user_id=USER, fields={"gut_rating": 4},
        ),
        "UPDATE", frozenset({"gut_rating"}),
    ),
    # Documents
    AuditedWriteCase(
        "document.soft_delete_by_user", _owned(Document),
        lambda db, row: document_repo.soft_delete_by_user(db, ORG, [row.id]),
        "UPDATE", frozenset({"status", "deleted_at"}),
    ),
    AuditedWriteCase(
        "document.soft_delete_still_failed", _owned(Document, status="failed"),
        lambda db, row: document_repo.soft_delete_still_failed(db, ORG, [row.id]),
        "UPDATE", frozenset({"status", "deleted_at"}),
    ),
    AuditedWriteCase(
        "document.reset_to_processing", _owned(Document, status="failed", error_message="boom"),
        lambda db, row: document_repo.reset_to_processing(db, [row.id], ORG),
        "UPDATE", frozenset({"status", "error_message"}),
    ),
    AuditedWriteCase(
        "document.reset_failed_retryable", _owned(Document, status="failed", retry_count=0),
        lambda db, row: document_repo.reset_failed_retryable(db, ORG, 3),
        "UPDATE", frozenset({"status"}),
    ),
    # Email queue
    AuditedWriteCase(
        "email_queue.reset_stuck", _owned(EmailQueue, status="extracting", **_EMAIL_QUEUE),
        lambda db, row: email_queue_repo.reset_stuck(db, ORG, ["extracting"], "fetched", error="Stuck"),
        "UPDATE", frozenset({"status", "error"}),
    ),
    AuditedWriteCase(
        "email_queue.record_failed_attempt", _owned(EmailQueue, **_CLAIMED, **_EMAIL_QUEUE),
        lambda db, row: email_queue_repo.record_failed_attempt(db, row.id, NOW, error="Claude busy", retry_at=NOW),
        "UPDATE", frozenset({"status", "error", "next_attempt_at"}),
    ),
    AuditedWriteCase(
        "email_queue.release_claim", _owned(EmailQueue, attempts=2, **_CLAIMED, **_EMAIL_QUEUE),
        lambda db, row: email_queue_repo.release_claim(db, row.id, NOW, retry_at=NOW),
        "UPDATE", frozenset({"status", "attempts", "next_attempt_at"}),
    ),
    AuditedWriteCase(
        "email_queue.dismiss_if_extracting", _owned(EmailQueue, **_CLAIMED, **_EMAIL_QUEUE),
        lambda db, row: email_queue_repo.dismiss_if_extracting(db, row.id),
        "UPDATE", frozenset({"status"}),
    ),
    AuditedWriteCase(
        "email_queue.retry_all_failed", _owned(EmailQueue, status="failed", attempts=3, **_EMAIL_QUEUE),
        lambda db, row: email_queue_repo.retry_all_failed(db, ORG),
        "UPDATE", frozenset({"status", "attempts"}),
    ),
    # Extraction
    AuditedWriteCase(
        "extraction_prompt.set_active (the old active prompt)", _row(ExtractionPrompt, user_id=USER, is_active=True),
        lambda db, row: _activate_another_prompt(db),
        "UPDATE", frozenset({"is_active"}),
    ),
    AuditedWriteCase(
        "extraction.delete_by_document_ids",
        _owned(Extraction, status="completed", confidence="high", document_type="invoice"),
        lambda db, row: extraction_repo.delete_by_document_ids(db, [row.document_id]),
        "DELETE",
    ),
    # Inquiries
    AuditedWriteCase(
        "inquiry.soft_delete_by_id", _owned(Inquiry, **_INQUIRY),
        lambda db, row: inquiry_repo.soft_delete_by_id(db, row.id, ORG),
        "UPDATE", frozenset({"deleted_at"}),
    ),
    AuditedWriteCase(
        "reply_template.archive", _owned(ReplyTemplate, is_archived=False),
        lambda db, row: reply_template_repo.archive(db, row.id, ORG, USER),
        "UPDATE", frozenset({"is_archived"}),
    ),
    AuditedWriteCase(
        "inquiry_reply_send.mark_sent", _row(InquiryReplySend, status="sending", send_message_id="claim-1"),
        lambda db, row: inquiry_reply_send_repo.mark_sent(
            db, claim_id=row.id, send_message_id="claim-1", inquiry_message_id=uuid.uuid4(),
        ),
        "UPDATE", frozenset({"status", "inquiry_message_id"}),
    ),
    AuditedWriteCase(
        "inquiry_reply_send.release", _row(InquiryReplySend, status="sending", send_message_id="claim-1"),
        lambda db, row: inquiry_reply_send_repo.release(db, claim_id=row.id, send_message_id="claim-1"),
        "DELETE",
    ),
    # Insurance, mortgages, utilities
    AuditedWriteCase(
        "insurance_policy.soft_delete", _owned(InsurancePolicy),
        lambda db, row: insurance_policy_repo.soft_delete(db, policy_id=row.id, user_id=USER, organization_id=ORG),
        "UPDATE", frozenset({"deleted_at"}),
    ),
    AuditedWriteCase(
        "insurance_policy_attachment.delete_by_id_scoped_to_policy",
        _row(InsurancePolicyAttachment, kind=INSURANCE_ATTACHMENT_KINDS[0]),
        lambda db, row: insurance_policy_attachment_repo.delete_by_id_scoped_to_policy(db, row.id, row.policy_id),
        "DELETE",
    ),
    AuditedWriteCase(
        "insurance_benchmark.delete_for_org", _row(InsuranceBenchmark, organization_id=ORG),
        lambda db, row: insurance_benchmark_repo.delete_for_org(db, organization_id=ORG),
        "DELETE",
    ),
    AuditedWriteCase(
        "mortgage.soft_delete", _owned(Mortgage, rate_type=MORTGAGE_RATE_TYPES[0]),
        lambda db, row: mortgage_repo.soft_delete(db, mortgage_id=row.id, user_id=USER, organization_id=ORG),
        "UPDATE", frozenset({"deleted_at"}),
    ),
    AuditedWriteCase(
        "utility_plan.soft_delete",
        _owned(UtilityPlan, service_type=SERVICE_TYPE_ELECTRICITY, rate_type=RATE_TYPE_FIXED),
        lambda db, row: utility_plan_repo.soft_delete(db, plan_id=row.id, user_id=USER, organization_id=ORG),
        "UPDATE", frozenset({"deleted_at"}),
    ),
    AuditedWriteCase(
        "market_rate_benchmark.delete_by_service_type",
        _row(MarketRateBenchmark, organization_id=ORG, service_type=SERVICE_TYPE_ELECTRICITY,
             rate_cents_per_kwh=Decimal("12.5")),
        lambda db, row: market_rate_benchmark_repo.delete_by_service_type(
            db, organization_id=ORG, service_type=SERVICE_TYPE_ELECTRICITY,
        ),
        "DELETE",
    ),
    # Tax
    AuditedWriteCase(
        "tax_return.flag_unfiled_for_recompute",
        _row(TaxReturn, organization_id=ORG, tax_year=2026, status="draft",
             filing_status=FILING_STATUSES[0], needs_recompute=False),
        lambda db, row: tax_return_repo.flag_unfiled_for_recompute(db, ORG),
        "UPDATE", frozenset({"needs_recompute"}),
    ),
    AuditedWriteCase(
        "tax_advisor.delete_active_for_return",
        _row(TaxAdvisorSuggestion, organization_id=ORG, severity="high", confidence="high", status="active"),
        lambda db, row: tax_advisor_repo.delete_active_for_return(db, row.tax_return_id, ORG),
        "DELETE",
    ),
    # Transactions and vendors
    AuditedWriteCase(
        "transaction.delete_by_extraction_ids", _owned(Transaction, extraction_id=uuid.uuid4(), **_TRANSACTION),
        lambda db, row: transaction_bulk_repo.delete_by_extraction_ids(db, [row.extraction_id], ORG),
        "DELETE",
    ),
    AuditedWriteCase(
        "transaction.mark_duplicate_reviewed", _owned(Transaction, **_TRANSACTION),
        lambda db, row: transaction_reconciliation_repo.mark_duplicate_reviewed(db, [row.id], ORG),
        "UPDATE", frozenset({"duplicate_reviewed_at"}),
    ),
    AuditedWriteCase(
        "vendor.null_vendor_on_transactions (the transaction)", _owned(Transaction, vendor_id=uuid.uuid4(), **_TRANSACTION),
        lambda db, row: vendor_repo.null_vendor_on_transactions(db, vendor_id=row.vendor_id, organization_id=ORG),
        "UPDATE", frozenset({"vendor_id"}),
    ),
    AuditedWriteCase(
        "attribution.move_pending_review",
        _row(RentAttributionReviewQueue, organization_id=ORG, confidence="fuzzy", status="pending"),
        lambda db, row: attribution_repo.move_pending_review(
            db, from_transaction_id=row.transaction_id, to_transaction_id=uuid.uuid4(), organization_id=ORG,
        ),
        "UPDATE", frozenset({"transaction_id"}),
    ),
    AuditedWriteCase(
        "reconciliation.delete_source",
        _row(ReconciliationSource, organization_id=ORG, source_type="1099_k", tax_year=2026, status="unmatched"),
        lambda db, row: reconciliation_repo.delete_source(db, row.id, ORG),
        "DELETE",
    ),
    AuditedWriteCase(
        "vendor.soft_delete", _owned(Vendor, category=VENDOR_CATEGORIES[0]),
        lambda db, row: vendor_repo.soft_delete(db, vendor_id=row.id, organization_id=ORG, user_id=USER),
        "UPDATE", frozenset({"deleted_at"}),
    ),
    AuditedWriteCase(
        "vendor.hard_delete_by_id", _owned(Vendor, category=VENDOR_CATEGORIES[0]),
        lambda db, row: vendor_repo.hard_delete_by_id(db, vendor_id=row.id, organization_id=ORG, user_id=USER),
        "DELETE",
    ),
]


async def _activate_another_prompt(db: AsyncSession) -> None:
    other = await make_row(db, ExtractionPrompt, user_id=USER, is_active=False)
    assert await extraction_prompt_repo.set_active(db, other.id) is other


@pytest.mark.usefixtures("audit_listeners")
@pytest.mark.parametrize("case", CASES, ids=[case.name for case in CASES])
async def test_write_is_audited_as_the_actor(db: AsyncSession, case: AuditedWriteCase) -> None:
    await run_audited_write_case(db, case, actor=USER)
