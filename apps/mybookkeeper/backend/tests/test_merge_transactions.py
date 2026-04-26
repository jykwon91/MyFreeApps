"""Tests for merge_transactions service and auto_pick_defaults heuristics."""
import uuid
from contextlib import asynccontextmanager
from datetime import date, datetime, timezone
from decimal import Decimal
from unittest.mock import patch

import pytest
import pytest_asyncio
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.organization.organization import Organization
from app.models.transactions.transaction import Transaction
from app.models.transactions.transaction_document import TransactionDocument
from app.models.user.user import User
from app.repositories import transaction_repo
from app.schemas.transactions.duplicate import DuplicateMergeFieldSource, DuplicateMergeOverrides
from app.services.transactions import transaction_service
from app.services.transactions.merge_strategy import MERGEABLE_FIELDS, auto_pick_defaults
from app.core.context import RequestContext


def _ctx(org: Organization, user: User) -> RequestContext:
    return RequestContext(
        organization_id=org.id,
        user_id=user.id,
        org_role="owner",
    )


def _make_txn(
    org: Organization,
    user: User,
    *,
    transaction_date: date = date(2025, 6, 15),
    vendor: str | None = "ACME Corp",
    description: str | None = "Plumbing work",
    amount: Decimal = Decimal("500.00"),
    category: str = "maintenance",
    tags: list[str] | None = None,
    extraction_id: uuid.UUID | None = None,
    property_id: uuid.UUID | None = None,
    payment_method: str | None = None,
    channel: str | None = None,
) -> Transaction:
    return Transaction(
        id=uuid.uuid4(),
        organization_id=org.id,
        user_id=user.id,
        transaction_date=transaction_date,
        tax_year=transaction_date.year,
        vendor=vendor,
        description=description,
        amount=amount,
        transaction_type="expense",
        category=category,
        tags=tags or [],
        extraction_id=extraction_id,
        property_id=property_id,
        payment_method=payment_method,
        channel=channel,
        status="pending",
    )


# ---------------------------------------------------------------------------
# auto_pick_defaults unit tests
# ---------------------------------------------------------------------------

