"""Tests for tax_advisor_service — data assembly, response parsing, disclaimer."""
import json
import uuid
from contextlib import asynccontextmanager
from datetime import date, datetime, timezone
from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.organization.organization import Organization
from app.models.properties.property import Property, PropertyType
from app.models.tax.tax_form_field import TaxFormField
from app.models.tax.tax_form_instance import TaxFormInstance
from app.models.tax.tax_return import TaxReturn
from app.models.transactions.transaction import Transaction
from app.models.user.user import User
from app.schemas.tax.tax_advisor import TaxAdvisorCachedResponse, TaxAdvisorResponse, TaxSuggestion
from app.services.tax.tax_advisor_service import (
    HARDCODED_DISCLAIMER,
    _assemble_tax_data,
    _parse_and_validate,
)


def _make_property(org: Organization, user: User, **kwargs) -> Property:
    defaults = dict(
        id=uuid.uuid4(),
        organization_id=org.id,
        user_id=user.id,
        name="Test Property",
        address="123 Test St",
        type=PropertyType.SHORT_TERM,
    )
    defaults.update(kwargs)
    return Property(**defaults)


def _make_transaction(org: Organization, user: User, **kwargs) -> Transaction:
    defaults = dict(
        id=uuid.uuid4(),
        organization_id=org.id,
        user_id=user.id,
        transaction_date=date(2025, 6, 15),
        tax_year=2025,
        amount=Decimal("500.00"),
        transaction_type="expense",
        category="maintenance",
        status="approved",
        tax_relevant=True,
    )
    defaults.update(kwargs)
    return Transaction(**defaults)


def _make_tax_return(org: Organization, tax_year: int = 2025) -> TaxReturn:
    return TaxReturn(
        id=uuid.uuid4(),
        organization_id=org.id,
        tax_year=tax_year,
        filing_status="single",
        needs_recompute=False,
    )


class TestParseAndValidate:
    def test_valid_json_returns_response(self) -> None:
        raw = json.dumps({
            "suggestions": [
                {
                    "id": "rule_1_unassigned",
                    "category": "expense_allocation",
                    "severity": "high",
                    "title": "3 unassigned expenses totaling $1,500",
                    "description": "You have 3 expenses worth $1,500 that aren't assigned to any property.",
                    "estimated_savings": 360,
                    "action": "Assign these expenses to the correct property.",
                    "irs_reference": "Schedule E",
                    "confidence": "high",
                    "affected_properties": None,
                    "affected_form": "Schedule E",
                },
            ],
            "disclaimer": "Some AI disclaimer we should ignore",
        })

        result = _parse_and_validate(raw)

        assert isinstance(result, TaxAdvisorResponse)
        assert len(result.suggestions) == 1
        assert result.suggestions[0].id == "rule_1_unassigned"
        assert result.suggestions[0].severity == "high"
        assert result.suggestions[0].estimated_savings == 360

    def test_disclaimer_is_hardcoded(self) -> None:
        raw = json.dumps({
            "suggestions": [],
            "disclaimer": "Claude's own disclaimer text that should be replaced",
        })

        result = _parse_and_validate(raw)

        assert result.disclaimer == HARDCODED_DISCLAIMER
        assert result.disclaimer != "Claude's own disclaimer text that should be replaced"

    def test_invalid_json_returns_fallback(self) -> None:
        raw = "This is not valid JSON at all"

        result = _parse_and_validate(raw)

        assert isinstance(result, TaxAdvisorResponse)
        assert len(result.suggestions) == 1
        assert result.suggestions[0].category == "data_quality"
        assert result.suggestions[0].id == "parse_error"
        assert result.disclaimer == HARDCODED_DISCLAIMER

    def test_strips_markdown_fences(self) -> None:
        raw = '```json\n{"suggestions": [{"id": "test", "category": "data_quality", "severity": "low", "title": "Test", "description": "Test desc", "action": "Do something", "confidence": "high"}], "disclaimer": ""}\n```'

        result = _parse_and_validate(raw)

        assert len(result.suggestions) == 1
        assert result.suggestions[0].id == "test"

    def test_skips_invalid_suggestions(self) -> None:
        raw = json.dumps({
            "suggestions": [
                {
                    "id": "valid_one",
                    "category": "data_quality",
                    "severity": "low",
                    "title": "Valid",
                    "description": "This is valid",
                    "action": "Do something",
                    "confidence": "high",
                },
                {
                    "missing_required": True,
                },
            ],
            "disclaimer": "",
        })

        result = _parse_and_validate(raw)

        assert len(result.suggestions) == 1
        assert result.suggestions[0].id == "valid_one"

    def test_empty_suggestions_allowed(self) -> None:
        raw = json.dumps({"suggestions": [], "disclaimer": ""})

        result = _parse_and_validate(raw)

        assert len(result.suggestions) == 0
        assert result.disclaimer == HARDCODED_DISCLAIMER


