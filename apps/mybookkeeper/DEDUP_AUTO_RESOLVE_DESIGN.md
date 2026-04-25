# Auto-Resolve Dedup Design

> Produced by architecture, data, and UX design agents on 2026-03-29.
> Ready to implement next session.

## Problem

Two documents representing the same transaction (e.g., bank check + vendor invoice) create separate transactions because vendor names differ. The system detects possible matches (same amount, same property, date window) but doesn't auto-resolve them. Users must manually review every pair.

## Goal

Auto-resolve high-confidence duplicates silently. Only surface genuinely ambiguous cases to the user. Near-zero review queue.

---

## Data Model

### New: `transaction_documents` junction table

```python
class TransactionDocument(Base):
    __tablename__ = "transaction_documents"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    transaction_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("transactions.id", ondelete="CASCADE"))
    document_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("documents.id", ondelete="CASCADE"))
    extraction_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("extractions.id", ondelete="SET NULL"), nullable=True)
    link_type: Mapped[str] = mapped_column(String(20), default="duplicate_source")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    __table_args__ = (
        UniqueConstraint("transaction_id", "document_id", name="uq_txn_doc"),
        CheckConstraint("link_type IN ('duplicate_source', 'corroborating', 'manual')", name="chk_txn_doc_link_type"),
        Index("ix_txn_doc_transaction", "transaction_id"),
        Index("ix_txn_doc_document", "document_id"),
    )
```

### Keep existing `Transaction.extraction_id` unchanged

The `extraction_id → Extraction → Document` chain stays as-is. Junction table is purely additive. No existing queries break.

### Add relationship to Transaction

```python
linked_documents = relationship("TransactionDocument", back_populates="transaction", lazy="noload")
```

### Add to Pydantic schemas

`TransactionRead` and `DuplicateTransactionRead` both get:
```python
linked_document_ids: list[uuid.UUID] = []
```

### Migration

- `CREATE TABLE transaction_documents` — no locks on existing tables
- No backfill required for initial deployment
- Downgrade: `DROP TABLE transaction_documents`

---

## Source Quality Ranking

Pure function in `backend/app/core/source_quality.py` — no new columns:

```python
_QUALITY_RANK: dict[str, int] = {
    "invoice": 100,
    "receipt": 80,
    "statement": 60,
    "year_end_statement": 60,
    "contract": 40,
    "other": 20,
}

def source_quality_rank(document_type: str | None) -> int:
    return _QUALITY_RANK.get(document_type or "", 0)
```

Derived from `Extraction.document_type` (already exists, no new column needed).

---

## Dedup Service Refactor

### Return decisions, not side effects

Current `check_duplicate()` mutates state (soft-deletes transactions). Refactor to return:

```python
@dataclass
class DedupDecision:
    action: str  # "create" | "skip" | "replace" | "review"
    existing_transaction: Transaction | None
    reason: str
    confidence: str  # "high" | "medium" | "low"
```

### Decision logic

| Condition | Action | Confidence |
|---|---|---|
| Exact vendor + date + property + amount match | skip | high |
| Exact vendor + date but amounts differ | review | medium |
| Amount + property + date ≤10 days + clear quality winner (≥20 pt gap) | skip or replace (keep higher quality) | high |
| Amount + property + date 11-14 days | review | low |
| Amount + different non-null properties | review | low |
| Amount + no property on either | review | low |
| Amount + same property + same quality tier (<20 pt gap) | review | medium |
| No match | create | — |

### Auto-resolve windows

- **Detection window:** 14 days (unchanged)
- **Auto-resolve window:** 10 days (new — tighter for confident auto-resolution)
- **Review band:** 11-14 days (surfaced but not auto-resolved)
- Make configurable in `core/config.py`

---

## Pipeline Integration

### Execution in orchestration layer (not dedup service)

Both `document_extraction_service.process_document()` and `extraction_persistence.save_email_extraction()` handle decisions:

| Decision | Action |
|---|---|
| `create` | Create transaction normally. Create `TransactionDocument(link_type='duplicate_source')` for the new document. |
| `skip` | Do NOT create transaction. Link new document to existing transaction via junction table. Mark document status as `"linked"` (new status). |
| `replace` | Soft-delete existing transaction. Create new transaction. Link both documents (new=primary via extraction_id, old=supporting via junction). Copy user edits (property, category, approval) from old to new. |
| `review` | Create transaction with `status="needs_review"`. Both stay active until user resolves. |

