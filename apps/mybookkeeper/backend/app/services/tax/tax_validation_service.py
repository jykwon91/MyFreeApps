"""Cross-document validation rules for tax returns.

This module re-exports from the tax_validation package for backwards compatibility.
The actual rule implementations live in app.services.tax.tax_validation.*.
"""
from app.services.tax.tax_validation import validate
from app.services.tax.tax_validation._types import (
    FormFieldIndex,
    ValidationResult,
    index_fields as _index_fields,
    sum_field as _sum_field,
)

__all__ = ["validate", "ValidationResult", "FormFieldIndex"]
