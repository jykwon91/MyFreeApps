"""Tests for tax completeness analysis service."""
import uuid
from contextlib import asynccontextmanager
from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.core.tax_constants import SCHEDULE_E_AGGREGATE_LABEL, SCHEDULE_E_LINE_LABELS
from app.schemas.tax.tax_completeness import FormCompleteness
from app.services.tax.tax_completeness_service import (
    _generate_highlights,
    _generate_summary,
    _has_amount,
    _has_value,
    _real_label,
    get_tax_completeness,
)


def _field(numeric=None, text=None, boolean=None):
    """Build a minimal mock TaxFormField."""
    f = MagicMock()
    f.value_numeric = numeric
    f.value_text = text
    f.value_boolean = boolean
    return f


def _named_field(field_id: str, numeric=None):
    f = _field(numeric=numeric)
    f.field_id = field_id
    return f


class TestHasValue:
    def test_non_zero_decimal_returns_true(self) -> None:
        assert _has_value(_field(numeric=Decimal('150.00'))) is True

    def test_zero_is_a_value_because_recompute_writes_it_on_purpose(self) -> None:
        assert _has_value(_field(numeric=Decimal('0'))) is True

    def test_zero_is_not_an_amount_worth_calling_found(self) -> None:
        assert _has_amount(_field(numeric=Decimal('0'))) is False
        assert _has_amount(_field(numeric=Decimal('150.00'))) is True
        assert _has_amount(_field(text='John Doe')) is True
        assert _has_amount(_field()) is False

    @pytest.mark.parametrize('stored', ['0', '0.0', ' 0.00 '])
    def test_a_zero_stored_as_text_by_extraction_is_not_an_amount(self, stored: str) -> None:
        assert _has_amount(_field(text=stored)) is False
        assert _has_value(_field(text=stored)) is True

    def test_real_text_values_are_amounts(self) -> None:
        assert _has_amount(_field(text='1200.50')) is True
        assert _has_amount(_field(text='DD')) is True

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


class TestRealLabel:
    @pytest.mark.parametrize('form_name, label', [('w2', 'W2'), ('1098', '1098'), ('1099_k', '1099_K'), ('w2', None), ('w2', '')])
    def test_a_label_that_is_just_the_form_type_names_nothing(self, form_name: str, label: str | None) -> None:
        assert _real_label(form_name, label) is None

    def test_an_issuer_stays(self) -> None:
        assert _real_label('w2', 'Acme Corp') == 'Acme Corp'


class TestGenerateHighlightsScheduleE:
    def _call(self, filled, missing, label=None):
        return _generate_highlights('schedule_e', label, set(filled), set(missing))

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

    def test_no_label_never_shows_the_raw_form_name(self) -> None:
        highlights = self._call(filled=['line_3'], missing=['line_12'])
        assert highlights
        assert not any('schedule_e' in h for h in highlights)


class TestGenerateHighlightsOtherForms:
    @pytest.mark.parametrize('form_name', ['w2', '1098', '1099_k', 'schedule_c', 'schedule_e', 'k1'])
    def test_never_shows_a_raw_form_name_or_claims_completeness(self, form_name: str) -> None:
        ids = {'box_1', 'line_1', 'line_3'}
        for highlights in (
            _generate_highlights(form_name, None, ids, set()),
            _generate_highlights(form_name, None, set(), {'box_12a', 'box_12b', 'line_30', 'line_12'}),
        ):
            for highlight in highlights:
                assert form_name not in highlight
                assert 'complete' not in highlight.lower()

    def test_a_1099_with_nothing_to_flag_has_no_highlights(self) -> None:
        assert _generate_highlights('1099_k', None, {'box_1a'}, set()) == []


