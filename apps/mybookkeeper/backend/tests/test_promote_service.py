"""Service-layer tests for promote_service (PR 3.2).

Verifies the orchestration contract for Inquiry → Applicant promotion:
- Auto-fills applicant fields from the inquiry's encrypted PII columns.
- Wraps writes in unit_of_work — partial promote is impossible.
- Emits exactly two events: ``applicant_events.lead`` + ``inquiry_events.converted``.
- Advances the inquiry stage to ``converted``.
- Idempotent: a second promote raises ``AlreadyPromotedError`` carrying the
  existing applicant_id.
- Tenant-isolated: cross-user / cross-org promotes raise ``LookupError``.
- Refuses to promote terminal-stage inquiries (``declined`` / ``archived``).
- Rolls back atomically on mid-transaction failures (no partial state).
- PII round-trips through EncryptedString cleanly.
"""
from __future__ import annotations

import datetime as _dt
import uuid
from contextlib import asynccontextmanager

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.applicants.applicant import Applicant
from app.models.applicants.applicant_event import ApplicantEvent
from app.models.inquiries.inquiry import Inquiry
from app.models.inquiries.inquiry_event import InquiryEvent
from app.models.organization.organization import Organization
from app.models.user.user import User
from app.repositories.applicants import applicant_repo
from app.repositories.inquiries import inquiry_repo
from app.schemas.applicants.applicant_promote_request import ApplicantPromoteRequest
from app.services.applicants import promote_service


@pytest.fixture
def patch_session(monkeypatch: pytest.MonkeyPatch, db: AsyncSession):
    """Re-route promote_service's session factory to the test SQLite fixture.

    aiosqlite + SQLAlchemy doesn't tolerate cross-task `await db.commit()`
    calls in a fixture-style session — re-acquiring a cursor after commit
    raises ``MissingGreenlet``. We flush instead so subsequent reads see
    the writes; assertions at the end of the test inspect the same session
    so we don't need a commit to round-trip data through the engine.

    For the "rollback on mid-transaction failure" test we need a real
    transaction boundary — that test uses ``db.begin_nested()`` around the
    promote call.
    """

    @asynccontextmanager
    async def _uow():
        try:
            yield db
            await db.flush()
        except Exception:
            await db.rollback()
            raise

    monkeypatch.setattr(promote_service, "unit_of_work", _uow)
    return None


async def _seed_inquiry(
    db: AsyncSession,
    *,
    org: Organization,
    user: User,
    stage: str = "new",
    inquirer_name: str | None = "Alice Tester",
    inquirer_email: str | None = "alice@example.com",
    inquirer_employer: str | None = "Memorial Hermann",
    desired_start_date: _dt.date | None = None,
    desired_end_date: _dt.date | None = None,
) -> Inquiry:
    inquiry = await inquiry_repo.create(
        db,
        organization_id=org.id,
        user_id=user.id,
        source="direct",
        received_at=_dt.datetime.now(_dt.timezone.utc),
        inquirer_name=inquirer_name,
        inquirer_email=inquirer_email,
        inquirer_employer=inquirer_employer,
        desired_start_date=desired_start_date,
        desired_end_date=desired_end_date,
    )
    if stage != "new":
        inquiry.stage = stage
        await db.flush()
    return inquiry


@pytest.mark.asyncio
async def test_promote_happy_path_autofills_pii_and_dates(
    db: AsyncSession, test_user: User, test_org: Organization, patch_session,
) -> None:
    inquiry = await _seed_inquiry(
        db, org=test_org, user=test_user,
        desired_start_date=_dt.date(2026, 6, 1),
        desired_end_date=_dt.date(2026, 12, 1),
    )
    await db.flush()

    applicant = await promote_service.promote_from_inquiry(
        organization_id=test_org.id,
        user_id=test_user.id,
        inquiry_id=inquiry.id,
        overrides=ApplicantPromoteRequest(),
    )

    assert applicant.legal_name == "Alice Tester"
    assert applicant.employer_or_hospital == "Memorial Hermann"
    assert applicant.contract_start == _dt.date(2026, 6, 1)
    assert applicant.contract_end == _dt.date(2026, 12, 1)
    assert applicant.stage == "lead"
    assert applicant.inquiry_id == inquiry.id


