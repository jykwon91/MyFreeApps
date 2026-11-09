import uuid
from decimal import Decimal

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.organization.organization import Organization
from app.models.tax.tax_form_field import TaxFormField
from app.models.tax.tax_form_field_source import TaxFormFieldSource
from app.models.tax.tax_form_instance import TaxFormInstance
from app.models.tax.tax_return import TaxReturn
from app.models.user.user import User
from app.repositories import tax_form_repo, tax_return_repo


async def _create_return(
    db: AsyncSession, org_id: uuid.UUID, tax_year: int = 2025
) -> TaxReturn:
    return await tax_return_repo.get_or_create_for_year(db, org_id, tax_year)


async def _create_instance(
    db: AsyncSession,
    tax_return_id: uuid.UUID,
    form_name: str = "w2",
    source_type: str = "extracted",
) -> TaxFormInstance:
    instance = TaxFormInstance(
        tax_return_id=tax_return_id,
        form_name=form_name,
        source_type=source_type,
        instance_label="Test Instance",
    )
    return await tax_form_repo.create_instance(db, instance)


class TestCreateInstance:
    @pytest.mark.asyncio
    async def test_creates_and_returns(
        self, db: AsyncSession, test_user: User, test_org: Organization
    ) -> None:
        tr = await _create_return(db, test_org.id)
        instance = await _create_instance(db, tr.id)
        assert instance.id is not None
        assert instance.form_name == "w2"
        assert instance.source_type == "extracted"
        assert instance.status == "draft"


class TestListInstances:
    @pytest.mark.asyncio
    async def test_lists_instances_for_return(
        self, db: AsyncSession, test_user: User, test_org: Organization
    ) -> None:
        tr = await _create_return(db, test_org.id)
        await _create_instance(db, tr.id, form_name="w2")
        await _create_instance(db, tr.id, form_name="1099_int")
        await db.commit()

        results = await tax_form_repo.list_instances(db, tr.id)
        form_names = [r.form_name for r in results]
        assert "w2" in form_names
        assert "1099_int" in form_names

    @pytest.mark.asyncio
    async def test_empty_for_other_return(
        self, db: AsyncSession, test_user: User, test_org: Organization
    ) -> None:
        tr = await _create_return(db, test_org.id)
        await _create_instance(db, tr.id)
        await db.commit()

        results = await tax_form_repo.list_instances(db, uuid.uuid4())
        assert len(results) == 0


class TestGetInstance:
    @pytest.mark.asyncio
    async def test_returns_instance(
        self, db: AsyncSession, test_user: User, test_org: Organization
    ) -> None:
        tr = await _create_return(db, test_org.id)
        instance = await _create_instance(db, tr.id)
        await db.commit()

        found = await tax_form_repo.get_instance(db, instance.id)
        assert found is not None
        assert found.id == instance.id

    @pytest.mark.asyncio
    async def test_returns_none_for_missing(
        self, db: AsyncSession, test_user: User, test_org: Organization
    ) -> None:
        found = await tax_form_repo.get_instance(db, uuid.uuid4())
        assert found is None


class TestCreateField:
    @pytest.mark.asyncio
    async def test_creates_numeric_field(
        self, db: AsyncSession, test_user: User, test_org: Organization
    ) -> None:
        tr = await _create_return(db, test_org.id)
        instance = await _create_instance(db, tr.id)
        field = TaxFormField(
            form_instance_id=instance.id,
            field_id="box_1",
            field_label="Wages",
            value_numeric=Decimal("75000.00"),
        )
        result = await tax_form_repo.create_field(db, field)
        assert result.id is not None
        assert result.value_numeric == Decimal("75000.00")
        assert result.validation_status == "unvalidated"

    @pytest.mark.asyncio
    async def test_creates_text_field(
        self, db: AsyncSession, test_user: User, test_org: Organization
    ) -> None:
        tr = await _create_return(db, test_org.id)
        instance = await _create_instance(db, tr.id)
        field = TaxFormField(
            form_instance_id=instance.id,
            field_id="box_15_state",
            field_label="State",
            value_text="TX",
        )
        result = await tax_form_repo.create_field(db, field)
        assert result.value_text == "TX"


