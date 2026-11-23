"""Repository writes that used to be bulk ``UPDATE`` / ``DELETE`` statements are audited.

The audit listener only sees changes made through ORM objects, so a bulk
statement left no ``audit_logs`` rows. Each case runs one write and checks the
audit rows it left for the row it changed, naming the actor. The guard tests
check a row someone else already changed is left alone, with no audit rows.
"""
from __future__ import annotations

import uuid
from collections.abc import Iterator
from datetime import timedelta
from unittest.mock import AsyncMock, patch

import pytest
from platform_shared.db.models.audit_log import AuditLog
from platform_shared.testing.audit_erasure import audit_listener_attached
from platform_shared.testing.audited_write_case import AuditedWriteCase, run_audited_write_case
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import AUDIT_CONFIG
from app.models.application.application import Application
from app.models.company.company import Company
from app.models.company.company_research import CompanyResearch
from app.models.company.research_source import ResearchSource
from app.models.discovery.discovered_job import DiscoveredJob
from app.models.discovery.discovery_fetch import DiscoveryFetch
from app.repositories.application import application_repository
from app.repositories.company import company_repository, company_research_repository
from app.repositories.discovery import discovery_promotion_repository, discovery_repository
from app.repositories.resume_refinement import session_repo
from app.services.discovery.discovery_fetch_reaper import REAP_AFTER_MINUTES, reap_stale_running_fetches
from app.services.resume_refinement import session_lifecycle_service
from app.workers.refinement_prepare_worker import process_one_session
from tests import audited_write_seeds as seeds
from tests.audited_write_seeds import LONG_AGO, NOW

ACTOR = uuid.uuid4()
STALE = NOW - timedelta(minutes=REAP_AFTER_MINUTES + 1)


@pytest.fixture()
def audit_listener() -> Iterator[None]:
    with audit_listener_attached(AUDIT_CONFIG):
        yield


async def _promoted_job(db: AsyncSession) -> DiscoveredJob:
    return await seeds.discovered_job(db, promoted_to=await seeds.application(db))


async def _expire_missing(db: AsyncSession, job: DiscoveredJob) -> int:
    fetch = await db.get(DiscoveryFetch, job.fetch_id)
    assert fetch is not None
    return await discovery_repository.mark_missing_as_expired(
        db, user_id=job.user_id, discovery_source_id=fetch.discovery_source_id, seen_external_ids=["another-job"],
    )


async def _reap(db: AsyncSession, _row: DiscoveryFetch) -> None:
    for fetch in await discovery_repository.lock_stale_fetches(db, cutoff=NOW):
        await discovery_repository.mark_reaped(db, fetch)


async def _claim_preparation(db: AsyncSession, _row: object) -> None:
    due = await session_repo.lock_next_due_preparation(db)
    assert due is not None
    await session_repo.mark_preparation_started(db, due)


async def _rerun_research(db: AsyncSession, source: ResearchSource) -> CompanyResearch:
    research = await db.get(CompanyResearch, source.company_research_id)
    assert research is not None
    return await company_research_repository.upsert_for_company(
        db, company_id=research.company_id, user_id=research.user_id, overall_sentiment="positive",
        senior_engineer_sentiment=None, interview_process=None, red_flags=[], green_flags=[],
        reported_comp_range_min=None, reported_comp_range_max=None, comp_currency="USD",
        comp_confidence="unknown", raw_synthesis=None,
    )


async def _claimed_company(db: AsyncSession) -> Company:
    return await seeds.company(db, research_started_at=NOW)


CASES = [
    AuditedWriteCase(
        "discovery_promotion.clear_promotion_links", _promoted_job,
        lambda db, job: discovery_promotion_repository.clear_promotion_links(
            db, job.user_id, job.promoted_application_id,
        ),
        "UPDATE", frozenset({"promoted_application_id", "promoted_at"}),
    ),
    AuditedWriteCase(
        "discovery.mark_missing_as_expired", lambda db: seeds.discovered_job(db), _expire_missing,
        "UPDATE", frozenset({"expired_at"}),
    ),
    AuditedWriteCase(
        "discovery.lock_stale_fetches + mark_reaped",
        lambda db: seeds.discovery_fetch(db, status="running", started_at=STALE), _reap,
        "UPDATE", frozenset({"status", "error_message"}),
    ),
    AuditedWriteCase(
        "application.delete_by_ids", seeds.application,
        lambda db, app: application_repository.delete_by_ids(db, [app.id], app.user_id),
        "DELETE",
    ),
    AuditedWriteCase(
        "company.try_claim_research", seeds.company,
        lambda db, company: company_repository.try_claim_research(
            db, company.id, company.user_id, claimed_at=NOW, stale_before=NOW,
        ),
        "UPDATE", frozenset({"research_started_at"}),
    ),
    AuditedWriteCase(
        "company.renew_research_claim", _claimed_company,
        lambda db, company: company_repository.renew_research_claim(
            db, company.id, company.user_id, claimed_at=NOW, renewed_at=NOW + timedelta(minutes=1),
        ),
        "UPDATE", frozenset({"research_started_at"}),
    ),
    AuditedWriteCase(
        "company.release_research_claim", _claimed_company,
        lambda db, company: company_repository.release_research_claim(
            db, company.id, company.user_id, claimed_at=NOW,
        ),
        "UPDATE", frozenset({"research_started_at"}),
    ),
    AuditedWriteCase(
        "company_research.upsert_for_company (the old source)", seeds.research_source, _rerun_research,
        "DELETE",
    ),
    AuditedWriteCase(
        "session.lock_next_due_preparation + mark_preparation_started", seeds.preparing_session,
        _claim_preparation,
        "UPDATE", frozenset({"preparation_started_at", "updated_at"}),
    ),
]


