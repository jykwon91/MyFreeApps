"""Files stored before a write are removed only when the write did not land.

Covers the lease attachment, lease import, insurance attachment and screening
report uploads: the file goes up before the transaction, a failed write
removes it, and a commit that raised but landed keeps it.
"""
from __future__ import annotations

import uuid
from collections.abc import AsyncIterator, Awaitable, Callable
from contextlib import asynccontextmanager
from dataclasses import dataclass
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.applicants.screening_result import ScreeningResult
from app.models.insurance.insurance_policy_attachment import InsurancePolicyAttachment
from app.models.leases.signed_lease_attachment import SignedLeaseAttachment
from app.repositories.applicants import applicant_repo
from app.repositories.insurance import insurance_policy_repo
from app.services.insurance import insurance_attachment_present, insurance_policy_service
from app.services.leases import lease_attachment_service, lease_import_service
from app.services.screening import screening_service
from app.services.screening.report_processor import ProcessedReport
from tests.lease_regenerate_support import lease_with_rendered_attachment, real_uow  # noqa: F401 — fixture

PDF = SimpleNamespace(content=b"%PDF-1.4 x", content_type="application/pdf")

Upload = Callable[[], Awaitable[object]]


@dataclass
class Path:
    module: object
    create: object
    model: type
    key_column: str
    upload: Upload


async def _lease_attachment(db: AsyncSession, monkeypatch: pytest.MonkeyPatch) -> Path:
    user_id, org_id, _, lease, _ = await lease_with_rendered_attachment(db)
    svc = lease_attachment_service
    monkeypatch.setattr(svc, "clean_attachment", lambda *_a: PDF)
    monkeypatch.setattr(svc, "attach_presigned_urls_to_attachments", AsyncMock(side_effect=lambda rows: rows))

    async def upload() -> object:
        return await svc.upload_attachment(
            user_id=user_id, organization_id=org_id, lease_id=lease.id,
            content=b"x", filename="f.pdf", kind="signed_lease",
        )

    return Path(svc, svc.signed_lease_attachment_repo, SignedLeaseAttachment, "storage_key", upload)


async def _lease_import(db: AsyncSession, monkeypatch: pytest.MonkeyPatch) -> Path:
    user_id, org_id = uuid.uuid4(), uuid.uuid4()
    svc = lease_import_service
    monkeypatch.setattr(svc, "clean_attachment", lambda *_a: PDF)
    monkeypatch.setattr(svc, "resolve_lease_listing_id", AsyncMock(return_value=None))
    monkeypatch.setattr(svc, "get_lease", AsyncMock())

    async def upload() -> object:
        return await svc.import_signed_lease(
            user_id=user_id, organization_id=org_id, applicant_id=uuid.uuid4(), listing_id=None,
            starts_on=None, ends_on=None, notes=None, status="signed", files=[(b"x", "lease.pdf")],
        )

    return Path(svc, svc.signed_lease_attachment_repo, SignedLeaseAttachment, "storage_key", upload)


async def _insurance_attachment(db: AsyncSession, monkeypatch: pytest.MonkeyPatch) -> Path:
    user_id, org_id = uuid.uuid4(), uuid.uuid4()
    policy = await insurance_policy_repo.create(
        db, user_id=user_id, organization_id=org_id, property_id=uuid.uuid4(), policy_name="Home",
    )
    await db.commit()
    svc = insurance_policy_service
    monkeypatch.setattr(svc, "clean_attachment", lambda *_a: PDF)
    monkeypatch.setattr(svc, "attach_presigned_urls", AsyncMock(side_effect=lambda rows: rows))

    async def upload() -> object:
        return await svc.upload_attachment(
            user_id=user_id, organization_id=org_id, policy_id=policy.id,
            content=b"x", filename="f.pdf", kind="policy_document",
        )

    return Path(svc, svc.insurance_policy_attachment_repo, InsurancePolicyAttachment, "storage_key", upload)


