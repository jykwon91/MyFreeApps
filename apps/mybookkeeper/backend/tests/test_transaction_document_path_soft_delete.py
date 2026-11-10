"""Document-path soft deletes lock in id order, are audited like a single delete, and stay inside the document's org."""
import uuid
from collections.abc import Iterator
from datetime import date, datetime, timezone
from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock

import pytest
from sqlalchemy import select
from sqlalchemy.dialects import postgresql
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import current_user_id
from app.models.documents.document import Document
from app.models.extraction.extraction import Extraction
from app.models.system.audit_log import AuditLog
from app.models.transactions.transaction import Transaction
from app.repositories import document_repo
from app.repositories.transactions import transaction_bulk_repo as repo
from tests.document_support import make_document, setup_org_and_user

AuditRow = tuple[str | None, str | None, str | None, str | None]


def _sql(stmt) -> str:
    return str(stmt.compile(dialect=postgresql.dialect()))


class TestLockStatements:
    def test_document_path_locks_in_id_order_without_locking_extractions(self) -> None:
        sql = _sql(repo.live_transactions_for_document_for_update_stmt(uuid.uuid4(), uuid.uuid4()))

        assert sql.rstrip().endswith("FOR UPDATE")
        assert "ORDER BY transactions.id" in sql
        assert "JOIN" not in sql


class TestDocumentLocksDoNotBlockForeignKeyChecks:
    """Document locks must be FOR NO KEY UPDATE so they don't conflict with the FOR KEY SHARE that a
    TransactionDocument insert takes on the document (keep/merge lock transactions first, then insert links)."""

    @staticmethod
    async def _captured_sql(call) -> str:
        db = MagicMock()
        db.execute = AsyncMock(return_value=MagicMock())
        await call(db)
        return _sql(db.execute.await_args.args[0])

    @pytest.mark.asyncio
    @pytest.mark.parametrize("name", ["get_by_id", "get_by_id_with_content"])
    async def test_single_document_lock(self, name: str) -> None:
        fetch = getattr(document_repo, name)

        sql = await self._captured_sql(lambda db: fetch(db, uuid.uuid4(), uuid.uuid4(), for_update=True))

        assert sql.rstrip().endswith("FOR NO KEY UPDATE")

    @pytest.mark.asyncio
    async def test_list_locks(self) -> None:
        org, calls = uuid.uuid4(), [
            lambda db: document_repo.list_active_by_ids_for_update(db, [uuid.uuid4()], org),
            lambda db: document_repo.list_failed_by_name_for_update(db, org, "f.pdf"),
            lambda db: document_repo.list_unfinished_in_batch_for_update(db, org, "b1"),
        ]

        for call in calls:
            sql = await self._captured_sql(call)
            assert sql.rstrip().endswith("FOR NO KEY UPDATE")
            assert "ORDER BY documents.id" in sql


@pytest.fixture()
def acting_user() -> Iterator[str]:
    user_id = str(uuid.uuid4())
    token = current_user_id.set(user_id)
    yield user_id
    current_user_id.reset(token)


async def _seed(
    db: AsyncSession, org_id: uuid.UUID, user_id: uuid.UUID, *, doc: Document | None = None,
    count: int = 1,
) -> list[Transaction]:
    extraction_id = None
    if doc is not None:
        extraction = Extraction(
            document_id=doc.id, organization_id=org_id, user_id=user_id, status="completed",
            raw_response={}, confidence="high", document_type="invoice", tokens_used=0,
        )
        db.add(extraction)
        await db.flush()
        extraction_id = extraction.id
    txns = [
        Transaction(
            id=uuid.uuid4(), organization_id=org_id, user_id=user_id, transaction_date=date(2025, 6, 15),
            tax_year=2025, vendor="V", amount=Decimal("10.00"), transaction_type="expense",
            category="maintenance", status="approved", extraction_id=extraction_id,
        )
        for _ in range(count)
    ]
    db.add_all(txns)
    await db.commit()
    return txns


async def _audit(db: AsyncSession, transaction_id: uuid.UUID) -> set[AuditRow]:
    rows = (await db.execute(
        select(AuditLog).where(
            AuditLog.table_name == "transactions",
            AuditLog.record_id == str(transaction_id),
            AuditLog.operation == "UPDATE",
        )
    )).scalars().all()
    return {
        (r.field_name, r.old_value, r.new_value if r.field_name != "deleted_at" else None, r.changed_by)
        for r in rows
    }


@pytest.mark.usefixtures("audit_listeners")
class TestDocumentPathSoftDelete:
    @pytest.mark.asyncio
    async def test_document_path_audits_like_a_single_delete_and_returns_the_rows(
        self, db: AsyncSession, acting_user: str,
    ) -> None:
        user, org_id = await setup_org_and_user(db)
        doc = make_document(org_id, user.id)
        db.add(doc)
        await db.commit()
        single = (await _seed(db, org_id, user.id))[0]
        linked = await _seed(db, org_id, user.id, doc=doc, count=3)
        already_deleted = (await _seed(db, org_id, user.id, doc=doc))[0]
        already_deleted.deleted_at = datetime.now(timezone.utc)
        await db.commit()

        await repo.mark_deleted(db, single)
        await db.commit()
        returned = await repo.soft_delete_by_document_id(db, doc.id, org_id)
        await db.commit()

        assert {t.id for t in returned} == {t.id for t in linked}
        assert already_deleted.id not in {t.id for t in returned}
        expected = await _audit(db, single.id)
        assert {f for f, _, _, _ in expected} >= {"status", "deleted_at"}
        assert {by for _, _, _, by in expected} == {acting_user}
        for txn in linked:
            await db.refresh(txn)
            assert txn.status == "duplicate" and txn.deleted_at is not None
            assert await _audit(db, txn.id) == expected

    @pytest.mark.asyncio
    async def test_other_orgs_and_unlinked_transactions_are_untouched(self, db: AsyncSession) -> None:
        user, org_id = await setup_org_and_user(db)
        other_user, other_org_id = await setup_org_and_user(db)
        doc = make_document(org_id, user.id)
        other_doc = make_document(other_org_id, other_user.id)
        db.add_all([doc, other_doc])
        await db.commit()
        target = (await _seed(db, org_id, user.id, doc=doc))[0]
        unlinked = (await _seed(db, org_id, user.id))[0]
        other_org_txn = (await _seed(db, other_org_id, other_user.id, doc=other_doc))[0]

        returned = await repo.soft_delete_by_document_id(db, doc.id, org_id)
        await db.commit()

        assert [t.id for t in returned] == [target.id]
        for txn in (unlinked, other_org_txn):
            await db.refresh(txn)
            assert txn.deleted_at is None and txn.status == "approved"
        # The other org's document id, asked for by this org, matches nothing.
        assert await repo.soft_delete_by_document_id(db, other_doc.id, org_id) == []
        await db.refresh(other_org_txn)
        assert other_org_txn.deleted_at is None

    @pytest.mark.asyncio
    async def test_nothing_to_delete_returns_empty(self, db: AsyncSession) -> None:
        _, org_id = await setup_org_and_user(db)

        assert await repo.soft_delete_by_document_id(db, uuid.uuid4(), org_id) == []
