"""Shared persistence logic for saving extracted documents from both upload and email paths."""
import logging
import re
import uuid
from typing import cast

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.parsers import safe_date, safe_decimal
from app.core.tags import transaction_type_for_category
from app.core.trusted_email_senders import is_trusted_sender
from app.models.documents.document import Document
from app.models.email.email_types import Attachment
from app.models.extraction.email_extraction_outcome import EmailExtractionOutcome
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
from app.services.extraction.utility_account_service import sender_domain_from_email
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
    sender_email: str | None = None,
) -> EmailExtractionOutcome:
    """Persist extracted documents from an email.

    Returns an :class:`EmailExtractionOutcome` carrying the number of records
    created and, when zero were created, a human-readable reason so the Sync
    Sessions UI can explain why a successfully-synced email produced no
    transactions.

    Shared extraction logic (tag sanitization, property matching, dedup)
    is delegated to helper functions. Email-specific concerns (message dedup,
    low-confidence skip, .eml unwrapping, source="email") are handled here.

    Invariant: a document carrying a valid transaction_date AND a positive
    amount is a real expense and must never be silently dropped — not by the
    payment-confirmation skip, not by the low-confidence skip. Utility
    "bill ready" / "Auto Pay" notifications that state an amount due flow
    through as a ``utilities`` expense.
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
    ext_doc_type = _normalize_document_type(
        documents_data[0].get("document_type", "invoice") if documents_data else "invoice",
        documents_data[0] if documents_data else None,
    )

    records_added = 0
    ext_record: Extraction | None = None
    skip_reason: str | None = None

    # Payment confirmations: skip entirely — they duplicate the original invoice.
    # Two carve-outs prevent silently dropping real money:
    #   1. Peer-to-peer transfers (Zelle/Venmo/Cash App/PayPal etc.) ARE the
    #      source of truth for rent income, not duplicates.
    #   2. Any document carrying a valid date + positive amount is a real
    #      expense record (a utility "bill ready" / "Auto Pay $232.84"
    #      notification is the ONLY record of that charge — no paper invoice
    #      will ever arrive). The "payment confirmation" framing must not drop
    #      a batch that contains a recordable amount.
    has_p2p = any(_looks_like_p2p_payment(d) for d in documents_data)
    has_recordable_amount = any(_has_recordable_expense(d) for d in documents_data)
    if not has_p2p and not has_recordable_amount and (
        ext_doc_type == "payment_confirmation" or _is_payment_confirmation(documents_data)
    ):
        logger.warning(
            "Skipping payment confirmation email — no recordable amount "
            "(message_id=%s, subject=%r)",
            message_id, subject,
        )
        return EmailExtractionOutcome(
            records_added=0,
            skip_reason="Payment confirmation / notification — no amount to record",
        )

    for data in documents_data:
        doc_tags = sanitize_extraction_tags(data.get("tags"))

        if data.get("confidence") == "low" and (
            not doc_tags or doc_tags == ["uncategorized"]
        ) and not _has_recordable_expense(data):
            logger.warning(
                "Skipping document: low confidence + uncategorized + no amount "
                "(vendor=%r)",
                data.get("vendor"),
            )
            skip_reason = skip_reason or "Low confidence and no recognizable category"
            continue

        property_id = await resolve_property_id(
            data.get("address"), None, organization_id, db,
            user_id=user_id, tags=doc_tags,
            account_number=data.get("account_number"),
            sender_domain=sender_domain_from_email(sender_email),
        )

        vendor = data.get("vendor")
        doc_date = safe_date(data.get("date"))
        amount = safe_decimal(data.get("amount"))
        doc_type = _normalize_document_type(data.get("document_type", "invoice"), data)
        raw_payer = data.get("payer_name")

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
            payer_name=raw_payer if isinstance(raw_payer, str) else None,
        )

        if decision.action == "skip":
            skip_reason = skip_reason or "Duplicate of an already-imported document"
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
        if not (doc_date and amount is not None and abs(amount) > 0):
            # A Document was created but no Transaction — Claude returned no
            # usable date/amount. Record why so the email isn't a silent no-op.
            skip_reason = skip_reason or (
                "No amount or date found — saved as a document only, "
                "no transaction created"
            )
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
            # mark transactions as "unverified" so users review them. Two
            # exemptions land the transaction directly on the dashboard:
            #   - Trusted payment senders (Airbnb, Zelle, etc.): unambiguous
            #     structured receipts; the review step is friction without
            #     value.
            #   - Utility / recurring-service bills (Constellation, CenterPoint,
            #     City of Houston Water, AT&T, etc.): a "bill ready" / "Auto Pay"
            #     notification with a stated amount IS the record of that
            #     expense. Leaving it "unverified" hides it from dashboard and
            #     analytics totals (status=="approved" filter) — the exact
            #     silent-drop the user reported. These are recurring, low-
            #     ambiguity charges, so surface them.
            if (
                is_email_body
                and txn
                and not (sender_email and is_trusted_sender(sender_email))
                and category != "utilities"
            ):
                txn.status = "unverified"

            surviving = await resolve_and_link(
                db, decision, txn, doc.id, ext_record.id if ext_record else None,
            )

            if surviving:
                # Attribution — attempt to link this payment to a tenant
                payer_name = data.get("payer_name")
                payer_handle = data.get("payer_handle")
                is_airbnb_payout = _is_airbnb_payout(data)
                if payer_name or is_airbnb_payout:
                    await maybe_attribute_payment(
                        db,
                        txn=surviving,
                        payer_name=payer_name if isinstance(payer_name, str) else None,
                        organization_id=organization_id,
                        user_id=user_id,
                        is_airbnb_payout=is_airbnb_payout,
                        payer_handle=payer_handle if isinstance(payer_handle, str) else None,
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

    return EmailExtractionOutcome(
        records_added=records_added,
        skip_reason=skip_reason if records_added == 0 else None,
    )


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


# Document types that the Extraction.document_type CHECK constraint accepts.
# A "payment_confirmation" is NOT a valid stored document_type — it is a
# routing signal only. When such a document actually carries a recordable
# amount (a utility "bill ready" notification that states an amount due), it
# is a real invoice and must be stored as one, both to satisfy the DB
# constraint and because that is what it is.
_VALID_STORED_DOCUMENT_TYPES = frozenset({
    "invoice", "statement", "lease", "insurance_policy", "tax_form",
    "contract", "year_end_statement", "receipt", "1099", "other",
    "w2", "1099_int", "1099_div", "1099_b", "1099_k",
    "1099_misc", "1099_nec", "1099_r", "1098", "k1",
})


def _normalize_document_type(doc_type: str, data: dict | None) -> str:
    """Coerce a Claude document_type to one the DB accepts.

    ``payment_confirmation`` is a routing label, not a storable type. When the
    document carries a recordable amount (a utility bill notification stating
    an amount due) it is a real invoice — store it as ``invoice``. An
    amount-less payment_confirmation is left untouched so the upstream
    payment-confirmation skip still fires before any persistence happens. Any
    other unknown type degrades to ``other`` rather than crashing the insert.
    """
    if doc_type == "payment_confirmation":
        if data is not None and _has_recordable_expense(data):
            return "invoice"
        return doc_type
    if doc_type in _VALID_STORED_DOCUMENT_TYPES:
        return doc_type
    return "other"


def _has_recordable_expense(data: dict) -> bool:
    """Return True if the extraction carries a real, recordable charge.

    A document with a valid transaction_date AND a positive amount is a real
    expense/income record that must never be silently dropped — not by the
    payment-confirmation skip and not by the low-confidence skip. This is the
    structural guarantee behind the utility-bill fix: a Constellation /
    CenterPoint / City-of-Houston-Water "bill ready" or "Auto Pay" email that
    states an amount due is the ONLY record of that charge, so the batch must
    survive even if Claude mis-tags the document_type as payment_confirmation.

    Claude output is untrusted — a malformed amount/date degrades to "not
    recordable", never raises.
    """
    if not safe_date(data.get("date")):
        return False
    amount = safe_decimal(_amount_str(data.get("amount")))
    return amount is not None and abs(amount) > 0


def _amount_str(value: object) -> str | None:
    """Coerce a Claude amount field to the str safe_decimal expects, or None."""
    if value is None:
        return None
    if isinstance(value, str):
        return value
    if isinstance(value, (int, float)):
        return str(value)
    return None


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


def _is_airbnb_payout(data: ExtractionData) -> bool:
    """Return True if the extraction is an Airbnb booking payout.

    Airbnb payout emails have the platform itself as the sender, so the
    extraction prompt deliberately leaves ``payer_name`` null (see
    ``prompts/base_prompt.py``). The original design keyed off a
    ``gmail_labels`` signal, but the email worker never attached labels to the
    extraction data — so this path was dead and Airbnb payouts were never
    attributed. Detect from the structured extraction itself instead of the
    user's Gmail label hygiene: the booking channel is Airbnb and the row is
    platform-payout / rental-revenue shaped (which excludes P2P transfers like
    Cash App / Venmo, whose ``channel`` is null).
    """
    def _norm(key: str) -> str:
        # Claude output is untrusted — a non-string here must degrade to
        # "not an Airbnb payout", never crash the email's persistence.
        value = data.get(key)
        return value.strip().lower() if isinstance(value, str) else ""

    if _norm("channel") != "airbnb":
        return False
    return _norm("category") == "rental_revenue" or _norm("payment_method") == "platform_payout"
