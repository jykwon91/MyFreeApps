from __future__ import annotations

from dataclasses import dataclass, field
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from app.models.documents.document import Document


@dataclass
class ReconciliationItem:
    res_code: str
    billing_period: str | None = None
    status: str = "missing"  # "matched", "mismatch", "missing"
    expected_earnings: str | None = None
    actual_earnings: str | None = None
    document_id: str | None = None


@dataclass
class UploadResult:
    created: list[Document] = field(default_factory=list)
    skipped: int = 0
    reconciliation: list[ReconciliationItem] | None = None
