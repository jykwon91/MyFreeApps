import datetime as _dt
import uuid

from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.applicants.applicant import Applicant
from app.models.applicants.applicant_event import ApplicantEvent
from app.models.inquiries.inquiry import Inquiry
from app.models.inquiries.inquiry_event import InquiryEvent
from app.models.inquiries.inquiry_message import InquiryMessage
from app.models.leases.signed_lease import SignedLease


async def create_people(
    db: AsyncSession,
    user_id: uuid.UUID,
    organization_id: uuid.UUID,
    inquiries: list[dict],
    now: _dt.datetime,
) -> None:
    """Dates count from ``now`` so the sample always looks current, whenever it was seeded."""
    for sample in inquiries:
        received_at = now - _dt.timedelta(days=sample["days_ago"])
        stay_starts = now.date() + _dt.timedelta(days=sample["stay_starts_in_days"])
        inquiry = Inquiry(
            organization_id=organization_id,
            user_id=user_id,
            source="direct",
            inquirer_name=sample["inquirer_name"],
            inquirer_email=sample["inquirer_email"],
            inquirer_phone=sample["inquirer_phone"],
            inquirer_employer=sample["inquirer_employer"],
            desired_start_date=stay_starts,
            desired_end_date=stay_starts + _dt.timedelta(days=sample["stay_days"]),
            stage=sample["stage"],
            received_at=received_at,
        )
        db.add(inquiry)
        await db.flush()
        db.add(InquiryMessage(
            inquiry_id=inquiry.id,
            direction="inbound",
            channel="in_app",
            from_address=sample["inquirer_email"],
            parsed_body=sample["message"],
            sent_at=received_at,
        ))
        db.add(InquiryEvent(
            inquiry_id=inquiry.id, event_type="received", actor="system", occurred_at=received_at,
        ))
        host_acted_at = received_at + _dt.timedelta(hours=2)
        if sample["stage"] != "new":
            db.add(InquiryEvent(
                inquiry_id=inquiry.id, event_type=sample["stage"], actor="host", occurred_at=host_acted_at,
            ))
        if "applicant_stage" in sample:
            applicant = Applicant(
                organization_id=organization_id,
                user_id=user_id,
                inquiry_id=inquiry.id,
                legal_name=sample["inquirer_name"],
                employer_or_hospital=sample["inquirer_employer"],
                contact_email=sample["inquirer_email"],
                contact_phone=sample["inquirer_phone"],
                contract_start=stay_starts,
                stage=sample["applicant_stage"],
            )
            db.add(applicant)
            await db.flush()
            db.add(ApplicantEvent(
                applicant_id=applicant.id, event_type="lead", actor="host", occurred_at=host_acted_at,
            ))
            db.add(ApplicantEvent(
                applicant_id=applicant.id,
                event_type="stage_changed",
                actor="host",
                occurred_at=host_acted_at,
                payload={"from": "lead", "to": sample["applicant_stage"], "note": None},
            ))
    await db.flush()


async def delete_people(db: AsyncSession, organization_id: uuid.UUID) -> None:
    """Leases first: one holds its applicant with RESTRICT, and someone trying the account may have made one."""
    await db.execute(delete(SignedLease).where(SignedLease.organization_id == organization_id))
    await db.execute(delete(Applicant).where(Applicant.organization_id == organization_id))
    await db.execute(delete(Inquiry).where(Inquiry.organization_id == organization_id))