@pytest.mark.asyncio
async def test_promote_overrides_take_precedence_over_inquiry_values(
    db: AsyncSession, test_user: User, test_org: Organization, patch_session,
) -> None:
    inquiry = await _seed_inquiry(db, org=test_org, user=test_user)
    await db.flush()

    applicant = await promote_service.promote_from_inquiry(
        organization_id=test_org.id,
        user_id=test_user.id,
        inquiry_id=inquiry.id,
        overrides=ApplicantPromoteRequest(
            legal_name="Alice T. Override",
            employer_or_hospital="Texas Children's",
            dob=_dt.date(1990, 5, 12),
            vehicle_make_model="Toyota Camry 2020",
            smoker=False,
            pets="1 small cat",
            referred_by="Bob Referrer",
        ),
    )

    assert applicant.legal_name == "Alice T. Override"
    assert applicant.employer_or_hospital == "Texas Children's"
    assert applicant.dob == "1990-05-12"
    assert applicant.vehicle_make_model == "Toyota Camry 2020"
    assert applicant.smoker is False
    assert applicant.pets == "1 small cat"
    assert applicant.referred_by == "Bob Referrer"


@pytest.mark.asyncio
async def test_promote_emits_two_events_one_per_domain(
    db: AsyncSession, test_user: User, test_org: Organization, patch_session,
) -> None:
    inquiry = await _seed_inquiry(db, org=test_org, user=test_user)
    await db.flush()

    applicant = await promote_service.promote_from_inquiry(
        organization_id=test_org.id,
        user_id=test_user.id,
        inquiry_id=inquiry.id,
        overrides=ApplicantPromoteRequest(),
    )

    applicant_events = (
        await db.execute(
            select(ApplicantEvent).where(ApplicantEvent.applicant_id == applicant.id),
        )
    ).scalars().all()
    assert len(applicant_events) == 1
    assert applicant_events[0].event_type == "lead"
    assert applicant_events[0].actor == "host"

    inquiry_events_after = (
        await db.execute(
            select(InquiryEvent).where(
                InquiryEvent.inquiry_id == inquiry.id,
                InquiryEvent.event_type == "converted",
            ),
        )
    ).scalars().all()
    assert len(inquiry_events_after) == 1
    assert inquiry_events_after[0].actor == "host"


@pytest.mark.asyncio
async def test_promote_advances_inquiry_stage_to_converted(
    db: AsyncSession, test_user: User, test_org: Organization, patch_session,
) -> None:
    inquiry = await _seed_inquiry(
        db, org=test_org, user=test_user, stage="replied",
    )
    await db.flush()

    await promote_service.promote_from_inquiry(
        organization_id=test_org.id,
        user_id=test_user.id,
        inquiry_id=inquiry.id,
        overrides=ApplicantPromoteRequest(),
    )

    refreshed = await inquiry_repo.get_by_id(db, inquiry.id, test_org.id)
    assert refreshed is not None
    assert refreshed.stage == "converted"


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "starting_stage",
    ["new", "triaged", "replied", "screening_requested", "video_call_scheduled", "approved"],
)
async def test_promote_allowed_from_every_promotable_stage(
    db: AsyncSession,
    test_user: User,
    test_org: Organization,
    patch_session,
    starting_stage: str,
) -> None:
    inquiry = await _seed_inquiry(
        db, org=test_org, user=test_user, stage=starting_stage,
    )
    await db.flush()

    applicant = await promote_service.promote_from_inquiry(
        organization_id=test_org.id,
        user_id=test_user.id,
        inquiry_id=inquiry.id,
        overrides=ApplicantPromoteRequest(),
    )
    assert applicant.stage == "lead"


