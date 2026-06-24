"""Tests for get_extraction_prompt — SQLAlchemy error handling and fallback behavior."""
import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from sqlalchemy.exc import OperationalError

from app.services.extraction.claude_service import get_extraction_prompt
from app.services.extraction.prompts.base_prompt import DEFAULT_PROMPT


class TestGetExtractionPromptSuccess:
    @pytest.mark.asyncio
    async def test_returns_base_prompt_when_no_user_id(self) -> None:
        prompt, err = await get_extraction_prompt()
        assert prompt == DEFAULT_PROMPT
        assert err is None

    @pytest.mark.asyncio
    async def test_returns_prompt_with_user_rules_appended(self) -> None:
        user_id = uuid.uuid4()
        fake_rules = MagicMock()
        fake_rules.prompt_text = "Always flag utilities as deductible."

        with patch("app.services.extraction.claude_service.AsyncSessionLocal") as mock_session_cls, \
             patch("app.services.extraction.claude_service.extraction_prompt_repo") as mock_repo:
            mock_db = AsyncMock()
            mock_session_cls.return_value.__aenter__ = AsyncMock(return_value=mock_db)
            mock_session_cls.return_value.__aexit__ = AsyncMock(return_value=False)
            mock_repo.get_active_for_user = AsyncMock(return_value=fake_rules)

            prompt, err = await get_extraction_prompt(user_id=user_id)

        assert "# User-specific rules" in prompt
        assert "Always flag utilities as deductible." in prompt
        assert err is None

    @pytest.mark.asyncio
    async def test_returns_base_prompt_when_user_has_no_rules(self) -> None:
        user_id = uuid.uuid4()

        with patch("app.services.extraction.claude_service.AsyncSessionLocal") as mock_session_cls, \
             patch("app.services.extraction.claude_service.extraction_prompt_repo") as mock_repo:
            mock_db = AsyncMock()
            mock_session_cls.return_value.__aenter__ = AsyncMock(return_value=mock_db)
            mock_session_cls.return_value.__aexit__ = AsyncMock(return_value=False)
            mock_repo.get_active_for_user = AsyncMock(return_value=None)

            prompt, err = await get_extraction_prompt(user_id=user_id)

        assert prompt == DEFAULT_PROMPT
        assert err is None


class TestGetExtractionPromptDbError:
    @pytest.mark.asyncio
    async def test_sqlalchemy_error_returns_base_prompt_and_error_tag(self) -> None:
        user_id = uuid.uuid4()
        db_error = OperationalError("connection refused", None, None)

        with patch("app.services.extraction.claude_service.AsyncSessionLocal") as mock_session_cls, \
             patch("app.services.extraction.claude_service.extraction_prompt_repo") as mock_repo:
            mock_db = AsyncMock()
            mock_session_cls.return_value.__aenter__ = AsyncMock(return_value=mock_db)
            mock_session_cls.return_value.__aexit__ = AsyncMock(return_value=False)
            mock_repo.get_active_for_user = AsyncMock(side_effect=db_error)

            prompt, err = await get_extraction_prompt(user_id=user_id)

        assert prompt == DEFAULT_PROMPT
        assert err == "user_rules_db_error"

    @pytest.mark.asyncio
    async def test_sqlalchemy_error_emits_warning_log(self, caplog) -> None:
        user_id = uuid.uuid4()
        db_error = OperationalError("disk I/O error", None, None)

        with patch("app.services.extraction.claude_service.AsyncSessionLocal") as mock_session_cls, \
             patch("app.services.extraction.claude_service.extraction_prompt_repo") as mock_repo:
            mock_db = AsyncMock()
            mock_session_cls.return_value.__aenter__ = AsyncMock(return_value=mock_db)
            mock_session_cls.return_value.__aexit__ = AsyncMock(return_value=False)
            mock_repo.get_active_for_user = AsyncMock(side_effect=db_error)

            import logging
            with caplog.at_level(logging.WARNING, logger="app.services.extraction.claude_service"):
                await get_extraction_prompt(user_id=user_id)

        assert any("user_rules_db_error" in r.message or "failed to load user rules" in r.message for r in caplog.records)

    @pytest.mark.asyncio
    async def test_non_sqlalchemy_exception_propagates(self) -> None:
        user_id = uuid.uuid4()

        with patch("app.services.extraction.claude_service.AsyncSessionLocal") as mock_session_cls, \
             patch("app.services.extraction.claude_service.extraction_prompt_repo") as mock_repo:
            mock_db = AsyncMock()
            mock_session_cls.return_value.__aenter__ = AsyncMock(return_value=mock_db)
            mock_session_cls.return_value.__aexit__ = AsyncMock(return_value=False)
            mock_repo.get_active_for_user = AsyncMock(side_effect=RuntimeError("unexpected bug"))

            with pytest.raises(RuntimeError, match="unexpected bug"):
                await get_extraction_prompt(user_id=user_id)


class TestBillReadyWithAmountInstruction:
    """Regression: the prompt must tell Claude that a bill-ready / Auto Pay
    notification carrying an amount due is an INVOICE (utilities expense), not
    a payment_confirmation. Without this, Constellation/CenterPoint/AT&T bills
    were tagged payment_confirmation with amount=null and silently dropped."""

    def test_bill_ready_with_amount_is_invoice_not_confirmation(self) -> None:
        # The CRITICAL EXCEPTION block must instruct invoice + utilities.
        assert "bill-ready / billing notifications that DO show an amount" in DEFAULT_PROMPT
        assert "are NOT \"payment_confirmation\"" in DEFAULT_PROMPT

    def test_auto_pay_framing_does_not_force_confirmation(self) -> None:
        assert "\"Auto Pay\" / \"bill is ready\"" in DEFAULT_PROMPT

    def test_known_utility_vendors_listed(self) -> None:
        for vendor in ("Constellation", "CenterPoint", "City of Houston Water", "AT&T"):
            assert vendor in DEFAULT_PROMPT
