"""Cross-document validation rules for tax returns.

This module re-exports from the tax_validation package for backwards compatibility.
The actual rule implementations live in app.services.tax.tax_validation.*.
"""
from app.services.tax.tax_validation import (
    store_field_statuses,
    validate,
    validate_and_store,
)
from app.services.tax.tax_validation._types import (
    FormFieldIndex,
    ValidationResult,
)

__all__ = [
    "validate",
    "validate_and_store",
    "store_field_statuses",
    "ValidationResult",
    "FormFieldIndex",
]