class TestGenerateSummary:
    def _form(self, form_name: str) -> FormCompleteness:
        return FormCompleteness(
            form_name=form_name, instance_label=None, filled_fields=[], missing_fields=[],
            total_expected=10, total_filled=1, highlights=[],
        )

    def test_says_what_is_on_file_without_a_percentage(self) -> None:
        summary = _generate_summary([
            self._form('schedule_e'), self._form('schedule_e'), self._form('w2'), self._form('1099_k'),
        ])
        assert '2 rental properties' in summary
        assert '1 W-2 on file' in summary
        assert '1 other tax form on file' in summary
        assert '%' not in summary
        assert 'complete' not in summary.lower()

    def test_no_forms(self) -> None:
        assert "don't have any tax forms" in _generate_summary([])


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
        tax_return.needs_recompute = True

        form_instance = MagicMock()
        form_instance.form_name = 'schedule_e'
        form_instance.property_id = uuid.uuid4()
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
        assert result.tax_return_id == tax_return.id
        assert result.needs_recompute is True
        assert len(result.forms) == 1
        assert result.forms[0].form_name == 'schedule_e'
        assert isinstance(result.summary, str)
        assert len(result.summary) > 0

    @pytest.mark.asyncio
    async def test_property_forms_are_judged_without_the_all_properties_total(self) -> None:
        tax_return = MagicMock()
        tax_return.id = uuid.uuid4()
        tax_return.needs_recompute = False

        aggregate = MagicMock()
        aggregate.form_name = 'schedule_e'
        aggregate.property_id = None
        aggregate.instance_label = SCHEDULE_E_AGGREGATE_LABEL
        aggregate.fields = [_named_field('line_26', numeric=Decimal('500'))]

        rents = _named_field('line_3', numeric=Decimal('0'))
        interest = _named_field('line_12', numeric=Decimal('900'))
        prop = MagicMock()
        prop.form_name = 'schedule_e'
        prop.property_id = uuid.uuid4()
        prop.instance_label = '123 Main St'
        prop.fields = [rents, interest]

        @asynccontextmanager
        async def fake_session():
            yield MagicMock()

        with (
            patch('app.services.tax.tax_completeness_service.AsyncSessionLocal', fake_session),
            patch('app.services.tax.tax_completeness_service.tax_return_repo') as mock_repo,
        ):
            mock_repo.get_by_org_year = AsyncMock(return_value=tax_return)
            mock_repo.get_all_form_instances = AsyncMock(return_value=[aggregate, prop])
            result = await get_tax_completeness(uuid.uuid4(), 2025)

        assert result is not None
        assert [form.instance_label for form in result.forms] == ['123 Main St']
        form = result.forms[0]
        assert 'line_26' not in form.missing_fields
        assert form.total_expected == len(SCHEDULE_E_LINE_LABELS) - 1
        # A stored $0 isn't missing, but it isn't income found either.
        assert 'line_3' in form.filled_fields
        assert not any('Rental income found' in h for h in form.highlights)
        assert not any('mortgage interest' in h.lower() for h in form.highlights)
        assert '1 rental property' in result.summary

    @pytest.mark.asyncio
    async def test_an_uploaded_w2_with_no_issuer_and_zero_wages(self) -> None:
        tax_return = MagicMock()
        tax_return.id = uuid.uuid4()
        tax_return.needs_recompute = False

        wages = _named_field('box_1')
        wages.value_text = '0'
        w2 = MagicMock()
        w2.form_name = 'w2'
        w2.property_id = None
        w2.instance_label = 'W2'
        w2.fields = [wages]

        @asynccontextmanager
        async def fake_session():
            yield MagicMock()

        with (
            patch('app.services.tax.tax_completeness_service.AsyncSessionLocal', fake_session),
            patch('app.services.tax.tax_completeness_service.tax_return_repo') as mock_repo,
        ):
            mock_repo.get_by_org_year = AsyncMock(return_value=tax_return)
            mock_repo.get_all_form_instances = AsyncMock(return_value=[w2])
            result = await get_tax_completeness(uuid.uuid4(), 2025)

        assert result is not None
        form = result.forms[0]
        assert form.instance_label is None
        assert 'box_1' in form.filled_fields
        assert not any('Wages reported' in h for h in form.highlights)
