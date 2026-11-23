"""The column transforms the account data export applies, matching the app."""
from app.core.pii import mask_pii
from app.core.security import decrypt_pii
from app.db.base import Base
from app.mappers.export.column_transform import ColumnTransform
from app.mappers.export.export_value_mapper import to_export_value
from app.mappers.export.json_value import JsonValue
from app.mappers.integration_mapper import gmail_label_of
from app.models.integrations.integration import Integration
from app.models.tax.tax_form_field import TaxFormField

_ISSUER_EIN_FIELD_ID = "issuer_ein"


def _decrypt(_row: Base, ciphertext: object) -> JsonValue:
    if not ciphertext:
        return None
    if not isinstance(ciphertext, str):
        raise TypeError(f"Expected ciphertext as str, got {type(ciphertext).__name__}")
    return decrypt_pii(ciphertext)


def decrypted_as(exported_as: str) -> ColumnTransform:
    """A raw-ciphertext column (not an ``EncryptedString``), exported decrypted."""
    return ColumnTransform(exported_as, _decrypt)


def _mask_issuer_ein(_row: Base, ein: object) -> JsonValue:
    return to_export_value(mask_pii(_ISSUER_EIN_FIELD_ID, ein))


def _mask_tax_form_field_value(row: Base, value: object) -> JsonValue:
    if not isinstance(row, TaxFormField):
        raise TypeError(f"Expected a TaxFormField, got {type(row).__name__}")
    return to_export_value(mask_pii(row.field_id, value))


def _gmail_label(row: Base, _metadata: object) -> JsonValue:
    if not isinstance(row, Integration):
        raise TypeError(f"Expected an Integration, got {type(row).__name__}")
    return gmail_label_of(row)


# A tax form field's text value, masked by its field id as the tax return pages show it.
TAX_FORM_FIELD_VALUE_MASKED = ColumnTransform("value_text", _mask_tax_form_field_value)

# A tax form's issuer EIN, masked as the tax return and summary pages show it.
TAX_FORM_INSTANCE_ISSUER_EIN_MASKED = ColumnTransform("issuer_ein", _mask_issuer_ein)

# Of an integration's settings blob, the app shows only the Gmail label.
INTEGRATION_GMAIL_LABEL = ColumnTransform("gmail_label", _gmail_label)
