"""Shared persistence logic for saving extracted documents from both upload and email paths."""
import logging
import re
import uuid
from typing import cast

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.parsers import safe_date, safe_decimal
from app.core.tags import transaction_type_for_category
from app.models.documents.document import Document
from app.models.email.email_types import Attachment
from app.models.extraction.extraction import Extraction
from app.models.extraction.extraction_types import ExtractionData, ExtractionResult
from app.repositories import (
    document_repo, extraction_repo, processed_email_repo,
    booking_statement_repo, transaction_repo, usage_log_repo,
)
from app.services.extraction.dedup_service import evaluate_dedup
from app.services.extraction.dedup_resolution_service import resolve_and_link
from app.services.documents.document_query_service import _extract_renderable_from_eml
from app.mappers.extraction_mapper import derive_category, derive_transaction_type, sanitize_extraction_tags
from app.mappers.booking_statement_mapper import build_booking_statement_from_line_item
from app.mappers.transaction_mapper import build_transaction_from_extraction_data
from app.services.extraction.property_matcher_service import resolve_property_id
from app.services.extraction.sender_category_service import match_sender_category
from app.services.classification.rule_engine import classify
from app.services.transactions.attribution_service import maybe_attribute_payment

logger = logging.getLogger(__name__)


async def save_email_extraction(
    *,
    message_id: str,
    subject: str | None,
    result: ExtractionResult,
    source_att: Attachment | None,
    organization_id: uuid.UUID,
    user_id: uuid.UUID,
    db: AsyncSession,
) -> int:
    """Persist extracted documents from an email. Returns count added.

    Shared extraction logic (tag sanitization, property matching, dedup)
    is delegated to helper functions. Email-specific concerns (message dedup,
    low-confidence skip, .eml unwrapping, source="email") are handled here.
    """
    documents_data: list[ExtractionData] = result.get("data", [])
    tokens: int = result.get("tokens", 0)
    logger.info(
        "Saving %d extracted document(s) from message %s",
        len(documents_data), message_id,
    )

    await processed_email_repo.upsert(db, message_id, organization_id, user_id, subject)
    await usage_log_repo.create(
        db, organization_id, user_id, "email", tokens,
        input_tokens=result.get("input_tokens", 0),
        output_tokens=result.get("output_tokens", 0),
        model_name=result.get("model_name"),
    )

    file_content, file_name, file_mime_type = _resolve_attachment_content(source_att)

    # Email body extractions: use subject as file_name for traceability
    is_email_body = source_att is None and subject
    if is_email_body and not file_name:
        file_name = subject

    # Extraction record is created on the first non-skipped, non-duplicate doc
    ext_confidence = documents_data[0].get("confidence") if documents_data else None
    ext_doc_type = documents_data[0].get("document_type", "invoice") if documents_data else "invoice"

    records_added = 0
    ext_record: Extraction | None = None

    # Payment confirmations: skip entirely — they duplicate the original invoice.
    # Carve-out: peer-to-peer transfers (Zelle/Venmo/Cash App/PayPal etc.) ARE
    # the source of truth for rent income, not duplicates. If any document in
    # the batch looks like a P2P payment, we must not short-circuit here.
    has_p2p = any(_looks_like_p2p_payment(d) for d in documents_data)
    if not has_p2p and (
        ext_doc_type == "payment_confirmation" or _is_payment_confirmation(documents_data)
    ):
        logger.info(
            "Skipping payment confirmation email (message_id=%s, subject=%r)",
            message_id, subject,
        )
        return records_added

    for data in documents_data:
        doc_tags = sanitize_extraction_tags(data.get("tags"))

        if data.get("confidence") == "low" and (
            not doc_tags or doc_tags == ["uncategorized"]
        ):
            logger.info(
                "Skipping document: low confidence + uncategorized (vendor=%r)",
                data.get("vendor"),
            )
            continue

        property_id = await resolve_property_id(
            data.get("address"), None, organization_id, db,
            user_id=user_id, tags=doc_tags,
        )

        vendor = data.get("vendor")
        doc_date = safe_date(data.get("date"))
        amount = safe_decimal(data.get("amount"))
        doc_type = data.get("document_type", "invoice")

        decision = await evaluate_dedup(
            db,
            organization_id=organization_id,
            vendor=vendor,
            doc_date=doc_date,
            amount=amount,
            line_items=data.get("line_items"),
            property_id=property_id,
            file_type="email",
            new_document_type=doc_type,
        )

        if decision.action == "skip":
            continue

        doc = Document(
            organization_id=organization_id,
            user_id=user_id,
            property_id=property_id,
            email_message_id=message_id,
            file_name=file_name,
            file_type="email",
            document_type=doc_type,
            file_content=file_content,
            file_mime_type=file_mime_type,
            source="email",
            status="completed",
        )
        await document_repo.create(db, doc)
        records_added += 1

        # Create Extraction record on first created doc
        if ext_record is None:
            ext_record = Extraction(
                document_id=doc.id,
                organization_id=organization_id,
                user_id=user_id,
                status="completed",
                raw_response=dict(result),
                confidence=ext_confidence,
                document_type=ext_doc_type or "invoice",
                tokens_used=tokens,
            )
            await extraction_repo.create(db, ext_record)

        # Create Transaction via dedup resolution
        if doc_date and amount is not None and abs(amount) > 0:
            category = derive_category(doc_tags)
            if category == "uncategorized" and vendor:
                sender_category = match_sender_category(vendor)
                if sender_category:
                    category = sender_category
                    if category not in doc_tags:
                        doc_tags.append(category)
            rule_override = await classify(
                db, organization_id, vendor, category,
                address=data.get("address"),
                email_sender=data.get("sender"),
                filename=data.get("file_name"),
            )
            activity_id = None
            if rule_override:
                category = rule_override[0]
                if rule_override[1] and not property_id:
                    property_id = rule_override[1]
                activity_id = rule_override[2]
            txn_type = derive_transaction_type(doc_tags)
            if rule_override:
                txn_type = transaction_type_for_category(category)
            txn = build_transaction_from_extraction_data(
                data,
                organization_id=organization_id,
                user_id=user_id,
                property_id=property_id,
                extraction_id=ext_record.id if ext_record else None,
                doc_date=doc_date,
                amount=amount,
                vendor=vendor,
                category=category,
                tags=doc_tags,
                txn_type=txn_type,
                activity_id=activity_id,
            )

            # Email body extractions (no PDF attachment) are less reliable —
            # mark transactions as "unverified" so users review them
            if is_email_body and txn:
                txn.status = "unverified"

            surviving = await resolve_and_link(
                db, decision, txn, doc.id, ext_record.id if ext_record else None,
            )

            if surviving:
                # Attribution — attempt to link this payment to a tenant
                payer_name = data.get("payer_name")
                is_airbnb_label = _has_airbnb_label(data)
                if payer_name or is_airbnb_label:
                    await maybe_attribute_payment(
                        db,
                        txn=surviving,
                        payer_name=payer_name if isinstance(payer_name, str) else None,
                        organization_id=organization_id,
                        user_id=user_id,
                        is_airbnb_label=is_airbnb_label,
                    )

                for li in (data.get("line_items") or []):
                    if not isinstance(li, dict):
                        continue
                    bs = build_booking_statement_from_line_item(
                        li, organization_id, property_id, surviving.id,
                    )
                    if not bs:
                        continue
                    existing_bs = await booking_statement_repo.find_by_res_code(
                        db, organization_id, bs.res_code,
                    )
                    if existing_bs:
                        logger.warning("Skipped duplicate booking statement %s during email extraction", bs.res_code)
                        continue
                    await booking_statement_repo.create(db, bs)

    return records_added


