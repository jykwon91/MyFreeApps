"""Tax validation package — runs cross-document validation rules after recompute.

`validate` only reads. The write paths that change a return's figures (recompute,
a field override, deleting a form) store each field's status via
`validate_and_store` or `store_field_statuses`.

Splits rules by IRS form/topic for maintainability. Each module exports a
`run_rules(db, tax_return, form_fields, all_instances)` function.
"""
import logging
import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import AsyncSessionLocal, unit_of_work
from app.models.tax.tax_form_instance import TaxFormInstance
from app.models.tax.tax_return import TaxReturn
from app.repositories import tax_return_repo

from ._types import ValidationResult, index_fields
from . import (
    deduction_rules,
    depreciation_rules,
    general_rules,
    income_rules,
    investment_rules,
    rental_rules,
    se_rules,
)

logger = logging.getLogger(__name__)


async def validate(
    organization_id: uuid.UUID, tax_return_id: uuid.UUID,
) -> list[ValidationResult]:
    """Run all validation rules and return the results. Writes nothing."""
    async with AsyncSessionLocal() as db:
        tax_return = await _get_return(db, organization_id, tax_return_id)
        all_instances = list(await tax_return_repo.get_all_form_instances(db, tax_return.id))
        return await _run_rules(db, tax_return, all_instances)


async def validate_and_store(
    organization_id: uuid.UUID, tax_return_id: uuid.UUID,
) -> list[ValidationResult]:
    """Run all validation rules in a transaction of its own and store each field's status."""
    async with unit_of_work() as db:
        tax_return = await _get_return(db, organization_id, tax_return_id)
        return await store_field_statuses(db, tax_return)


async def store_field_statuses(
    db: AsyncSession, tax_return: TaxReturn,
) -> list[ValidationResult]:
    """Run all validation rules and store each field's status in the caller's transaction."""
    all_instances = list(await tax_return_repo.get_all_form_instances(db, tax_return.id))
    results = await _run_rules(db, tax_return, all_instances)
    await _update_field_statuses(db, all_instances, results)
    return results


async def _get_return(
    db: AsyncSession, organization_id: uuid.UUID, tax_return_id: uuid.UUID,
) -> TaxReturn:
    tax_return = await tax_return_repo.get_by_id(db, tax_return_id, organization_id)
    if not tax_return:
        raise LookupError("Tax return not found")
    return tax_return


async def _run_rules(
    db: AsyncSession,
    tax_return: TaxReturn,
    all_instances: list[TaxFormInstance],
) -> list[ValidationResult]:
    form_fields = index_fields(all_instances)
    results: list[ValidationResult] = []
    results.extend(await income_rules.run_rules(db, tax_return, form_fields, all_instances))
    results.extend(await rental_rules.run_rules(db, tax_return, form_fields, all_instances))
    results.extend(await depreciation_rules.run_rules(db, tax_return, form_fields, all_instances))
    results.extend(await se_rules.run_rules(db, tax_return, form_fields, all_instances))
    results.extend(await deduction_rules.run_rules(db, tax_return, form_fields, all_instances))
    results.extend(await investment_rules.run_rules(db, tax_return, form_fields, all_instances))
    results.extend(await general_rules.run_rules(db, tax_return, form_fields, all_instances))
    return results


async def _update_field_statuses(
    db: AsyncSession,
    instances: list[TaxFormInstance],
    results: list[ValidationResult],
) -> None:
    """Update validation_status and validation_message on affected fields."""
    field_issues: dict[tuple[str, str | None], ValidationResult] = {}
    for r in results:
        if r.field_id and r.severity in ("error", "warning"):
            key = (r.form_name, r.field_id)
            existing = field_issues.get(key)
            if existing is None or (r.severity == "error" and existing.severity != "error"):
                field_issues[key] = r

    for inst in instances:
        for f in inst.fields:
            key = (inst.form_name, f.field_id)
            issue = field_issues.get(key)
            if issue:
                f.validation_status = issue.severity
                f.validation_message = issue.message
            else:
                f.validation_status = "valid"
                f.validation_message = None