class TestAssembleTaxData:
    @pytest.mark.asyncio
    async def test_produces_expected_shape(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        tax_return = _make_tax_return(test_org)
        db.add(tax_return)

        prop = _make_property(test_org, test_user)
        db.add(prop)
        await db.flush()

        unassigned_txn = _make_transaction(
            test_org, test_user,
            property_id=None,
            amount=Decimal("200.00"),
        )
        db.add(unassigned_txn)
        await db.commit()

        @asynccontextmanager
        async def _fake():
            yield db

        with (
            patch("app.services.tax.tax_advisor_service.unit_of_work", _fake),
            patch("app.services.tax.tax_validation_service.unit_of_work", _fake),
        ):
            data = await _assemble_tax_data(db, tax_return)

        assert "tax_year" in data
        assert data["tax_year"] == 2025
        assert "filing_status" in data
        assert "properties" in data
        assert "schedule_e" in data
        assert "unassigned_expenses" in data
        assert "tax_forms" in data
        assert "reservation_summary" in data
        assert "summary" in data
        assert "known_issues" in data

        assert isinstance(data["properties"], list)
        assert len(data["properties"]) == 1
        assert data["properties"][0]["name"] == "Test Property"

    @pytest.mark.asyncio
    async def test_unassigned_expenses_loaded(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        tax_return = _make_tax_return(test_org)
        db.add(tax_return)
        await db.flush()

        txn1 = _make_transaction(
            test_org, test_user,
            property_id=None,
            amount=Decimal("150.00"),
            vendor="Vendor A",
        )
        txn2 = _make_transaction(
            test_org, test_user,
            property_id=None,
            amount=Decimal("250.00"),
            vendor="Vendor B",
        )
        db.add_all([txn1, txn2])
        await db.commit()

        @asynccontextmanager
        async def _fake():
            yield db

        with (
            patch("app.services.tax.tax_advisor_service.unit_of_work", _fake),
            patch("app.services.tax.tax_validation_service.unit_of_work", _fake),
        ):
            data = await _assemble_tax_data(db, tax_return)

        assert len(data["unassigned_expenses"]) == 2
        amounts = {e["amount"] for e in data["unassigned_expenses"]}
        assert 150.0 in amounts
        assert 250.0 in amounts

    @pytest.mark.asyncio
    async def test_empty_data_returns_all_keys(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        tax_return = _make_tax_return(test_org)
        db.add(tax_return)
        await db.commit()

        @asynccontextmanager
        async def _fake():
            yield db

        with (
            patch("app.services.tax.tax_advisor_service.unit_of_work", _fake),
            patch("app.services.tax.tax_validation_service.unit_of_work", _fake),
        ):
            data = await _assemble_tax_data(db, tax_return)

        assert data["properties"] == []
        assert data["schedule_e"] == []
        assert data["unassigned_expenses"] == []
        assert data["tax_forms"] == []
        assert data["reservation_summary"] == []
        assert data["summary"]["total_rental_revenue"] == 0.0
        assert data["summary"]["w2_wages"] == 0.0

    @pytest.mark.asyncio
    async def test_summary_computes_agi(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        tax_return = _make_tax_return(test_org)
        db.add(tax_return)
        await db.flush()

        prop = _make_property(test_org, test_user)
        db.add(prop)
        await db.flush()

        # Create a Schedule E instance with fields
        se_instance = TaxFormInstance(
            id=uuid.uuid4(),
            tax_return_id=tax_return.id,
            form_name="schedule_e",
            source_type="computed",
            property_id=prop.id,
            instance_label="123 Test St",
        )
        db.add(se_instance)
        await db.flush()

        income_field = TaxFormField(
            form_instance_id=se_instance.id,
            field_id="line_3",
            field_label="Rents received",
            value_numeric=Decimal("50000.00"),
            is_calculated=True,
        )
        expense_field = TaxFormField(
            form_instance_id=se_instance.id,
            field_id="line_20",
            field_label="Total expenses",
            value_numeric=Decimal("20000.00"),
            is_calculated=True,
        )
        db.add_all([income_field, expense_field])

        # Create a W-2 form instance
        w2_instance = TaxFormInstance(
            id=uuid.uuid4(),
            tax_return_id=tax_return.id,
            form_name="w2",
            source_type="extracted",
            instance_label="Test Employer",
        )
        db.add(w2_instance)
        await db.flush()

        w2_field = TaxFormField(
            form_instance_id=w2_instance.id,
            field_id="box_1",
            field_label="Wages",
            value_numeric=Decimal("75000.00"),
            is_calculated=False,
        )
        db.add(w2_field)
        await db.commit()

        @asynccontextmanager
        async def _fake():
            yield db

        with (
            patch("app.services.tax.tax_advisor_service.unit_of_work", _fake),
            patch("app.services.tax.tax_validation_service.unit_of_work", _fake),
        ):
            data = await _assemble_tax_data(db, tax_return)

        assert data["summary"]["w2_wages"] == 75000.0
        assert data["summary"]["total_rental_revenue"] == 50000.0
        assert data["summary"]["total_rental_expenses"] == 20000.0
        assert data["summary"]["net_rental_income"] == 30000.0
        # AGI = W2 wages + rental revenue - rental expenses
        assert data["summary"]["agi_estimate"] == 105000.0


class TestGenerateAdviceIntegration:
    @pytest.mark.asyncio
    async def test_full_flow_with_mocked_claude(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        tax_return = _make_tax_return(test_org)
        db.add(tax_return)
        await db.commit()

        mock_response = MagicMock()
        mock_response.content = [MagicMock()]
        mock_response.content[0].text = json.dumps({
            "suggestions": [
                {
                    "id": "rule_empty_data",
                    "category": "data_quality",
                    "severity": "medium",
                    "title": "No properties or transactions found",
                    "description": "Your tax return has no properties or transactions. Add data to get meaningful advice.",
                    "action": "Upload documents or add properties.",
                    "confidence": "high",
                },
            ],
            "disclaimer": "AI disclaimer",
        })
        mock_response.usage = MagicMock()
        mock_response.usage.input_tokens = 1000
        mock_response.usage.output_tokens = 500

        from app.services.tax import tax_advisor_service

        @asynccontextmanager
        async def _fake():
            yield db

        with (
            patch("app.services.tax.tax_advisor_service.unit_of_work", _fake),
            patch("app.services.tax.tax_advisor_service.AsyncSessionLocal", _fake),
            patch("app.services.tax.tax_validation_service.unit_of_work", _fake),
            patch.object(
                tax_advisor_service, "_create_with_backoff",
                new_callable=AsyncMock, return_value=mock_response,
            ),
        ):
            result = await tax_advisor_service.generate_advice(
                test_org.id, tax_return.id, test_user.id,
            )

        assert isinstance(result, TaxAdvisorCachedResponse)
        assert result.disclaimer == HARDCODED_DISCLAIMER
        assert len(result.suggestions) == 1
        assert result.suggestions[0].category == "data_quality"
        assert result.model_version == "claude-sonnet-4-6"
        assert result.generated_at is not None
