"""PII masking utilities for sensitive fields (SSN, TIN, account numbers)."""
import re

_SSN_PATTERN = re.compile(r"\b\d{3}-\d{2}-\d{4}\b")
_TIN_PATTERN = re.compile(r"\b\d{9}\b")

PII_FIELD_IDS = frozenset({
    "recipient_tin",
    "payer_tin",
    "ssn",
    "social_security_number",
    "account_number",
    "recipient_ssn",
    "payer_ssn",
    "issuer_ein",
})


def mask_pii(field_id: str, value: object) -> object:
    """Mask PII values before sending to the frontend.

    Known PII fields are fully masked except the last 4 characters.
    Free-text values are scanned for SSN/TIN patterns and partially redacted.
    """
    if value is None:
        return None
    if field_id in PII_FIELD_IDS:
        s = str(value)
        if len(s) >= 4:
            return "***" + s[-4:]
        return "****"
    if isinstance(value, str):
        value = _SSN_PATTERN.sub(lambda m: "***-**-" + m.group()[-4:], value)
        value = _TIN_PATTERN.sub(lambda m: "*****" + m.group()[-4:], value)
    return value
