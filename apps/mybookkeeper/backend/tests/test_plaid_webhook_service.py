"""Tests for Plaid webhook business logic service."""
from contextlib import asynccontextmanager
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services.integrations.plaid_webhook_service import handle_plaid_webhook


@pytest.fixture(autouse=True)
def _patch_deps():
    mock_db = MagicMock()

    @asynccontextmanager
    async def fake_uow():
        yield mock_db

    with (
        patch('app.services.integrations.plaid_webhook_service.unit_of_work', fake_uow),
        patch('app.services.integrations.plaid_webhook_service.plaid_repo') as mock_repo,
        patch('app.services.integrations.plaid_webhook_service.sync_plaid_item') as mock_sync,
    ):
        yield mock_repo, mock_sync


class TestHandlePlaidWebhookTransactionSync:
    @pytest.mark.asyncio
    async def test_sync_updates_available_triggers_sync(self, _patch_deps) -> None:
        mock_repo, mock_sync = _patch_deps
        fake_item = MagicMock()
        mock_repo.get_item_by_plaid_id = AsyncMock(return_value=fake_item)
        mock_sync.return_value = 3
        await handle_plaid_webhook({
            'webhook_type': 'TRANSACTIONS',
            'webhook_code': 'SYNC_UPDATES_AVAILABLE',
            'item_id': 'plaid-item-abc',
        })
        mock_repo.get_item_by_plaid_id.assert_called_once()
        mock_sync.assert_called_once()

    @pytest.mark.asyncio
    async def test_default_update_triggers_sync(self, _patch_deps) -> None:
        mock_repo, mock_sync = _patch_deps
        fake_item = MagicMock()
        mock_repo.get_item_by_plaid_id = AsyncMock(return_value=fake_item)
        await handle_plaid_webhook({
            'webhook_type': 'TRANSACTIONS',
            'webhook_code': 'DEFAULT_UPDATE',
            'item_id': 'plaid-item-abc',
        })
        mock_sync.assert_called_once()

    @pytest.mark.asyncio
    async def test_initial_update_triggers_sync(self, _patch_deps) -> None:
        mock_repo, mock_sync = _patch_deps
        fake_item = MagicMock()
        mock_repo.get_item_by_plaid_id = AsyncMock(return_value=fake_item)
        await handle_plaid_webhook({
            'webhook_type': 'TRANSACTIONS',
            'webhook_code': 'INITIAL_UPDATE',
            'item_id': 'plaid-item-abc',
        })
        mock_sync.assert_called_once()


class TestHandlePlaidWebhookItemError:
    @pytest.mark.asyncio
    async def test_item_error_marks_item_as_errored(self, _patch_deps) -> None:
        mock_repo, mock_sync = _patch_deps
        fake_item = MagicMock()
        mock_repo.get_item_by_plaid_id = AsyncMock(return_value=fake_item)
        mock_repo.update_status = AsyncMock()
        await handle_plaid_webhook({
            'webhook_type': 'ITEM',
            'webhook_code': 'ERROR',
            'item_id': 'plaid-item-abc',
            'error': {'error_code': 'ITEM_LOGIN_REQUIRED'},
        })
        mock_repo.update_status.assert_called_once()
        call_args = mock_repo.update_status.call_args[0]
        assert call_args[2] == 'error'
        assert call_args[3] == 'ITEM_LOGIN_REQUIRED'

    @pytest.mark.asyncio
    async def test_item_error_without_error_code_defaults_to_unknown(self, _patch_deps) -> None:
        mock_repo, mock_sync = _patch_deps
        fake_item = MagicMock()
        mock_repo.get_item_by_plaid_id = AsyncMock(return_value=fake_item)
        mock_repo.update_status = AsyncMock()
        await handle_plaid_webhook({
            'webhook_type': 'ITEM',
            'webhook_code': 'ERROR',
            'item_id': 'plaid-item-abc',
            'error': {},
        })
        call_args = mock_repo.update_status.call_args[0]
        assert call_args[3] == 'UNKNOWN'


class TestHandlePlaidWebhookUnknownItemId:
    @pytest.mark.asyncio
    async def test_unknown_item_id_does_not_raise(self, _patch_deps) -> None:
        """Unknown item_id is handled gracefully with no exception."""
        mock_repo, mock_sync = _patch_deps
        mock_repo.get_item_by_plaid_id = AsyncMock(return_value=None)
        await handle_plaid_webhook({
            'webhook_type': 'TRANSACTIONS',
            'webhook_code': 'SYNC_UPDATES_AVAILABLE',
            'item_id': 'nonexistent-item',
        })
        mock_sync.assert_not_called()

    @pytest.mark.asyncio
    async def test_unrecognized_webhook_type_does_not_raise(self, _patch_deps) -> None:
        """Unrecognized webhook type is silently ignored."""
        mock_repo, mock_sync = _patch_deps
        mock_repo.get_item_by_plaid_id = AsyncMock(return_value=None)
        await handle_plaid_webhook({
            'webhook_type': 'AUTH',
            'webhook_code': 'AUTOMATICALLY_VERIFIED',
            'item_id': 'plaid-item-abc',
        })
        mock_repo.get_item_by_plaid_id.assert_not_called()
        mock_sync.assert_not_called()
