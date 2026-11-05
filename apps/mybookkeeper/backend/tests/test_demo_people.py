"""Demo accounts carry sample inquiries and applicants, so those screens have something to show."""

import datetime as _dt
from contextlib import asynccontextmanager
from unittest.mock import patch

import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.applicants.applicant import Applicant
from app.models.applicants.applicant_event import ApplicantEvent
from app.models.documents.document import Document
from app.models.inquiries.inquiry import Inquiry
from app.models.inquiries.inquiry_event import InquiryEvent
from app.models.inquiries.inquiry_message import InquiryMessage
from app.models.leases.lease_template import LeaseTemplate
from app.models.leases.lease_template_file import LeaseTemplateFile
from app.repositories.demo import demo_repo
from app.services.demo import demo_service
from app.services.demo.demo_people_constants import DEMO_INQUIRIES


@pytest.fixture(autouse=True)
def _patch_session(db: AsyncSession):
    @asynccontextmanager
    async def _same_session():
        yield db

    async def _no_recompute(org_id, tax_return_id):
        return 0

    with (
        patch("app.services.demo.demo_service.AsyncSessionLocal", _same_session),
        patch("app.services.demo.demo_service.unit_of_work", _same_session),
        patch("app.services.demo.demo_service.tax_recompute_service.recompute", _no_recompute),
    ):
        yield


async def _count(db: AsyncSession, model: type, org_id) -> int:
    found = await db.execute(select(func.count()).select_from(model).where(model.organization_id == org_id))
    return found.scalar_one()


async def _org_of(db: AsyncSession, email: str):
    user = await demo_repo.get_user_by_email(db, email)
    assert user is not None
    org = await demo_repo.get_org_by_user(db, user.id)
    assert org is not None
    return user, org


@pytest.mark.asyncio
async def test_a_new_demo_account_has_inquiries_each_with_its_message(db: AsyncSession) -> None:
    created = await demo_service.create_demo_user("people")
    _, org = await _org_of(db, created.credentials.email)

    inquiries = (await db.execute(select(Inquiry).where(Inquiry.organization_id == org.id))).scalars().all()

    assert {inquiry.inquirer_name for inquiry in inquiries} == {sample["inquirer_name"] for sample in DEMO_INQUIRIES}
    for inquiry in inquiries:
        messages = (await db.execute(select(InquiryMessage).where(InquiryMessage.inquiry_id == inquiry.id))).scalars().all()
        assert [message.direction for message in messages] == ["inbound"]
        assert messages[0].parsed_body


@pytest.mark.asyncio
async def test_a_new_demo_account_has_an_applicant_linked_to_their_inquiry(db: AsyncSession) -> None:
    created = await demo_service.create_demo_user("people")
    _, org = await _org_of(db, created.credentials.email)

    applicants = (await db.execute(select(Applicant).where(Applicant.organization_id == org.id))).scalars().all()

    assert [applicant.legal_name for applicant in applicants] == ["Priya Nair"]
    inquiry = await db.get(Inquiry, applicants[0].inquiry_id)
    assert inquiry is not None and inquiry.inquirer_name == "Priya Nair"


@pytest.mark.asyncio
async def test_sample_dates_look_current_whenever_the_account_is_made(db: AsyncSession) -> None:
    created = await demo_service.create_demo_user("people")
    _, org = await _org_of(db, created.credentials.email)
    today = _dt.datetime.now(_dt.timezone.utc).date()

    inquiries = (await db.execute(select(Inquiry).where(Inquiry.organization_id == org.id))).scalars().all()

    assert all(inquiry.desired_start_date > today for inquiry in inquiries)
    assert all(inquiry.received_at.date() < today for inquiry in inquiries)


@pytest.mark.asyncio
async def test_sample_contact_details_can_never_reach_a_real_person() -> None:
    for sample in DEMO_INQUIRIES:
        assert sample["inquirer_email"].endswith("@example.com")
        assert "555-01" in sample["inquirer_phone"]


@pytest.mark.asyncio
async def test_reset_replaces_people_rather_than_doubling_them(db: AsyncSession) -> None:
    created = await demo_service.create_demo_user("people")
    user, org = await _org_of(db, created.credentials.email)

    await demo_service.reset_demo_user(user.id)

    assert await _count(db, Inquiry, org.id) == len(DEMO_INQUIRIES)
    assert await _count(db, Applicant, org.id) == 1


@pytest.mark.asyncio
async def test_deleting_a_demo_account_removes_its_people(db: AsyncSession) -> None:
    created = await demo_service.create_demo_user("people")
    user, org = await _org_of(db, created.credentials.email)
    org_id = org.id

    await demo_service.delete_demo_user(user.id)

    assert await _count(db, Inquiry, org_id) == 0
    assert await _count(db, Applicant, org_id) == 0


@pytest.mark.asyncio
async def test_sample_people_have_a_timeline_matching_their_stage(db: AsyncSession) -> None:
    created = await demo_service.create_demo_user("people")
    _, org = await _org_of(db, created.credentials.email)
    inquiries = (await db.execute(select(Inquiry).where(Inquiry.organization_id == org.id))).scalars().all()

    for inquiry in inquiries:
        events = (await db.execute(select(InquiryEvent).where(InquiryEvent.inquiry_id == inquiry.id))).scalars().all()
        expected = {"received"} if inquiry.stage == "new" else {"received", inquiry.stage}
        assert {event.event_type for event in events} == expected

    applicant = (await db.execute(select(Applicant).where(Applicant.organization_id == org.id))).scalars().one()
    events = (await db.execute(select(ApplicantEvent).where(ApplicantEvent.applicant_id == applicant.id))).scalars().all()
    assert {event.event_type for event in events} == {"lead", "stage_changed"}


async def _add_stored_files(db: AsyncSession, user_id, org_id) -> None:
    template = LeaseTemplate(user_id=user_id, organization_id=org_id, name="Standard lease")
    db.add(template)
    await db.flush()
    db.add(LeaseTemplateFile(
        template_id=template.id,
        filename="lease.pdf",
        storage_key="kept-template.pdf",
        content_type="application/pdf",
        size_bytes=1,
    ))
    db.add(Document(organization_id=org_id, user_id=user_id, file_storage_key="added-document.pdf"))
    # A deleted record and a kept one can point at the same stored file.
    db.add(Document(organization_id=org_id, user_id=user_id, file_storage_key="kept-template.pdf"))
    await db.flush()


@pytest.mark.asyncio
async def test_reset_removes_files_of_deleted_records_and_keeps_the_rest(db: AsyncSession) -> None:
    created = await demo_service.create_demo_user("people")
    user, org = await _org_of(db, created.credentials.email)
    await _add_stored_files(db, user.id, org.id)

    with patch("app.services.user.account_deletion_service.get_storage") as get_storage:
        await demo_service.reset_demo_user(user.id)

    removed = [call.args[0] for call in get_storage.return_value.delete_file.call_args_list]
    assert "added-document.pdf" in removed
    assert "kept-template.pdf" not in removed


@pytest.mark.asyncio
async def test_deleting_a_demo_account_removes_every_stored_file(db: AsyncSession) -> None:
    created = await demo_service.create_demo_user("people")
    user, org = await _org_of(db, created.credentials.email)
    await _add_stored_files(db, user.id, org.id)

    with patch("app.services.user.account_deletion_service.get_storage") as get_storage:
        await demo_service.delete_demo_user(user.id)

    removed = [call.args[0] for call in get_storage.return_value.delete_file.call_args_list]
    assert {"added-document.pdf", "kept-template.pdf"} <= set(removed)
