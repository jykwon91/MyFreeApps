"""Extraction orchestrator — coordinates load → extract → map → persist pipeline."""
import logging
import uuid

from app.core.context import worker_context
from app.core.storage import get_storage
from app.core.tags import transaction_type_for_category
from app.db.session import AsyncSessionLocal, unit_of_work
from app.models.documents.document import Document
from app.models.extraction.extraction import Extraction
from app.models.responses.upload_result import UploadResult
from app.repositories import document_repo, extraction_repo, property_repo, transaction_repo, reservation_repo, usage_log_repo
from app.repositories.tax import tax_return_repo
from app.services.extraction.claude_service import extract_from_text, extract_from_image
from app.services.extraction.dedup_service import evaluate_dedup
from app.services.extraction.dedup_resolution_service import resolve_and_link
from app.services.system.event_service import record_event
from app.mappers.extraction_mapper import map_single_item, sanitize_extraction_tags, MappedItem
from app.services.extraction.property_matcher_service import resolve_property_id
from app.services.extraction.extractor_service import (
    extract_text_from_pdf,
    extract_text_from_docx,
    extract_text_from_spreadsheet,
)
from app.mappers.reservation_mapper import build_reservations_from_line_items
from app.mappers.tax_form_mapper import normalize_tax_doc_type, build_tax_form_data
from app.mappers.transaction_mapper import build_transaction_from_mapped_item
from app.mappers.cost_basis_lot_mapper import build_cost_basis_lot_from_mapped_item
from app.repositories.tax import cost_basis_lot_repo
from app.services.transactions.reconciliation_service import reconcile_year_end
from app.services.tax.tax_extraction_service import is_tax_source_document, process_tax_document
from app.services.tax.tax_recompute_service import recompute as recompute_tax_return
from app.services.classification.rule_engine import classify

logger = logging.getLogger(__name__)



def _has_useful_extraction(extraction: dict) -> bool:
    """Check if Claude returned at least one document with a vendor or amount, or reservations."""
    if extraction.get("document_type") == "year_end_statement" and extraction.get("reservations"):
        return True
    return any(
        data.get("vendor") or data.get("amount")
        for data in extraction.get("data", [])
    )




async def _load_document_for_extraction(
    document_id: uuid.UUID,
) -> tuple[bytes, str, str, str, uuid.UUID, uuid.UUID, uuid.UUID | None, bool]:
    """Load document file content for extraction (read-only session).

    Returns (content, filename, content_type, file_type, organization_id, user_id, property_id, is_escrow_paid).
    """
    async with AsyncSessionLocal() as db:
        doc = await document_repo.get_by_id_with_content_internal(db, document_id)
        if not doc:
            raise ValueError(f"Document {document_id} not found")

        content: bytes | None = None
        if doc.file_storage_key:
            storage = get_storage()
            if storage is None:
                raise ValueError("File stored in object storage but MinIO is not configured")
            content = storage.download_file(doc.file_storage_key)
        else:
            content = doc.file_content

        if not content:
            raise ValueError(f"Document {document_id} has no file content")

        return (
            content,
            doc.file_name or "",
            doc.file_mime_type or "",
            doc.file_type or "",
            doc.organization_id,
            doc.user_id,
            doc.property_id,
            doc.is_escrow_paid,
        )


async def _run_claude_extraction(
    content: bytes, filename: str, content_type: str, file_type: str,
    user_id: uuid.UUID, document_id: uuid.UUID,
    property_classification: str | None = None,
) -> dict:
    """Route file to the appropriate Claude extraction method."""
    kw = dict(user_id=user_id, filename=filename, property_classification=property_classification)
    if file_type == "image":
        return await extract_from_image(content, content_type or "image/jpeg", **kw)
    if file_type == "pdf":
        text = await extract_text_from_pdf(content)
        if text and len(text) >= 50:
            extraction = await extract_from_text(text, **kw)
            if not _has_useful_extraction(extraction):
                logger.info(
                    "Text extraction produced poor results for %s, retrying with vision",
                    document_id,
                )
                return await extract_from_image(content, "application/pdf", **kw)
            return extraction
        return await extract_from_image(content, "application/pdf", **kw)
    if file_type == "docx":
        text = await extract_text_from_docx(content)
        return await extract_from_text(text, **kw)
    if file_type == "spreadsheet":
        text = await extract_text_from_spreadsheet(content, filename)
        return await extract_from_text(text, **kw)
    raise ValueError("Unsupported file type")


def _apply_mapped_item_to_doc(doc: Document, item: MappedItem) -> None:
    """Mark document as completed after extraction. Financial data lives in transactions."""
    doc.property_id = item.property_id
    doc.document_type = item.document_type
    doc.status = "completed"


