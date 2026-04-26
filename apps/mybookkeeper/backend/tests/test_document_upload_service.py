"""Tests for document_upload_service validation logic."""
import uuid

import pytest

from app.services.documents.document_upload_service import accept_upload
from app.core.context import worker_context


def _make_ctx() -> "RequestContext":
    from app.core.context import RequestContext
    return worker_context(uuid.uuid4(), uuid.uuid4())


class TestAcceptUploadValidation:
    @pytest.mark.anyio
    async def test_empty_file_rejected(self) -> None:
        ctx = _make_ctx()
        with pytest.raises(ValueError, match="File is empty"):
            await accept_upload(ctx, content=b"", filename="test.pdf", content_type="application/pdf")