async def _screening_report(db: AsyncSession, monkeypatch: pytest.MonkeyPatch) -> Path:
    user_id, org_id = uuid.uuid4(), uuid.uuid4()
    applicant = await applicant_repo.create(db, organization_id=org_id, user_id=user_id)
    await db.commit()
    svc = screening_service
    monkeypatch.setattr(
        svc, "process_report",
        lambda *_a, **_k: ProcessedReport(content=PDF.content, content_type=PDF.content_type),
    )

    async def upload() -> object:
        return await svc.record_result(
            organization_id=org_id, user_id=user_id, applicant_id=applicant.id,
            file_content=b"x", declared_content_type="application/pdf",
            status="pass", adverse_action_snippet=None,
        )

    return Path(svc, svc.screening_result_repo, ScreeningResult, "report_storage_key", upload)


_PATHS = {
    "lease attachment": _lease_attachment,
    "lease import": _lease_import,
    "insurance attachment": _insurance_attachment,
    "screening report": _screening_report,
}


@pytest.fixture()
def storage(monkeypatch: pytest.MonkeyPatch) -> MagicMock:
    fake = MagicMock()
    fake.upload_file.side_effect = lambda key, _content, _content_type: key
    fake.delete_files.return_value = []
    for module in (lease_attachment_service, lease_import_service, insurance_policy_service, screening_service):
        monkeypatch.setattr(module, "get_storage", lambda: fake)
    return fake


@pytest.fixture(params=list(_PATHS))
async def path(
    request: pytest.FixtureRequest, db: AsyncSession, real_uow, monkeypatch: pytest.MonkeyPatch,  # noqa: F811
) -> Path:
    built = await _PATHS[request.param](db, monkeypatch)
    monkeypatch.setattr(built.module, "unit_of_work", real_uow)
    # The insurance outcome check reads in its own module; the lease ones are patched by real_uow.
    monkeypatch.setattr(insurance_attachment_present, "unit_of_work", real_uow)
    return built


def _stored_key(storage: MagicMock) -> str:
    [key] = [c.args[0] for c in storage.upload_file.call_args_list]
    return key


async def _rows_with(db: AsyncSession, path: Path, key: str) -> list[object]:
    db.expire_all()
    column = getattr(path.model, path.key_column)
    return list((await db.execute(select(path.model).where(column == key))).scalars().all())


@pytest.mark.asyncio
async def test_a_failed_write_removes_the_stored_file(
    path: Path, storage: MagicMock, db: AsyncSession, monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(path.create, "create", AsyncMock(side_effect=RuntimeError("insert failed")))

    with pytest.raises(RuntimeError, match="insert failed"):
        await path.upload()

    key = _stored_key(storage)
    storage.delete_files.assert_called_once_with([key])
    assert await _rows_with(db, path, key) == []


@pytest.mark.asyncio
async def test_a_commit_that_raised_but_landed_keeps_the_file(
    path: Path, storage: MagicMock, db: AsyncSession, real_uow, monkeypatch: pytest.MonkeyPatch,  # noqa: F811
) -> None:
    real_create = path.create.create
    wrote = False

    async def create(*args: object, **kwargs: object) -> object:
        nonlocal wrote
        wrote = True
        return await real_create(*args, **kwargs)

    @asynccontextmanager
    async def commit_then_lose_the_reply() -> AsyncIterator[AsyncSession]:
        nonlocal wrote
        async with real_uow() as session:
            yield session
        if wrote:
            wrote = False
            raise ConnectionError("connection lost after COMMIT")

    monkeypatch.setattr(path.create, "create", create)
    monkeypatch.setattr(path.module, "unit_of_work", commit_then_lose_the_reply)

    await path.upload()

    key = _stored_key(storage)
    storage.delete_files.assert_not_called()
    assert len(await _rows_with(db, path, key)) == 1


@pytest.mark.asyncio
async def test_a_screening_report_for_an_applicant_the_caller_cant_see_is_never_stored(
    storage: MagicMock, real_uow, monkeypatch: pytest.MonkeyPatch,  # noqa: F811
) -> None:
    monkeypatch.setattr(screening_service, "unit_of_work", real_uow)

    with pytest.raises(LookupError):
        await screening_service.record_result(
            organization_id=uuid.uuid4(), user_id=uuid.uuid4(), applicant_id=uuid.uuid4(),
            file_content=b"%PDF-1.4 x", declared_content_type="application/pdf",
            status="pass", adverse_action_snippet=None,
        )

    storage.upload_file.assert_not_called()