_PAYMENT_CONFIRMATION_PATTERNS = re.compile(
    r"payment\s+(accepted|received|processed|confirmed|confirmation)"
    r"|thank\s+you\s+for\s+your\s+payment"
    r"|payment\s+has\s+been\s+(applied|posted)",
    re.IGNORECASE,
)

# Peer-to-peer money transfer notifications. These emails ARE the source of
# truth for rent income — they must NEVER be silently dropped as
# "payment_confirmation duplicates of an invoice", because there is no
# invoice. Defense-in-depth: even if Claude mis-classifies, the presence of
# a payer_name + non-zero amount + a P2P-platform vendor short-circuits the
# skip.
_P2P_PLATFORM_VENDORS = frozenset({
    "zelle", "venmo", "cash app", "cashapp", "paypal", "apple pay", "google pay",
})


def _looks_like_p2p_payment(data: dict) -> bool:
    """Return True if the extraction looks like a peer-to-peer transfer.

    P2P payments have a real payer (not the host) AND a real amount AND a
    P2P-platform vendor. They must bypass the payment_confirmation skip path.
    """
    payer = (data.get("payer_name") or "").strip()
    if not payer:
        return False
    amount_raw = data.get("amount")
    try:
        if amount_raw is None or float(str(amount_raw)) <= 0:
            return False
    except (TypeError, ValueError):
        return False
    vendor = (data.get("vendor") or "").strip().lower()
    return any(platform in vendor for platform in _P2P_PLATFORM_VENDORS)


def _is_payment_confirmation(documents_data: list) -> bool:
    """Detect payment confirmations from extraction data as a fallback.

    Checks if any extracted item has a document_type of 'payment_confirmation'
    or if the description/vendor text matches common payment confirmation patterns.
    Peer-to-peer transfers are explicitly excluded — see _looks_like_p2p_payment.
    """
    for data in documents_data:
        if _looks_like_p2p_payment(data):
            continue
        if data.get("document_type") == "payment_confirmation":
            return True
        desc = data.get("description") or ""
        vendor = data.get("vendor") or ""
        combined = f"{vendor} {desc}"
        if _PAYMENT_CONFIRMATION_PATTERNS.search(combined):
            return True
    return False


def _resolve_attachment_content(
    source_att: Attachment | None,
) -> tuple[bytes | None, str | None, str | None]:
    """Extract file content from an attachment, unwrapping .eml if needed."""
    if not source_att:
        return None, None, None

    att: Attachment = source_att
    if att.get("filename", "").lower().endswith(".eml"):
        inner = _extract_renderable_from_eml(att["data"])
        if inner:
            att = cast(Attachment, inner)

    return att["data"], att.get("filename"), att.get("content_type")


def _has_airbnb_label(data: ExtractionData) -> bool:
    """Return True if the extraction data signals an Airbnb payout label.

    The email worker attaches Gmail label names to extraction data under
    ``gmail_labels``. If 'Properties/airbnb reservation' is present and
    the channel is 'airbnb', treat this as an Airbnb payout.
    """
    labels = data.get("gmail_labels") or []
    if not isinstance(labels, list):
        return False
    has_label = any(
        isinstance(label, str) and "airbnb" in label.lower()
        for label in labels
    )
    return has_label and data.get("channel") == "airbnb"
