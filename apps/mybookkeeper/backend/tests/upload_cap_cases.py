"""Every MyBookkeeper endpoint that reads an uploaded file, for test_upload_read_caps.py."""
from __future__ import annotations

import uuid

import pytest

from app.core.config import settings
from app.services.storage import image_processor
from app.services.transactions import import_service
from tests.upload_cap_case import UploadCapCase

_ID = uuid.uuid4()
_MB = 1024 * 1024


def _mb(limit: int) -> int:
    return limit // _MB


def _setting(name: str):
    def set_limit(monkeypatch: pytest.MonkeyPatch, limit: int) -> None:
        monkeypatch.setattr(settings, name, limit)
    return set_limit


def _image_limit(monkeypatch: pytest.MonkeyPatch, limit: int) -> None:
    monkeypatch.setattr(image_processor, "MAX_IMAGE_BYTES", limit)


def _csv_limit(monkeypatch: pytest.MonkeyPatch, limit: int) -> None:
    monkeypatch.setattr(import_service, "MAX_CSV_SIZE", limit)


def _report_limit(monkeypatch: pytest.MonkeyPatch, limit: int) -> None:
    monkeypatch.setenv("MAX_SCREENING_REPORT_BYTES", str(limit))


_documents = _setting("max_upload_size_bytes")
_attachments = _setting("max_blackout_attachment_size_bytes")
_templates = _setting("max_lease_template_file_size_bytes")


def _file_exceeds(limit: int) -> str:
    return f"File exceeds {_mb(limit)}MB limit"


def _lowercase_file_exceeds(limit: int) -> str:
    return f"file exceeds {_mb(limit)}MB limit"


UPLOAD_CAP_CASES: list[UploadCapCase] = [
    UploadCapCase(
        id="listing-photos", method="POST", path=f"/listings/{_ID}/photos",
        service="app.api.listings.listing_photo_service.upload_photos",
        set_limit=_image_limit, too_large_detail=_lowercase_file_exceeds,
        received=lambda args, kwargs: args[3][0][0], file_field="files", filename="photo.jpg",
    ),
    UploadCapCase(
        id="welcome-manual-images", method="POST",
        path=f"/welcome-manuals/{_ID}/sections/{_ID}/images",
        service="app.api.welcome_manual_section_images.welcome_manual_section_image_service.upload_images",
        set_limit=_image_limit, too_large_detail=_lowercase_file_exceeds,
        received=lambda args, kwargs: args[4][0][0], file_field="files", filename="photo.jpg",
    ),
    UploadCapCase(
        id="insurance-extract-upload", method="POST", path="/insurance-policies/extract-upload",
        service="app.api.insurance_policies.insurance_policy_extraction_service.extract_policy_from_upload",
        set_limit=_documents, too_large_detail=_file_exceeds,
        received=lambda args, kwargs: kwargs["content"],
    ),
    UploadCapCase(
        id="insurance-attachment", method="POST", path=f"/insurance-policies/{_ID}/attachments",
        service="app.api.insurance_policies.insurance_policy_service.upload_attachment",
        set_limit=_attachments, too_large_detail=_file_exceeds,
        received=lambda args, kwargs: kwargs["content"], form={"kind": "policy_document"},
    ),
    UploadCapCase(
        id="utility-plan-extract-upload", method="POST", path="/utility-plans/extract-upload",
        service="app.api.utility_plans.utility_plan_extraction_service.extract_plan_from_upload",
        set_limit=_documents, too_large_detail=_file_exceeds,
        received=lambda args, kwargs: kwargs["content"],
    ),
    UploadCapCase(
        id="mortgage-extract-upload", method="POST", path="/mortgages/extract-upload",
        service="app.api.mortgages.mortgage_statement_extraction_service.extract_mortgage_from_upload",
        set_limit=_documents, too_large_detail=_file_exceeds,
        received=lambda args, kwargs: kwargs["content"],
    ),
    UploadCapCase(
        id="document-upload", method="POST", path="/documents/upload",
        service="app.api.documents.document_upload_service.accept_upload",
        set_limit=_documents, too_large_detail=_file_exceeds,
        received=lambda args, kwargs: args[1],
    ),
    UploadCapCase(
        id="document-replace-file", method="PUT", path=f"/documents/{_ID}/file",
        service="app.api.documents.document_service.replace_file",
        set_limit=_documents, too_large_detail=_file_exceeds,
        received=lambda args, kwargs: args[2], too_large_status=422,
    ),
    UploadCapCase(
        id="blackout-attachment", method="POST", path=f"/listings/blackouts/{_ID}/attachments",
        service="app.api.blackouts.blackout_service.upload_attachment",
        set_limit=_attachments, too_large_detail=_file_exceeds,
        received=lambda args, kwargs: kwargs["content"],
    ),
    UploadCapCase(
        id="signed-lease-attachment", method="POST", path=f"/signed-leases/{_ID}/attachments",
        service="app.api.signed_lease_attachments.signed_lease_service.upload_attachment",
        set_limit=_attachments, too_large_detail=_file_exceeds,
        received=lambda args, kwargs: kwargs["content"], form={"kind": "signed_addendum"},
    ),
    UploadCapCase(
        id="signed-lease-import", method="POST", path="/signed-leases/import",
        service="app.api.signed_leases.signed_lease_service.import_signed_lease",
        set_limit=_attachments,
        too_large_detail=lambda limit: f"File 'lease.pdf' exceeds {_mb(limit)}MB limit",
        received=lambda args, kwargs: kwargs["files"][0][0],
        file_field="files", filename="lease.pdf", form={"applicant_id": str(_ID)},
    ),
    UploadCapCase(
        id="bank-csv-import", method="POST", path="/imports/bank-csv",
        service="app.api.imports.import_service.import_bank_csv_file",
        set_limit=_csv_limit, too_large_detail=lambda limit: f"File too large (max {_mb(limit)}MB)",
        received=lambda args, kwargs: args[1], filename="bank.csv",
    ),
    UploadCapCase(
        id="screening-result", method="POST", path=f"/applicants/{_ID}/screening/upload-result",
        service="app.api.screening.screening_service.record_result",
        set_limit=_report_limit, too_large_detail=_lowercase_file_exceeds,
        received=lambda args, kwargs: kwargs["file_content"], form={"status": "pass"},
    ),
    UploadCapCase(
        id="lease-template-create", method="POST", path="/lease-templates",
        service="app.api.lease_templates.lease_template_upload_service.upload_template",
        set_limit=_templates,
        too_large_detail=lambda limit: f"lease.docx exceeds {_mb(limit)}MB limit",
        received=lambda args, kwargs: kwargs["files"][0][1],
        file_field="files", filename="lease.docx", form={"name": "Standard lease"},
    ),
    UploadCapCase(
        id="lease-template-replace-files", method="POST", path=f"/lease-templates/{_ID}/files",
        service="app.api.lease_templates.lease_template_upload_service.replace_template_files",
        set_limit=_templates,
        too_large_detail=lambda limit: f"lease.docx exceeds {_mb(limit)}MB limit",
        received=lambda args, kwargs: kwargs["files"][0][1],
        file_field="files", filename="lease.docx",
    ),
]
