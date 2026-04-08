"""Tests for bank CSV import service."""
import uuid
from contextlib import asynccontextmanager
from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.core.context import RequestContext
from app.models.organization.organization_member import OrgRole
from app.services.transactions.import_service import import_bank_csv_file


@pytest.fixture()
def ctx() -> RequestContext:
    return RequestContext(
        organization_id=uuid.uuid4(),
        user_id=uuid.uuid4(),
        org_role=OrgRole.OWNER,
    )


def _make_txn(external_id: str, org_id, user_id) -> MagicMock:
    from datetime import date
    txn = MagicMock()
    txn.external_id = external_id
    txn.transaction_date = date(2025, 6, 15)
    txn.vendor = 'Test Vendor'
    txn.amount = Decimal('150.00')
    txn.transaction_type = 'expense'
    txn.category = 'utilities'
    return txn


class TestImportBankCsvFileValidation:
    @pytest.mark.asyncio
    async def test_raises_for_non_csv_filename(self, ctx: RequestContext) -> None:
        with pytest.raises(ValueError, match='File must be a CSV'):
            await import_bank_csv_file(ctx, b'some data', 'export.xlsx', None)

    @pytest.mark.asyncio
    async def test_raises_for_txt_filename(self, ctx: RequestContext) -> None:
        with pytest.raises(ValueError, match='File must be a CSV'):
            await import_bank_csv_file(ctx, b'data', 'data.txt', None)

    @pytest.mark.asyncio
    async def test_raises_for_oversized_file(self, ctx: RequestContext) -> None:
        big_content = b'x' * (5 * 1024 * 1024 + 1)
        with pytest.raises(ValueError, match='too large'):
            await import_bank_csv_file(ctx, big_content, 'data.csv', None)

    @pytest.mark.asyncio
    async def test_raises_for_unrecognized_format(self, ctx: RequestContext) -> None:
        with patch(
            'app.services.transactions.import_service.detect_bank_format',
            return_value='unknown',
        ):
            with pytest.raises(ValueError, match='detect bank CSV format'):
                await import_bank_csv_file(ctx, b'garbage,data', 'data.csv', None)

    @pytest.mark.asyncio
    async def test_raises_when_no_transactions_found(self, ctx: RequestContext) -> None:
        with patch(
            'app.services.transactions.import_service.detect_bank_format',
            return_value='chase',
        ), patch(
            'app.services.transactions.import_service.parse_bank_csv',
            return_value=[],
        ):
            with pytest.raises(ValueError, match='No transactions found'):
                await import_bank_csv_file(ctx, b'Date,Desc,Amount', 'data.csv', None)


class TestImportBankCsvFileSuccess:
    @pytest.mark.asyncio
    async def test_successfully_imports_new_transactions(self, ctx: RequestContext) -> None:
        mock_db = MagicMock()

        @asynccontextmanager
        async def fake_uow():
            yield mock_db

        org_id, user_id = ctx.organization_id, ctx.user_id
        txns = [
            _make_txn('ext-001', org_id, user_id),
            _make_txn('ext-002', org_id, user_id),
        ]
        with (
            patch('app.services.transactions.import_service.detect_bank_format', return_value='chase'),
            patch('app.services.transactions.import_service.parse_bank_csv', return_value=txns),
            patch('app.services.transactions.import_service.unit_of_work', fake_uow),
            patch('app.services.transactions.import_service.transaction_repo') as mock_repo,
        ):
            mock_repo.get_existing_external_ids = AsyncMock(return_value=set())
            mock_repo.create = AsyncMock(side_effect=lambda db, txn: txn)
            result = await import_bank_csv_file(ctx, b'csv-content', 'data.csv', None)
        assert result.imported == 2
        assert result.skipped_duplicates == 0
        assert result.format_detected == 'chase'
        assert len(result.preview) == 2

    @pytest.mark.asyncio
    async def test_skips_duplicate_transactions(self, ctx: RequestContext) -> None:
        mock_db = MagicMock()

        @asynccontextmanager
        async def fake_uow():
            yield mock_db

        org_id, user_id = ctx.organization_id, ctx.user_id
        txns = [
            _make_txn('ext-001', org_id, user_id),
            _make_txn('ext-002', org_id, user_id),
            _make_txn('ext-003', org_id, user_id),
        ]
        with (
            patch('app.services.transactions.import_service.detect_bank_format', return_value='chase'),
            patch('app.services.transactions.import_service.parse_bank_csv', return_value=txns),
            patch('app.services.transactions.import_service.unit_of_work', fake_uow),
            patch('app.services.transactions.import_service.transaction_repo') as mock_repo,
        ):
            mock_repo.get_existing_external_ids = AsyncMock(return_value={'ext-001'})
            mock_repo.create = AsyncMock(side_effect=lambda db, txn: txn)
            result = await import_bank_csv_file(ctx, b'csv-content', 'data.csv', None)
        assert result.imported == 2
        assert result.skipped_duplicates == 1

    @pytest.mark.asyncio
    async def test_all_duplicates_returns_zero_imported(self, ctx: RequestContext) -> None:
        mock_db = MagicMock()

        @asynccontextmanager
        async def fake_uow():
            yield mock_db

        org_id, user_id = ctx.organization_id, ctx.user_id
        txns = [_make_txn('ext-001', org_id, user_id)]
        with (
            patch('app.services.transactions.import_service.detect_bank_format', return_value='chase'),
            patch('app.services.transactions.import_service.parse_bank_csv', return_value=txns),
            patch('app.services.transactions.import_service.unit_of_work', fake_uow),
            patch('app.services.transactions.import_service.transaction_repo') as mock_repo,
        ):
            mock_repo.get_existing_external_ids = AsyncMock(return_value={'ext-001'})
            result = await import_bank_csv_file(ctx, b'csv-content', 'data.csv', None)
        assert result.imported == 0
        assert result.skipped_duplicates == 1

    @pytest.mark.asyncio
    async def test_preview_capped_at_five(self, ctx: RequestContext) -> None:
        mock_db = MagicMock()

        @asynccontextmanager
        async def fake_uow():
            yield mock_db

        org_id, user_id = ctx.organization_id, ctx.user_id
        txns = [_make_txn(f'ext-{i:03d}', org_id, user_id) for i in range(10)]
        with (
            patch('app.services.transactions.import_service.detect_bank_format', return_value='chase'),
            patch('app.services.transactions.import_service.parse_bank_csv', return_value=txns),
            patch('app.services.transactions.import_service.unit_of_work', fake_uow),
            patch('app.services.transactions.import_service.transaction_repo') as mock_repo,
        ):
            mock_repo.get_existing_external_ids = AsyncMock(return_value=set())
            mock_repo.create = AsyncMock(side_effect=lambda db, txn: txn)
            result = await import_bank_csv_file(ctx, b'csv-content', 'data.csv', None)
        assert len(result.preview) <= 5
