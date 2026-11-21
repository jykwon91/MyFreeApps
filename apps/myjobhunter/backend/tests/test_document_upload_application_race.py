"""An application deleted while its document uploads gets no document.

The upload runs outside any transaction, so ``create_file_document`` checks
the application's ownership again (with a row lock) in the transaction that
inserts the document row.
"""
from __future__ import annotations

import uuid
from typing import Any
from unittest.mock import MagicMock

import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.application.document import Document
from app.models.company.company import Company
from app.services.application import application_service
from app.services.documents import document_service
from app.services.documents.document_service import ApplicationNotOwnedError

_PDF_BYTES = b"%PDF-1.4 " + b"A" * 200


@pytest.mark.asyncio
async def test_application_soft_deleted_during_upload_gets_no_document(
    db: AsyncSession, user_factory, as_user, monkeypatch: pytest.MonkeyPatch,
) -> None:
    user = await user_factory()
    user_id = uuid.UUID(user["id"])
    company = Company(user_id=user_id, name="Acme", primary_domain=f"acme-{uuid.uuid4().hex[:6]}.example.com")
    db.add(company)
    await db.flush()
    async with await as_user(user) as authed:
        resp = await authed.post(
            "/applications",
            json={"company_id": str(company.id), "role_title": "Engineer", "source": "linkedin"},
        )
        assert resp.status_code == 201, resp.text
    application_id = uuid.UUID(resp.json()["id"])

    real_verify = document_service._verify_application_ownership
    checks = 0

    async def verify_then_delete(*args: Any, **kwargs: Any) -> None:
        nonlocal checks
        checks += 1
        await real_verify(*args, **kwargs)
        if checks == 1:
            # The application goes away after the first check, during the upload.
            assert await application_service.soft_delete_application(user_id, application_id)

    monkeypatch.setattr(document_service, "_verify_application_ownership", verify_then_delete)
    storage = MagicMock()
    storage.delete_files.return_value = []
    storage.generate_key.return_value = f"documents/fake-{uuid.uuid4().hex}/file.pdf"
    monkeypatch.setattr(document_service, "get_storage", lambda: storage)

    with pytest.raises(ApplicationNotOwnedError):
        await document_service.create_file_document(
            user_id,
            title="Resume",
            kind="tailored_resume",
            application_id=application_id,
            file_bytes=_PDF_BYTES,
            filename="resume.pdf",
            declared_content_type="application/pdf",
        )

    assert checks == 2
    storage.upload_file.assert_called_once()
    storage.delete_files.assert_called_once_with([storage.generate_key.return_value])
    count = await db.execute(
        select(func.count()).select_from(Document).where(Document.user_id == user_id),
    )
    assert count.scalar_one() == 0
