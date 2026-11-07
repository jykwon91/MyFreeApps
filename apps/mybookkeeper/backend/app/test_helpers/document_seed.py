"""Test-only document helper: add a read document of a given type without
uploading and extracting one.

Extraction needs an Anthropic key, so on a keyless E2E stack every upload ends
"failed" with no type. Tests of the Documents list's Type column need typed rows.

Lives beside ``seed.py`` rather than inside it: that module is past the
500-LOC guard.
"""

import uuid

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from app.core.context import RequestContext
from app.core.permissions import current_org_member
from app.db.session import unit_of_work
from app.models.documents.document import Document
from app.repositories.documents import document_repo
from app.schemas.system.admin import DocumentType
from app.test_helpers.auth import _require_test_mode

router = APIRouter()


class _SeedDocumentRequest(BaseModel):
    model_config = {"extra": "forbid"}

    file_name: str = Field(min_length=1, max_length=500)
    document_type: DocumentType


class _SeededDocument(BaseModel):
    id: uuid.UUID


@router.post("/test/seed-document", status_code=201)
async def seed_document(
    payload: _SeedDocumentRequest,
    ctx: RequestContext = Depends(current_org_member),
) -> _SeededDocument:
    """Add a completed document of ``document_type`` to my organization."""
    _require_test_mode()
    async with unit_of_work() as db:
        document = await document_repo.create(
            db,
            Document(
                organization_id=ctx.organization_id,
                user_id=ctx.user_id,
                file_name=payload.file_name,
                document_type=payload.document_type,
                source="upload",
                status="completed",
            ),
        )
        return _SeededDocument(id=document.id)