@pytest.mark.asyncio
@pytest.mark.parametrize("terminal_stage", ["declined", "archived"])
async def test_promote_rejects_terminal_stages(
    db: AsyncSession,
    test_user: User,
    test_org: Organization,
    patch_session,
    terminal_stage: str,
) -> None:
    inquiry = await _seed_inquiry(
        db, org=test_org, user=test_user, stage=terminal_stage,
    )
    await db.flush()

    with pytest.raises(promote_service.InquiryNotPromotableError) as exc_info:
        await promote_service.promote_from_inquiry(
            organization_id=test_org.id,
            user_id=test_user.id,
            inquiry_id=inquiry.id,
            overrides=ApplicantPromoteRequest(),
        )
    assert exc_info.value.stage == terminal_stage


@pytest.mark.asyncio
async def test_promote_idempotent_second_call_returns_already_promoted_with_existing_id(
    db: AsyncSession, test_user: User, test_org: Organization, patch_session,
) -> None:
    inquiry = await _seed_inquiry(db, org=test_org, user=test_user)
    await db.flush()

    first = await promote_service.promote_from_inquiry(
        organization_id=test_org.id,
        user_id=test_user.id,
        inquiry_id=inquiry.id,
        overrides=ApplicantPromoteRequest(),
    )
    # Capture the id BEFORE the second call so a transaction rollback in
    # the AlreadyPromotedError path can't expire the attribute.
    first_id = first.id

    with pytest.raises(promote_service.AlreadyPromotedError) as exc_info:
        await promote_service.promote_from_inquiry(
            organization_id=test_org.id,
            user_id=test_user.id,
            inquiry_id=inquiry.id,
            overrides=ApplicantPromoteRequest(),
        )
    assert exc_info.value.applicant_id == first_id


@pytest.mark.asyncio
async def test_promote_cross_org_raises_lookup(
    db: AsyncSession, test_user: User, test_org: Organization, patch_session,
) -> None:
    inquiry = await _seed_inquiry(db, org=test_org, user=test_user)
    await db.flush()

    with pytest.raises(LookupError):
        await promote_service.promote_from_inquiry(
            organization_id=uuid.uuid4(),  # different org
            user_id=test_user.id,
            inquiry_id=inquiry.id,
            overrides=ApplicantPromoteRequest(),
        )


@pytest.mark.asyncio
async def test_promote_cross_user_raises_lookup(
    db: AsyncSession, test_user: User, test_org: Organization, patch_session,
) -> None:
    """User A's inquiry must not be promotable by user B even within the same org.

    The repo's tenant scoping is (organization_id, user_id) — promote_service
    must respect both halves.
    """
    inquiry = await _seed_inquiry(db, org=test_org, user=test_user)
    await db.flush()

    with pytest.raises(LookupError):
        await promote_service.promote_from_inquiry(
            organization_id=test_org.id,
            user_id=uuid.uuid4(),  # different user
            inquiry_id=inquiry.id,
            overrides=ApplicantPromoteRequest(),
        )