class TestGetFields:
    @pytest.mark.asyncio
    async def test_returns_fields_ordered_by_id(
        self, db: AsyncSession, test_user: User, test_org: Organization
    ) -> None:
        tr = await _create_return(db, test_org.id)
        instance = await _create_instance(db, tr.id)
        for fid, val in [("box_2", Decimal("12500")), ("box_1", Decimal("75000"))]:
            await tax_form_repo.create_field(
                db,
                TaxFormField(
                    form_instance_id=instance.id,
                    field_id=fid,
                    field_label=fid,
                    value_numeric=val,
                ),
            )
        await db.commit()

        fields = await tax_form_repo.get_fields(db, instance.id)
        ids = [f.field_id for f in fields]
        assert ids == ["box_1", "box_2"]


class TestApplyOverride:
    async def _field(self, db: AsyncSession, test_org: Organization) -> TaxFormField:
        tr = await _create_return(db, test_org.id)
        instance = await _create_instance(db, tr.id)
        return await tax_form_repo.create_field(
            db,
            TaxFormField(
                form_instance_id=instance.id,
                field_id="box_1",
                field_label="Wages",
                value_numeric=Decimal("75000.00"),
                value_text="stale",
            ),
        )

    @pytest.mark.asyncio
    async def test_sets_one_column_nulls_others_and_records_who(
        self, db: AsyncSession, test_user: User, test_org: Organization
    ) -> None:
        field = await self._field(db, test_org)
        updated = await tax_form_repo.apply_override(
            db, field, column="value_numeric", value=Decimal("80000.00"),
            reason="Corrected", user_id=test_user.id,
        )
        assert updated.value_numeric == Decimal("80000.00")
        assert updated.value_text is None
        assert updated.is_overridden is True
        assert updated.override_reason == "Corrected"
        assert updated.overridden_by == test_user.id
        assert updated.overridden_at is not None

    @pytest.mark.asyncio
    async def test_no_column_clears_every_value(
        self, db: AsyncSession, test_user: User, test_org: Organization
    ) -> None:
        field = await self._field(db, test_org)
        updated = await tax_form_repo.apply_override(
            db, field, column=None, value=None, reason="Cleared", user_id=test_user.id,
        )
        assert (updated.value_numeric, updated.value_text, updated.value_boolean) == (None, None, None)
        assert updated.is_overridden is True

    @pytest.mark.asyncio
    async def test_rejects_unknown_column(
        self, db: AsyncSession, test_user: User, test_org: Organization
    ) -> None:
        field = await self._field(db, test_org)
        with pytest.raises(ValueError):
            await tax_form_repo.apply_override(
                db, field, column="field_id", value="x", reason="r", user_id=test_user.id,
            )


class TestCreateFieldSource:
    @pytest.mark.asyncio
    async def test_creates_source(
        self, db: AsyncSession, test_user: User, test_org: Organization
    ) -> None:
        tr = await _create_return(db, test_org.id)
        instance = await _create_instance(db, tr.id)
        field = await tax_form_repo.create_field(
            db,
            TaxFormField(
                form_instance_id=instance.id,
                field_id="box_1",
                field_label="Wages",
                value_numeric=Decimal("75000.00"),
            ),
        )
        source = TaxFormFieldSource(
            field_id=field.id,
            source_type="tax_form_instance",
            source_id=uuid.uuid4(),
            amount=Decimal("75000.00"),
            description="Extracted from W-2",
        )
        result = await tax_form_repo.create_field_source(db, source)
        assert result.id is not None
        assert result.source_type == "tax_form_instance"
        assert result.amount == Decimal("75000.00")


class TestGetFieldById:
    @pytest.mark.asyncio
    async def test_returns_field(
        self, db: AsyncSession, test_user: User, test_org: Organization
    ) -> None:
        tr = await _create_return(db, test_org.id)
        instance = await _create_instance(db, tr.id)
        field = await tax_form_repo.create_field(
            db,
            TaxFormField(
                form_instance_id=instance.id,
                field_id="box_1",
                field_label="Wages",
                value_numeric=Decimal("75000.00"),
            ),
        )
        await db.commit()

        found = await tax_form_repo.get_field_by_id(db, field.id)
        assert found is not None
        assert found.field_id == "box_1"

    @pytest.mark.asyncio
    async def test_returns_none_for_missing(
        self, db: AsyncSession, test_user: User, test_org: Organization
    ) -> None:
        found = await tax_form_repo.get_field_by_id(db, uuid.uuid4())
        assert found is None