def _create_doc_from_item(
    item: MappedItem,
    organization_id: uuid.UUID,
    user_id: uuid.UUID,
    filename: str,
    file_type: str,
    content: bytes,
    content_type: str,
) -> Document:
    """Create a new Document shell for a multi-item extraction. Financial data lives in transactions."""
    return Document(
        organization_id=organization_id,
        user_id=user_id,
        property_id=item.property_id,
        file_name=filename,
        file_type=file_type,
        document_type=item.document_type,
        file_content=content,
        file_mime_type=content_type,
        source="upload",
        status="completed",
    )


async def process_document(document_id: uuid.UUID) -> UploadResult:
    """Run Claude extraction on a queued document. Called by the upload worker."""
    # Phase 1: Load file content (read-only, short session)
    content, filename, content_type, file_type, organization_id, user_id, property_id, is_escrow_paid = (
        await _load_document_for_extraction(document_id)
    )
    ctx = worker_context(organization_id, user_id)

    # Escrow-paid documents are reference-only — skip extraction entirely
    if is_escrow_paid:
        async with unit_of_work() as db:
            doc = await document_repo.get_by_id(db, document_id, ctx.organization_id)
            if doc:
                doc.status = "completed"
        return UploadResult()

    # Look up property classification if document has a property assigned
    prop_classification: str | None = None
    if property_id:
        async with AsyncSessionLocal() as db:
            classifications = await property_repo.get_classifications_by_ids(db, [property_id])
            prop_classification = classifications.get(property_id)

    # Phase 2: Call Claude (no DB connection held)
    try:
        extraction = await _run_claude_extraction(
            content, filename, content_type, file_type, user_id, document_id,
            property_classification=prop_classification,
        )
    except ValueError as e:
        async with unit_of_work() as db:
            doc_ref = await document_repo.get_by_id(db, document_id, ctx.organization_id)
            if doc_ref:
                doc_ref.status = "failed"
                doc_ref.error_message = str(e)[:1000]
        try:
            await record_event(
                organization_id, "extraction_failed", "error",
                f"Document {document_id} extraction failed: {str(e)[:200]}",
                {"document_id": str(document_id), "error": str(e)[:500]},
            )
        except Exception:
            pass
        raise

    # Phase 3: Persist results (single atomic transaction)
    async with unit_of_work() as db:
        doc = await document_repo.get_by_id(db, document_id, ctx.organization_id)
        if not doc:
            raise ValueError(f"Document {document_id} not found")

        ext_confidence = extraction.get("data", [{}])[0].get("confidence") if extraction.get("data") else None
        ext_doc_type = extraction.get("document_type") or (
            extraction.get("data", [{}])[0].get("document_type", "invoice") if extraction.get("data") else "invoice"
        )
        ext_record = Extraction(
            document_id=document_id,
            organization_id=ctx.organization_id,
            user_id=ctx.user_id,
            status="completed",
            raw_response=extraction,
            confidence=ext_confidence,
            document_type=ext_doc_type,
            tokens_used=extraction.get("tokens", 0),
        )
        await extraction_repo.create(db, ext_record)

        # Payment confirmations: mark document as skipped, no transactions
        if ext_doc_type == "payment_confirmation":
            doc.document_type = "payment_confirmation"
            doc.status = "skipped"
            await usage_log_repo.create(
                db, ctx.organization_id, ctx.user_id, file_type, extraction.get("tokens", 0),
                input_tokens=extraction.get("input_tokens", 0),
                output_tokens=extraction.get("output_tokens", 0),
                model_name=extraction.get("model_name"),
            )
            logger.info("Skipped payment confirmation document %s", document_id)
            return UploadResult()

        if extraction.get("document_type") == "year_end_statement":
            reconciliation = await reconcile_year_end(
                extraction.get("reservations", []),
                ctx.organization_id,
                ctx.user_id,
                document_id,
                ext_record.id,
                db,
            )
            await usage_log_repo.create(
                db, ctx.organization_id, ctx.user_id, file_type, extraction["tokens"],
                input_tokens=extraction.get("input_tokens", 0),
                output_tokens=extraction.get("output_tokens", 0),
                model_name=extraction.get("model_name"),
            )
            doc.document_type = "year_end_statement"
            doc.status = "completed"
            return UploadResult(reconciliation=reconciliation)

        # --- Phase 3b: Map, dedup, and persist each extraction item ---
        created: list[Document] = []
        skipped = 0
        first_item = True
        is_spreadsheet = file_type == "spreadsheet"

        for data in extraction["data"]:
            # Resolve property (needs tags first for auto-creation check)
            doc_tags = sanitize_extraction_tags(data.get("tags"))
            resolved_property_id = await resolve_property_id(
                data.get("address"), property_id, ctx.organization_id, db,
                user_id=ctx.user_id, tags=doc_tags,
            )

            # Map extraction item (pure)
            item = map_single_item(data, resolved_property_id)

            # Dedup evaluation
            decision = await evaluate_dedup(
                db, ctx.organization_id, item.vendor, item.date, item.amount,
                item.line_items, item.property_id,
                exclude_id=document_id,
                file_type=file_type,
                new_document_type=item.document_type,
            )

            # Handle document creation/assignment
            if decision.action == "skip":
                skipped += 1
                if first_item:
                    doc.status = "duplicate"
                    first_item = False
                # Link doc to existing transaction as corroborating
                if decision.existing_transaction:
                    await resolve_and_link(db, decision, None, document_id, ext_record.id)
                continue

            # Assign doc for this item
            if first_item:
                _apply_mapped_item_to_doc(doc, item)
                item_doc = doc
                created.append(doc)
                first_item = False
            elif is_spreadsheet:
                item_doc = doc
            else:
                new_doc = _create_doc_from_item(
                    item, ctx.organization_id, ctx.user_id, filename, file_type, content, content_type,
                )
                item_doc = await document_repo.create(db, new_doc)
                created.append(item_doc)

            # Route 1099-B items to CostBasisLot
            if item.document_type == "1099_b":
                lot = build_cost_basis_lot_from_mapped_item(
                    item, ctx.organization_id, ctx.user_id, ext_record.id,
                )
                if lot:
                    await cost_basis_lot_repo.create(db, lot)
                continue

            # Build transaction (not yet saved — resolve_and_link handles persistence)
            txn = build_transaction_from_mapped_item(
                item, ctx.organization_id, ctx.user_id, ext_record.id,
            )
            if txn:
                override = await classify(
                    db, ctx.organization_id, txn.vendor, txn.category,
                    address=txn.address,
                )
                if override:
                    txn.category = override[0]
                    txn.transaction_type = transaction_type_for_category(txn.category)
                    if override[1] and not txn.property_id:
                        txn.property_id = override[1]
                    if override[2] and not txn.activity_id:
                        txn.activity_id = override[2]

                # Dedup resolution: creates, replaces, or flags for review
                surviving = await resolve_and_link(
                    db, decision, txn, item_doc.id, ext_record.id,
                )

                if surviving:
                    for res in build_reservations_from_line_items(
                        item.line_items, ctx.organization_id, item.property_id, surviving.id,
                    ):
                        existing_res = await reservation_repo.find_by_res_code(
                            db, ctx.organization_id, res.res_code,
                        )
                        if existing_res:
                            logger.warning("Skipped duplicate reservation %s", res.res_code)
                            continue
                        await reservation_repo.create(db, res)

        if first_item:
            doc.status = "failed"
            doc.error_message = "Could not extract any transactions from this document. The file may be empty, unreadable, or in an unsupported format."

        await usage_log_repo.create(
            db, ctx.organization_id, ctx.user_id, file_type, extraction["tokens"],
            input_tokens=extraction.get("input_tokens", 0),
            output_tokens=extraction.get("output_tokens", 0),
            model_name=extraction.get("model_name"),
        )
        result = UploadResult(
            created=created,
            skipped=skipped,
        )

        if doc.status == "duplicate":
            await document_repo.delete(db, doc)
            logger.info("Deleted duplicate upload document %s", document_id)

        # Process tax documents
        for doc_data in extraction.get("data", []):
            doc_type = doc_data.get("document_type", "")
            tax_form_data = doc_data.get("tax_form_data")

            if not tax_form_data:
                tax_form_data = build_tax_form_data(doc_data)
            if not is_tax_source_document(doc_type):
                doc_type = normalize_tax_doc_type(doc_data)

            if is_tax_source_document(doc_type) and tax_form_data:
                try:
                    async with db.begin_nested():
                        await process_tax_document(
                            db,
                            organization_id=ctx.organization_id,
                            document_id=document_id,
                            extraction_id=ext_record.id,
                            document_type=doc_type,
                            tax_form_data=tax_form_data,
                        )
                except Exception:
                    logger.warning(
                        "Failed to process tax document %s as %s",
                        document_id, doc_type, exc_info=True,
                    )

        for d in created:
            await document_repo.refresh(db, d)

    # Auto-recompute tax returns after extraction commits (must be outside unit_of_work
    # so the recompute's own session sees the newly committed transactions)
    try:
        async with AsyncSessionLocal() as recompute_db:
            tax_returns = await tax_return_repo.list_by_org(recompute_db, ctx.organization_id)
            for tr in tax_returns:
                if tr.needs_recompute:
                    await recompute_tax_return(ctx.organization_id, tr.id)
                    logger.info("Auto-recomputed tax return %s after extraction", tr.id)
    except Exception:
        logger.warning("Auto-recompute failed after extraction", exc_info=True)

    return result