@pytest.mark.asyncio
async def test_promote_pii_round_trips_decrypted_to_decrypted(
    db: AsyncSession, test_user: User, test_org: Organization, patch_session,
) -> None:
    """Sanity check that EncryptedString → plaintext → EncryptedString preserves values.

    The service reads the inquiry (plaintext) and writes the applicant
    (re-encrypted at bind time). After persisting, reading the applicant
    back via a fresh query must yield the same plaintext.
    """
    inquiry = await _seed_inquiry(
        db, org=test_org, user=test_user,
        inquirer_name="José Ñoño",
        inquirer_employer="St. Anthony's Hôpital",
    )
    await db.flush()

    applicant = await promote_service.promote_from_inquiry(
        organization_id=test_org.id,
        user_id=test_user.id,
        inquiry_id=inquiry.id,
        overrides=ApplicantPromoteRequest(),
    )
    applicant_id = applicant.id

    # Drop the cached ORM identity so the next get() actually re-decodes
    # ciphertext via EncryptedString.process_result_value rather than
    # returning the in-memory plaintext.
    db.expunge_all()

    refreshed = await applicant_repo.get(
        db,
        applicant_id=applicant_id,
        organization_id=test_org.id,
        user_id=test_user.id,
    )
    assert refreshed is not None
    assert refreshed.legal_name == "José Ñoño"
    assert refreshed.employer_or_hospital == "St. Anthony's Hôpital"


@pytest.mark.asyncio
async def test_promote_inquiry_not_found_raises_lookup(
    db: AsyncSession, test_user: User, test_org: Organization, patch_session,
) -> None:
    with pytest.raises(LookupError):
        await promote_service.promote_from_inquiry(
            organization_id=test_org.id,
            user_id=test_user.id,
            inquiry_id=uuid.uuid4(),  # nonexistent
            overrides=ApplicantPromoteRequest(),
        )


@pytest.mark.asyncio
async def test_promote_atomicity_rolls_back_when_post_create_step_fails(
    db: AsyncSession,
    test_user: User,
    test_org: Organization,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Inject a failure mid-transaction (after applicant_repo.create runs) and
    assert no Applicant row remains — rollback must be atomic across both
    domains.

    Unlike the other tests, this one DOESN'T use the shared ``patch_session``
    fixture. It needs a savepoint-style boundary (``begin_nested``) so the
    rollback inside the patched ``unit_of_work`` only affects the changes
    made inside the service, not the seeded inquiry.
    """
    from contextlib import asynccontextmanager

    # Seed the inquiry inside an outer transaction (no flush yet — we'll
    # flush before the savepoint so the row is visible to the service).
    inquiry = await _seed_inquiry(db, org=test_org, user=test_user)
    await db.flush()

    # Patched unit_of_work uses a SAVEPOINT so a rollback only undoes the
    # service's writes, leaving the seeded inquiry intact for assertions.
    @asynccontextmanager
    async def _uow_savepoint():
        savepoint = await db.begin_nested()
        try:
            yield db
            await savepoint.commit()
        except Exception:
            await savepoint.rollback()
            raise

    monkeypatch.setattr(promote_service, "unit_of_work", _uow_savepoint)

    async def _boom(*_args: object, **_kwargs: object) -> object:
        raise RuntimeError("simulated mid-transaction failure")

    # Patch the inquiry_event create so the applicant create + applicant
    # event run, but the inquiry_event write blows up — exercises the
    # rollback path AFTER the applicant has been written.
    monkeypatch.setattr(
        "app.services.applicants.promote_service.inquiry_event_repo.create",
        _boom,
    )

    with pytest.raises(RuntimeError, match="simulated"):
        await promote_service.promote_from_inquiry(
            organization_id=test_org.id,
            user_id=test_user.id,
            inquiry_id=inquiry.id,
            overrides=ApplicantPromoteRequest(),
        )

    # Drop in-memory ORM cache so the assertions actually re-query the DB
    # rather than returning stale objects whose state pre-dated the rollback.
    db.expunge_all()

    # Critical: no Applicant row persisted, no event rows persisted, inquiry
    # stage unchanged.
    applicants = (
        await db.execute(
            select(Applicant).where(Applicant.inquiry_id == inquiry.id),
        )
    ).scalars().all()
    assert applicants == []

    applicant_events = (
        await db.execute(select(ApplicantEvent))
    ).scalars().all()
    assert applicant_events == []

    refreshed = await inquiry_repo.get_by_id(db, inquiry.id, test_org.id)
    assert refreshed is not None
    assert refreshed.stage == "new"
