"""Lease and insurance uploads never store a photo's location metadata.

Runs the real lease-attachment, lease-import and insurance-attachment upload
code with storage and the repositories faked, so the bytes handed to storage
can be inspected. A photo named ``lease.pdf`` and sent as a PDF is still
treated as the photo it is.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from collections.abc import Awaitable, Callable, Iterator
from contextlib import ExitStack, asynccontextmanager
from dataclasses import dataclass, field
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services.insurance import insurance_policy_service
from app.services.leases import lease_attachment_service, lease_import_service
from tests.gps_photo import gps_of, photo_with_gps

_DRAFT_LEASE = SimpleNamespace(
    id=uuid.uuid4(), status="draft", sent_at=None, signed_at=None, last_emailed_to_tenant_at=None,
)
_BROKEN_JPEG = b"\xff\xd8\xff" + b"MZ\x90\x00" * 100


@dataclass
class _Recorded:
    storage: MagicMock = field(default_factory=MagicMock)
    rows: list[dict[str, object]] = field(default_factory=list)

    @property
    def stored_bytes(self) -> bytes:
        return self.storage.upload_file.call_args.args[1]

    async def create(self, _db: object, **row: object) -> SimpleNamespace:
        self.rows.append(row)
        stored = {
            "id": uuid.uuid4(), "lease_id": uuid.uuid4(), "uploaded_by_user_id": uuid.uuid4(),
            "uploaded_at": datetime.now(timezone.utc), "signed_by_tenant_at": None, "signed_by_landlord_at": None,
        }
        return SimpleNamespace(**{**stored, **row})


@asynccontextmanager
async def _fake_uow():
    yield MagicMock()


def _identity(rows: list[object]) -> list[object]:
    return rows


Upload = Callable[[bytes, str], Awaitable[object]]


def _lease_attachment(stack: ExitStack, recorded: _Recorded) -> Upload:
    svc = lease_attachment_service
    stack.enter_context(patch.object(svc, "get_storage", return_value=recorded.storage))
    stack.enter_context(patch.object(svc, "unit_of_work", _fake_uow))
    stack.enter_context(patch.object(svc.signed_lease_repo, "get", new=AsyncMock(return_value=_DRAFT_LEASE)))
    stack.enter_context(patch.object(svc.signed_lease_attachment_repo, "create", new=recorded.create))
    stack.enter_context(patch.object(svc.signed_lease_attachment_repo, "list_by_lease", new=AsyncMock(return_value=[])))
    stack.enter_context(patch.object(svc, "attach_presigned_urls_to_attachments", side_effect=_identity))

    async def upload(content: bytes, filename: str) -> object:
        return await svc.upload_attachment(
            user_id=uuid.uuid4(),
            organization_id=uuid.uuid4(),
            lease_id=uuid.uuid4(),
            content=content,
            filename=filename,
            kind="signed_lease",
        )

    return upload


def _lease_import(stack: ExitStack, recorded: _Recorded) -> Upload:
    svc = lease_import_service
    stack.enter_context(patch.object(svc, "get_storage", return_value=recorded.storage))
    stack.enter_context(patch.object(svc, "unit_of_work", _fake_uow))
    stack.enter_context(patch.object(svc.applicant_repo, "get", new=AsyncMock(return_value=MagicMock())))
    stack.enter_context(patch.object(svc, "resolve_inquiry_listing_id", new=AsyncMock(return_value=None)))
    stack.enter_context(
        patch.object(svc.signed_lease_repo, "create", new=AsyncMock(return_value=SimpleNamespace(id=uuid.uuid4()))),
    )
    stack.enter_context(patch.object(svc.signed_lease_repo, "update_lease", new=AsyncMock()))
    stack.enter_context(patch.object(svc.signed_lease_attachment_repo, "create", new=recorded.create))
    stack.enter_context(patch.object(svc, "get_lease", new=AsyncMock()))

    async def upload(content: bytes, filename: str) -> object:
        return await svc.import_signed_lease(
            user_id=uuid.uuid4(),
            organization_id=uuid.uuid4(),
            applicant_id=uuid.uuid4(),
            listing_id=None,
            starts_on=None,
            ends_on=None,
            notes=None,
            status="signed",
            files=[(content, filename)],
        )

    return upload


def _insurance_attachment(stack: ExitStack, recorded: _Recorded) -> Upload:
    svc = insurance_policy_service
    stack.enter_context(patch.object(svc, "get_storage", return_value=recorded.storage))
    stack.enter_context(patch.object(svc, "unit_of_work", _fake_uow))
    stack.enter_context(patch.object(svc.insurance_policy_repo, "get", new=AsyncMock(return_value=MagicMock())))
    stack.enter_context(patch.object(svc.insurance_policy_attachment_repo, "create", new=recorded.create))
    stack.enter_context(
        patch.object(svc.InsurancePolicyAttachmentResponse, "model_validate", side_effect=lambda row: row),
    )
    stack.enter_context(patch.object(svc, "attach_presigned_urls", side_effect=_identity))

    async def upload(content: bytes, filename: str) -> object:
        return await svc.upload_attachment(
            user_id=uuid.uuid4(),
            organization_id=uuid.uuid4(),
            policy_id=uuid.uuid4(),
            content=content,
            filename=filename,
            kind="policy_document",
        )

    return upload


_PATHS = {
    "lease attachment": (_lease_attachment, lease_attachment_service.AttachmentTypeRejectedError),
    "lease import": (_lease_import, lease_import_service.AttachmentTypeRejectedError),
    "insurance attachment": (_insurance_attachment, insurance_policy_service.AttachmentTypeRejectedError),
}


@pytest.fixture(params=list(_PATHS))
def path(request: pytest.FixtureRequest) -> Iterator[tuple[Upload, _Recorded, type[Exception]]]:
    build, rejected = _PATHS[request.param]
    recorded = _Recorded()
    with ExitStack() as stack:
        yield build(stack, recorded), recorded, rejected


@pytest.mark.asyncio
@pytest.mark.parametrize(("fmt", "mime"), [("JPEG", "image/jpeg"), ("PNG", "image/png"), ("WEBP", "image/webp")])
async def test_stored_photo_has_no_gps(
    path: tuple[Upload, _Recorded, type[Exception]], fmt: str, mime: str,
) -> None:
    upload, recorded, _ = path
    photo = photo_with_gps(fmt)
    assert gps_of(photo), "fixture must carry GPS"

    await upload(photo, "photo")

    assert gps_of(recorded.stored_bytes) == {}
    assert recorded.rows[0]["content_type"] == mime
    assert recorded.rows[0]["size_bytes"] == len(recorded.stored_bytes)


@pytest.mark.asyncio
async def test_a_photo_named_as_a_pdf_still_loses_its_gps(
    path: tuple[Upload, _Recorded, type[Exception]],
) -> None:
    upload, recorded, _ = path

    await upload(photo_with_gps("JPEG"), "lease.pdf")

    assert gps_of(recorded.stored_bytes) == {}
    assert recorded.rows[0]["content_type"] == "image/jpeg"


@pytest.mark.asyncio
async def test_a_photo_that_cant_be_cleaned_is_rejected_and_nothing_is_stored(
    path: tuple[Upload, _Recorded, type[Exception]],
) -> None:
    upload, recorded, rejected = path

    with pytest.raises(rejected, match="Couldn't read"):
        await upload(_BROKEN_JPEG, "photo.jpg")

    recorded.storage.upload_file.assert_not_called()
    assert recorded.rows == []


@pytest.mark.asyncio
async def test_a_file_that_only_claims_to_be_a_pdf_is_rejected(
    path: tuple[Upload, _Recorded, type[Exception]],
) -> None:
    upload, recorded, rejected = path

    with pytest.raises(rejected, match="Unsupported"):
        await upload(b"MZ\x90\x00\x03\x00\x00\x00", "lease.pdf")

    recorded.storage.upload_file.assert_not_called()


@pytest.mark.asyncio
async def test_pdf_is_stored_unchanged(path: tuple[Upload, _Recorded, type[Exception]]) -> None:
    upload, recorded, _ = path
    pdf = b"%PDF-1.4 signed lease"

    await upload(pdf, "lease.pdf")

    assert recorded.stored_bytes == pdf
    assert recorded.rows[0]["content_type"] == "application/pdf"