class TestAutoPickDefaults:
    def _base_a(self, org: Organization, user: User) -> Transaction:
        return _make_txn(org, user)

    def _base_b(self, org: Organization, user: User) -> Transaction:
        return _make_txn(org, user)

    def test_returns_all_mergeable_fields(
        self, test_org: Organization, test_user: User,
    ) -> None:
        a = self._base_a(test_org, test_user)
        b = self._base_b(test_org, test_user)
        result = auto_pick_defaults(a, b)
        assert set(result.keys()) == set(MERGEABLE_FIELDS)

    def test_transaction_date_prefers_earlier(
        self, test_org: Organization, test_user: User,
    ) -> None:
        a = _make_txn(test_org, test_user, transaction_date=date(2025, 1, 1))
        b = _make_txn(test_org, test_user, transaction_date=date(2025, 6, 1))
        picks = auto_pick_defaults(a, b)
        assert picks["transaction_date"] == "a"

    def test_transaction_date_prefers_earlier_b(
        self, test_org: Organization, test_user: User,
    ) -> None:
        a = _make_txn(test_org, test_user, transaction_date=date(2025, 9, 1))
        b = _make_txn(test_org, test_user, transaction_date=date(2025, 3, 1))
        picks = auto_pick_defaults(a, b)
        assert picks["transaction_date"] == "b"

    def test_vendor_prefers_non_null(
        self, test_org: Organization, test_user: User,
    ) -> None:
        a = _make_txn(test_org, test_user, vendor=None)
        b = _make_txn(test_org, test_user, vendor="Home Depot")
        picks = auto_pick_defaults(a, b)
        assert picks["vendor"] == "b"

    def test_vendor_prefers_longer_when_both_non_null(
        self, test_org: Organization, test_user: User,
    ) -> None:
        a = _make_txn(test_org, test_user, vendor="ACME")
        b = _make_txn(test_org, test_user, vendor="ACME Corporation Inc")
        picks = auto_pick_defaults(a, b)
        assert picks["vendor"] == "b"

    def test_description_prefers_non_null(
        self, test_org: Organization, test_user: User,
    ) -> None:
        a = _make_txn(test_org, test_user, description=None)
        b = _make_txn(test_org, test_user, description="Roof repair")
        picks = auto_pick_defaults(a, b)
        assert picks["description"] == "b"

    def test_amount_prefers_extraction_source(
        self, test_org: Organization, test_user: User,
    ) -> None:
        ext_id = uuid.uuid4()
        a = _make_txn(test_org, test_user, extraction_id=None)
        b = _make_txn(test_org, test_user, extraction_id=ext_id)
        picks = auto_pick_defaults(a, b)
        assert picks["amount"] == "b"

    def test_amount_defaults_to_a_when_neither_extracted(
        self, test_org: Organization, test_user: User,
    ) -> None:
        a = _make_txn(test_org, test_user, extraction_id=None)
        b = _make_txn(test_org, test_user, extraction_id=None)
        picks = auto_pick_defaults(a, b)
        assert picks["amount"] == "a"

    def test_category_prefers_non_uncategorized(
        self, test_org: Organization, test_user: User,
    ) -> None:
        a = _make_txn(test_org, test_user, category="uncategorized")
        b = _make_txn(test_org, test_user, category="maintenance")
        picks = auto_pick_defaults(a, b)
        assert picks["category"] == "b"

    def test_property_id_prefers_non_null(
        self, test_org: Organization, test_user: User,
    ) -> None:
        prop_id = uuid.uuid4()
        a = _make_txn(test_org, test_user, property_id=None)
        b = _make_txn(test_org, test_user, property_id=prop_id)
        picks = auto_pick_defaults(a, b)
        assert picks["property_id"] == "b"

    def test_tags_always_both(
        self, test_org: Organization, test_user: User,
    ) -> None:
        a = _make_txn(test_org, test_user, tags=["tag1"])
        b = _make_txn(test_org, test_user, tags=["tag2"])
        picks = auto_pick_defaults(a, b)
        assert picks["tags"] == "both"

    def test_payment_method_prefers_non_null(
        self, test_org: Organization, test_user: User,
    ) -> None:
        a = _make_txn(test_org, test_user, payment_method=None)
        b = _make_txn(test_org, test_user, payment_method="check")
        picks = auto_pick_defaults(a, b)
        assert picks["payment_method"] == "b"

    def test_channel_prefers_non_null(
        self, test_org: Organization, test_user: User,
    ) -> None:
        a = _make_txn(test_org, test_user, channel=None)
        b = _make_txn(test_org, test_user, channel="airbnb")
        picks = auto_pick_defaults(a, b)
        assert picks["channel"] == "b"


# ---------------------------------------------------------------------------
# merge_transactions service tests
# ---------------------------------------------------------------------------

