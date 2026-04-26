"""Tests for tax completeness analysis service."""
import uuid
from contextlib import asynccontextmanager
from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services.tax.tax_completeness_service import (
    _has_value,
    _generate_highlights,
    get_tax_completeness,
)


def _field(numeric=None, text=None, boolean=None):
    """Build a minimal mock TaxFormField."""
    f = MagicMock()
    f.value_numeric = numeric
    f.value_text = text
    f.value_boolean = boolean
    return f


class TestHasValue:
    def test_non_zero_decimal_returns_true(self) -> None:
        assert _has_value(_field(numeric=Decimal('150.00'))) is True

    def test_zero_decimal_without_text_or_bool_returns_false(self) -> None:
        assert _has_value(_field(numeric=Decimal('0'))) is False

    def test_none_numeric_and_none_text_and_none_bool_returns_false(self) -> None:
        assert _has_value(_field()) is False

    def test_non_empty_text_returns_true(self) -> None:
        assert _has_value(_field(text='John Doe')) is True

    def test_whitespace_only_text_returns_false(self) -> None:
        assert _has_value(_field(text='   ')) is False

    def test_empty_string_text_returns_false(self) -> None:
        assert _has_value(_field(text='')) is False

    def test_boolean_true_returns_true(self) -> None:
        assert _has_value(_field(boolean=True)) is True

    def test_boolean_false_returns_true(self) -> None:
        """False is still a concrete value — returns True."""
        assert _has_value(_field(boolean=False)) is True


class TestGenerateHighlightsScheduleE:
    def _call(self, filled, missing, label=None):
        expected = {
            'line_3': 'Rents received',
            'line_9': 'Insurance',
            'line_12': 'Mortgage interest',
            'line_18': 'Depreciation',
        }
        return _generate_highlights('schedule_e', label, set(filled), set(missing), expected)

    def test_rental_income_present_generates_income_highlight(self) -> None:
        highlights = self._call(filled=['line_3'], missing=[], label='123 Main St')
        assert any('Rental income found' in h for h in highlights)

    def test_missing_mortgage_generates_mortgage_highlight(self) -> None:
        highlights = self._call(filled=[], missing=['line_12'], label='123 Main St')
        assert any('mortgage interest' in h.lower() for h in highlights)

    def test_missing_insurance_generates_insurance_highlight(self) -> None:
        highlights = self._call(filled=[], missing=['line_9'], label='123 Main St')
        assert any('insurance' in h.lower() for h in highlights)

    def test_missing_depreciation_generates_depreciation_highlight(self) -> None:
        highlights = self._call(filled=[], missing=['line_18'], label='123 Main St')
        assert any('depreciation' in h.lower() for h in highlights)

    def test_all_present_falls_back_to_generic_highlight(self) -> None:
        all_ids = ['line_3', 'line_9', 'line_12', 'line_18']
        highlights = self._call(filled=all_ids, missing=[])
        assert len(highlights) >= 1


class TestGenerateHighlightsFallback:
    def test_empty_form_generates_low_fill_message(self) -> None:
        expected = {f'field_{i}': f'Label {i}' for i in range(10)}
        highlights = _generate_highlights('w2', None, set(), set(expected.keys()), expected)
        assert any('needs attention' in h for h in highlights)

    def test_mostly_filled_form_generates_complete_message(self) -> None:
        expected = {f'field_{i}': f'Label {i}' for i in range(10)}
        filled = set(list(expected.keys())[:9])
        missing = set(list(expected.keys())[9:])
        highlights = _generate_highlights('w2', None, filled, missing, expected)
        assert len(highlights) >= 1


class TestGetTaxCompletenessNoReturn:
    @pytest.mark.asyncio
    async def test_returns_none_when_no_tax_return_exists(self) -> None:
        """Returns None when no tax return exists for the given year."""
        org_id = uuid.uuid4()

        @asynccontextmanager
        async def fake_session():
            yield MagicMock()

        with (
            patch('app.services.tax.tax_completeness_service.AsyncSessionLocal', fake_session),
            patch('app.services.tax.tax_completeness_service.tax_return_repo') as mock_repo,
        ):
            mock_repo.get_by_org_year = AsyncMock(return_value=None)
            result = await get_tax_completeness(org_id, 2025)

        assert result is None

    @pytest.mark.asyncio
    async def test_returns_response_when_tax_return_exists(self) -> None:
        """Returns a TaxCompletenessResponse when a tax return exists."""
        org_id = uuid.uuid4()
        tax_return = MagicMock()
        tax_return.id = uuid.uuid4()

        form_instance = MagicMock()
        form_instance.form_name = 'schedule_e'
        form_instance.instance_label = '123 Main St'
        form_instance.fields = []

        @asynccontextmanager
        async def fake_session():
            yield MagicMock()

        with (
            patch('app.services.tax.tax_completeness_service.AsyncSessionLocal', fake_session),
            patch('app.services.tax.tax_completeness_service.tax_return_repo') as mock_repo,
        ):
            mock_repo.get_by_org_year = AsyncMock(return_value=tax_return)
            mock_repo.get_all_form_instances = AsyncMock(return_value=[form_instance])
            result = await get_tax_completeness(org_id, 2025)

        assert result is not None
        assert result.tax_year == 2025
        assert len(result.forms) == 1
        assert result.forms[0].form_name == 'schedule_e'
        assert isinstance(result.summary, str)
        assert len(result.summary) > 0