### Unify email + upload paths

Email extraction currently skips date-window matching (`check_possible_match=False`). Both paths must use the same dedup logic. Extract shared function: `resolve_dedup_and_persist()` in `dedup_resolution_service.py`.

### Preserve user edits on replace

If existing transaction has `status="approved"` or manual edits, send to `review` instead of auto-replacing. Never silently overwrite user corrections.

---

## Frontend Changes

### TransactionPanel — multi-source display

When a transaction has linked documents (via junction table), show a "Sources" section:
- 1 document: render as today (single file link)
- 2+ documents: stacked list with file icon, file name, view button per row
- Transaction table row shows "2 sources" badge when merged

### DuplicateCard — descriptive labels

Replace "Keep A / Keep B" with source-type labels: "Keep invoice" / "Keep bank import". Derived from `document_type` of each transaction's source.

### DuplicateCard — confirmation dialog

Add `ConfirmDialog` before destructive keep actions. Show amount and vendor in the confirmation message.

### DuplicateCard — confidence signal

Show why the pair is flagged in the card header: "Same amount, same vendor, 1 day apart" vs "Same amount, different vendor, 12 days apart — I'm less sure about this one"

### Duplicate Review — auto-resolve activity log

Collapsible "Recently auto-resolved" section below the review queue. Last 10-20 auto-merges with amount, vendor, dates, source docs. 7-day undo window.

### Duplicate Review — conversational empty state

When auto-resolve is active: "I've been keeping an eye on your transactions — nothing suspicious right now. I auto-resolved 3 duplicates this month; you can check my work below."

### Nav — conditional visibility

Hide "Duplicate Review" nav item when queue count is zero. Show count badge on Transactions page "Duplicates" button when non-zero.

### Mobile

Action buttons in DuplicateCard should be full-width stacked on mobile with 44px minimum height.

---

## Existing Issues to Fix in Same PR

1. **`sources_attached` dead code** — remove from `MappingResult` and `UploadResult` (declared, never incremented)
2. **Mapper layer violation** — `extraction_mapper.map_extraction_items()` calls service functions (`check_duplicate`, `resolve_property_id`). Move orchestration to service layer.
3. **`_get_source_file_type()` in dedup service** — raw SQLAlchemy query belongs in repository layer
4. **TransactionPanel source preview** — hardcoded `right-[28rem]` offset breaks on mobile

---

## Files to Modify

### Backend — new files
- `backend/app/models/transactions/transaction_document.py` — junction table model
- `backend/app/core/source_quality.py` — quality ranking function
- `backend/app/services/extraction/dedup_resolution_service.py` — shared resolve+persist logic
- `backend/alembic/versions/xxxx_add_transaction_documents.py` — migration

### Backend — modify
- `backend/app/models/transactions/transaction.py` — add `linked_documents` relationship
- `backend/app/services/extraction/dedup_service.py` — return DedupDecision, remove side effects
- `backend/app/services/extraction/extraction_persistence.py` — use shared resolve logic, enable date-window matching
- `backend/app/services/extraction/document_extraction_service.py` — use shared resolve logic
- `backend/app/services/transactions/transaction_service.py` — `keep_transaction` transfers docs via junction
- `backend/app/mappers/extraction_mapper.py` — remove service calls, receive pre-resolved values
- `backend/app/repositories/transactions/transaction_repo.py` — add junction table queries
- `backend/app/schemas/transactions/transaction.py` — add `linked_document_ids`
- `backend/app/schemas/transactions/duplicate.py` — add `linked_document_ids`, add `confidence`
- `backend/app/api/transactions.py` — pass confidence to response

### Frontend — modify
- `frontend/src/app/features/transactions/DuplicateCard.tsx` — descriptive labels, confirm dialog, confidence display, mobile buttons
- `frontend/src/app/features/transactions/TransactionPanel.tsx` — multi-source display, fix mobile offset
- `frontend/src/app/pages/DuplicateReview.tsx` — activity log, conversational empty state, count in subtitle
- `frontend/src/app/pages/Transactions.tsx` — count badge on Duplicates button
- `frontend/src/app/lib/nav.ts` — conditional visibility based on count
- `frontend/src/shared/types/transaction/transaction.ts` — add `linked_document_ids`
- `frontend/src/shared/types/transaction/duplicate.ts` — add `confidence`
- `frontend/src/shared/store/transactionsApi.ts` — add auto-resolved log query