@pytest.mark.usefixtures("audit_listener")
@pytest.mark.parametrize("case", CASES, ids=[case.name for case in CASES])
async def test_write_is_audited_as_the_actor(db: AsyncSession, case: AuditedWriteCase) -> None:
    await run_audited_write_case(db, case, actor=ACTOR)


async def _clear_audit_rows(db: AsyncSession) -> None:
    await db.flush()  # the seeds' INSERT audit rows are written on the next flush
    await db.execute(AuditLog.__table__.delete())


async def _audit_rows(db: AsyncSession, table: str, record_id: uuid.UUID) -> list[AuditLog]:
    return list((await db.execute(
        select(AuditLog).where(AuditLog.table_name == table, AuditLog.record_id == str(record_id)),
    )).scalars().all())


@pytest.mark.usefixtures("audit_listener")
async def test_deleting_an_application_audits_its_events_too(db: AsyncSession) -> None:
    app = await seeds.application(db)
    event = await seeds.application_event(db, app)
    await _clear_audit_rows(db)

    await application_repository.delete_by_ids(db, [app.id], app.user_id)

    assert {log.operation for log in await _audit_rows(db, "application_events", event.id)} == {"DELETE"}
    assert await db.get(Application, app.id) is None


@pytest.mark.usefixtures("audit_listener")
async def test_a_research_claim_keeps_the_companys_updated_at(db: AsyncSession) -> None:
    company = await seeds.company(db)

    assert await company_repository.try_claim_research(
        db, company.id, company.user_id, claimed_at=NOW, stale_before=NOW,
    )

    await db.refresh(company)
    assert company.research_started_at == NOW
    assert company.updated_at == LONG_AGO


# --- Guards: a row someone else already changed is left alone ---------------


@pytest.mark.usefixtures("audit_listener")
async def test_a_live_research_claim_is_not_taken(db: AsyncSession) -> None:
    company = await seeds.company(db, research_started_at=NOW)
    await _clear_audit_rows(db)

    claimed = await company_repository.try_claim_research(
        db, company.id, company.user_id, claimed_at=NOW + timedelta(minutes=1), stale_before=NOW,
    )

    assert claimed is False
    await db.refresh(company)
    assert company.research_started_at == NOW
    assert await _audit_rows(db, "companies", company.id) == []


@pytest.mark.usefixtures("audit_listener")
async def test_a_taken_over_claim_is_neither_renewed_nor_released(db: AsyncSession) -> None:
    newer = NOW + timedelta(minutes=5)
    company = await seeds.company(db, research_started_at=newer)
    await _clear_audit_rows(db)

    renewed = await company_repository.renew_research_claim(
        db, company.id, company.user_id, claimed_at=NOW, renewed_at=NOW + timedelta(minutes=6),
    )
    await company_repository.release_research_claim(db, company.id, company.user_id, claimed_at=NOW)

    assert renewed is False
    await db.refresh(company)
    assert company.research_started_at == newer
    assert await _audit_rows(db, "companies", company.id) == []


@pytest.mark.usefixtures("audit_listener")
async def test_clearing_links_leaves_another_applications_posting(db: AsyncSession) -> None:
    job = await _promoted_job(db)
    await _clear_audit_rows(db)

    await discovery_promotion_repository.clear_promotion_links(db, job.user_id, uuid.uuid4())

    await db.refresh(job)
    assert job.promoted_application_id is not None
    assert await _audit_rows(db, "discovered_jobs", job.id) == []


@pytest.mark.usefixtures("audit_listener")
async def test_an_expired_posting_keeps_its_expiry(db: AsyncSession) -> None:
    job = await seeds.discovered_job(db, expired_at=LONG_AGO)
    await _clear_audit_rows(db)

    assert await _expire_missing(db, job) == 0

    await db.refresh(job)
    assert job.expired_at == LONG_AGO
    assert await _audit_rows(db, "discovered_jobs", job.id) == []


@pytest.mark.usefixtures("audit_listener")
async def test_a_claimed_preparation_is_not_claimed_again(db: AsyncSession) -> None:
    session = await seeds.preparing_session(db, preparation_started_at=NOW)
    await _clear_audit_rows(db)

    assert await session_repo.lock_next_due_preparation(db) is None
    assert await _audit_rows(db, "resume_refinement_sessions", session.id) == []


# --- Background jobs audit as the row's owner --------------------------------


@pytest.mark.usefixtures("audit_listener")
async def test_the_startup_reaper_audits_each_fetch_as_its_owner(db: AsyncSession) -> None:
    first = await seeds.discovery_fetch(db, status="running", started_at=STALE)
    second = await seeds.discovery_fetch(db, status="running", started_at=STALE)
    await _clear_audit_rows(db)

    assert await reap_stale_running_fetches() == 2

    for fetch in (first, second):
        logs = await _audit_rows(db, "discovery_fetches", fetch.id)
        assert {log.field_name for log in logs} >= {"status", "error_message"}
        assert {log.changed_by for log in logs} == {str(fetch.user_id)}


@pytest.mark.usefixtures("audit_listener")
async def test_the_preparation_claim_is_audited_as_the_sessions_user(db: AsyncSession) -> None:
    session = await seeds.preparing_session(db)
    await db.commit()
    await _clear_audit_rows(db)
    await db.commit()

    with patch.object(session_lifecycle_service, "prepare_session", new=AsyncMock()):
        assert await process_one_session() is True

    logs = await _audit_rows(db, "resume_refinement_sessions", session.id)
    claim_logs = [log for log in logs if log.field_name == "preparation_started_at"]
    assert claim_logs
    assert {log.changed_by for log in claim_logs} == {str(session.user_id)}