class TestMergeTransactions:
    @pytest.mark.asyncio
    async def test_happy_path_auto_pick(
        self, db: AsyncSession, test_org: Organization, test_user: User,
    ) -> None:
        """Merging with no overrides should apply auto_pick_defaults heuristics."""
        ctx = _ctx(test_org, test_user)
        txn_a = _make_txn(test_org, test_user, vendor="ACME", transaction_date=date(2025, 3, 1))
        txn_b = _make_txn(test_org, test_user, vendor="ACME Corporation", transaction_date=date(2025, 6, 1))
        db.add(txn_a)
        db.add(txn_b)
        await db.commit()

        @asynccontextmanager
        async def _fake():
            yield db

        with (
            patch("app.services.transactions.transaction_service.AsyncSessionLocal", _fake),
            patch("app.services.transactions.transaction_service.unit_of_work", _fake),
        ):
            result = await transaction_service.merge_transactions(
                ctx,
                txn_a.id,
                txn_b.id,
                txn_a.id,  # a survives
                DuplicateMergeOverrides(),
            )

        assert result is not None
        assert result.id == txn_a.id
        # Earlier date preferred (a = Mar 1)
        assert result.transaction_date == date(2025, 3, 1)
        # Longer vendor preferred (b = "ACME Corporation")
        assert result.vendor == "ACME Corporation"

    @pytest.mark.asyncio
    async def test_field_override_respected(
        self, db: AsyncSession, test_org: Organization, test_user: User,
    ) -> None:
        """An explicit override must win over auto_pick_defaults."""
        ctx = _ctx(test_org, test_user)
        txn_a = _make_txn(test_org, test_user, vendor="Short", description="Desc A")
        txn_b = _make_txn(test_org, test_user, vendor="Much Longer Name", description="Desc B")
        db.add(txn_a)
        db.add(txn_b)
        await db.commit()

        @asynccontextmanager
        async def _fake():
            yield db

        overrides = DuplicateMergeOverrides(
            vendor=DuplicateMergeFieldSource.a,  # force short vendor from a
            description=DuplicateMergeFieldSource.b,
        )

        with (
            patch("app.services.transactions.transaction_service.AsyncSessionLocal", _fake),
            patch("app.services.transactions.transaction_service.unit_of_work", _fake),
        ):
            result = await transaction_service.merge_transactions(
                ctx, txn_a.id, txn_b.id, txn_a.id, overrides,
            )

        assert result.vendor == "Short"
        assert result.description == "Desc B"

    @pytest.mark.asyncio
    async def test_tags_always_unioned(
        self, db: AsyncSession, test_org: Organization, test_user: User,
    ) -> None:
        """Tags must always be the union of both transactions' tags."""
        ctx = _ctx(test_org, test_user)
        txn_a = _make_txn(test_org, test_user, tags=["alpha", "shared"])
        txn_b = _make_txn(test_org, test_user, tags=["beta", "shared"])
        db.add(txn_a)
        db.add(txn_b)
        await db.commit()

        @asynccontextmanager
        async def _fake():
            yield db

        # Even with an override pointing to only one side, tags must still be unioned
        overrides = DuplicateMergeOverrides(tags=DuplicateMergeFieldSource.a)

        with (
            patch("app.services.transactions.transaction_service.AsyncSessionLocal", _fake),
            patch("app.services.transactions.transaction_service.unit_of_work", _fake),
        ):
            result = await transaction_service.merge_transactions(
                ctx, txn_a.id, txn_b.id, txn_a.id, overrides,
            )

        assert set(result.tags) == {"alpha", "beta", "shared"}
        assert result.tags.count("shared") == 1  # deduplicated

    @pytest.mark.asyncio
    async def test_derived_fields_recomputed(
        self, db: AsyncSession, test_org: Organization, test_user: User,
    ) -> None:
        """transaction_type and schedule_e_line must be recomputed from the merged category."""
        ctx = _ctx(test_org, test_user)
        # txn_a has "rental_revenue" (income), txn_b has "maintenance" (expense)
        # We'll override category to "a" (rental_revenue) and surviving = b
        txn_a = _make_txn(
            test_org, test_user,
            category="rental_revenue",
            transaction_date=date(2025, 4, 10),
        )
        txn_a.transaction_type = "income"
        txn_b = _make_txn(
            test_org, test_user,
            category="maintenance",
            transaction_date=date(2025, 6, 15),
        )
        db.add(txn_a)
        db.add(txn_b)
        await db.commit()

        @asynccontextmanager
        async def _fake():
            yield db

        overrides = DuplicateMergeOverrides(category=DuplicateMergeFieldSource.a)

        with (
            patch("app.services.transactions.transaction_service.AsyncSessionLocal", _fake),
            patch("app.services.transactions.transaction_service.unit_of_work", _fake),
        ):
            result = await transaction_service.merge_transactions(
                ctx, txn_a.id, txn_b.id, txn_b.id, overrides,
            )

        assert result.category == "rental_revenue"
        assert result.transaction_type == "income"
        assert result.schedule_e_line == "line_3_rents_received"

    @pytest.mark.asyncio
    async def test_tax_year_recomputed_from_date(
        self, db: AsyncSession, test_org: Organization, test_user: User,
    ) -> None:
        """tax_year must be recomputed from the surviving transaction_date."""
        ctx = _ctx(test_org, test_user)
        txn_a = _make_txn(test_org, test_user, transaction_date=date(2024, 12, 1))
        txn_b = _make_txn(test_org, test_user, transaction_date=date(2025, 3, 1))
        db.add(txn_a)
        db.add(txn_b)
        await db.commit()

        @asynccontextmanager
        async def _fake():
            yield db

        # Auto-pick will choose earlier date (a = 2024-12-01), so tax_year should be 2024
        with (
            patch("app.services.transactions.transaction_service.AsyncSessionLocal", _fake),
            patch("app.services.transactions.transaction_service.unit_of_work", _fake),
        ):
            result = await transaction_service.merge_transactions(
                ctx, txn_a.id, txn_b.id, txn_a.id, DuplicateMergeOverrides(),
            )

        assert result.transaction_date == date(2024, 12, 1)
        assert result.tax_year == 2024

    @pytest.mark.asyncio
    async def test_loser_is_soft_deleted(
        self, db: AsyncSession, test_org: Organization, test_user: User,
    ) -> None:
        """The non-surviving transaction must be soft-deleted after merge."""
        ctx = _ctx(test_org, test_user)
        txn_a = _make_txn(test_org, test_user)
        txn_b = _make_txn(test_org, test_user)
        db.add(txn_a)
        db.add(txn_b)
        await db.commit()
        loser_id = txn_b.id

        @asynccontextmanager
        async def _fake():
            yield db

        with (
            patch("app.services.transactions.transaction_service.AsyncSessionLocal", _fake),
            patch("app.services.transactions.transaction_service.unit_of_work", _fake),
        ):
            await transaction_service.merge_transactions(
                ctx, txn_a.id, txn_b.id, txn_a.id, DuplicateMergeOverrides(),
            )

        await db.refresh(txn_b)
        assert txn_b.deleted_at is not None
        assert txn_b.status == "duplicate"

    @pytest.mark.asyncio
    async def test_document_links_transferred(
        self, db: AsyncSession, test_org: Organization, test_user: User,
    ) -> None:
        """Document links from the deleted transaction must be transferred to the survivor."""
        ctx = _ctx(test_org, test_user)
        txn_a = _make_txn(test_org, test_user)
        txn_b = _make_txn(test_org, test_user)
        db.add(txn_a)
        db.add(txn_b)
        await db.flush()

        doc_id = uuid.uuid4()
        link = TransactionDocument(
            transaction_id=txn_b.id,
            document_id=doc_id,
            link_type="manual",
        )
        db.add(link)
        await db.commit()

        @asynccontextmanager
        async def _fake():
            yield db

        with (
            patch("app.services.transactions.transaction_service.AsyncSessionLocal", _fake),
            patch("app.services.transactions.transaction_service.unit_of_work", _fake),
        ):
            await transaction_service.merge_transactions(
                ctx, txn_a.id, txn_b.id, txn_a.id, DuplicateMergeOverrides(),
            )

        # Document should now be linked to the survivor (a)
        links = (
            await db.execute(
                select(TransactionDocument).where(
                    TransactionDocument.transaction_id == txn_a.id,
                    TransactionDocument.document_id == doc_id,
                )
            )
        ).scalars().all()
        assert len(links) == 1

    @pytest.mark.asyncio
    async def test_surviving_marked_reviewed(
        self, db: AsyncSession, test_org: Organization, test_user: User,
    ) -> None:
        """The surviving transaction must have duplicate_reviewed_at set."""
        ctx = _ctx(test_org, test_user)
        txn_a = _make_txn(test_org, test_user)
        txn_b = _make_txn(test_org, test_user)
        db.add(txn_a)
        db.add(txn_b)
        await db.commit()

        @asynccontextmanager
        async def _fake():
            yield db

        with (
            patch("app.services.transactions.transaction_service.AsyncSessionLocal", _fake),
            patch("app.services.transactions.transaction_service.unit_of_work", _fake),
        ):
            result = await transaction_service.merge_transactions(
                ctx, txn_a.id, txn_b.id, txn_a.id, DuplicateMergeOverrides(),
            )

        assert result.duplicate_reviewed_at is not None

    @pytest.mark.asyncio
    async def test_invalid_surviving_id_raises(
        self, db: AsyncSession, test_org: Organization, test_user: User,
    ) -> None:
        """surviving_id that is not one of a/b must raise ValueError."""
        ctx = _ctx(test_org, test_user)
        txn_a = _make_txn(test_org, test_user)
        txn_b = _make_txn(test_org, test_user)
        db.add(txn_a)
        db.add(txn_b)
        await db.commit()

        @asynccontextmanager
        async def _fake():
            yield db

        with (
            patch("app.services.transactions.transaction_service.AsyncSessionLocal", _fake),
            patch("app.services.transactions.transaction_service.unit_of_work", _fake),
            pytest.raises(ValueError, match="surviving_id must be one of"),
        ):
            await transaction_service.merge_transactions(
                ctx, txn_a.id, txn_b.id, uuid.uuid4(), DuplicateMergeOverrides(),
            )

    @pytest.mark.asyncio
    async def test_missing_transaction_a_raises(
        self, db: AsyncSession, test_org: Organization, test_user: User,
    ) -> None:
        """A missing transaction_a must raise ValueError."""
        ctx = _ctx(test_org, test_user)
        txn_b = _make_txn(test_org, test_user)
        db.add(txn_b)
        await db.commit()
        missing_id = uuid.uuid4()

        @asynccontextmanager
        async def _fake():
            yield db

        with (
            patch("app.services.transactions.transaction_service.AsyncSessionLocal", _fake),
            patch("app.services.transactions.transaction_service.unit_of_work", _fake),
            pytest.raises(ValueError, match="not found"),
        ):
            await transaction_service.merge_transactions(
                ctx, missing_id, txn_b.id, missing_id, DuplicateMergeOverrides(),
            )

    @pytest.mark.asyncio
    async def test_missing_transaction_b_raises(
        self, db: AsyncSession, test_org: Organization, test_user: User,
    ) -> None:
        """A missing transaction_b must raise ValueError."""
        ctx = _ctx(test_org, test_user)
        txn_a = _make_txn(test_org, test_user)
        db.add(txn_a)
        await db.commit()
        missing_id = uuid.uuid4()

        @asynccontextmanager
        async def _fake():
            yield db

        with (
            patch("app.services.transactions.transaction_service.AsyncSessionLocal", _fake),
            patch("app.services.transactions.transaction_service.unit_of_work", _fake),
            pytest.raises(ValueError, match="not found"),
        ):
            await transaction_service.merge_transactions(
                ctx, txn_a.id, missing_id, txn_a.id, DuplicateMergeOverrides(),
            )

    @pytest.mark.asyncio
    async def test_b_can_survive(
        self, db: AsyncSession, test_org: Organization, test_user: User,
    ) -> None:
        """When surviving_id == b, txn_b must be the survivor and txn_a must be deleted."""
        ctx = _ctx(test_org, test_user)
        txn_a = _make_txn(test_org, test_user, vendor="Alpha")
        txn_b = _make_txn(test_org, test_user, vendor="Beta")
        db.add(txn_a)
        db.add(txn_b)
        await db.commit()

        @asynccontextmanager
        async def _fake():
            yield db

        with (
            patch("app.services.transactions.transaction_service.AsyncSessionLocal", _fake),
            patch("app.services.transactions.transaction_service.unit_of_work", _fake),
        ):
            result = await transaction_service.merge_transactions(
                ctx, txn_a.id, txn_b.id, txn_b.id, DuplicateMergeOverrides(),
            )

        assert result.id == txn_b.id
        await db.refresh(txn_a)
        assert txn_a.deleted_at is not None
