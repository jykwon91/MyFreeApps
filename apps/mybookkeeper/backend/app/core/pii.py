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
    "employee_ssn",
    "employer_ein",
    "payer_ein",
    "lender_tin",
    "borrower_tin",
    "issuer_tin",
})

# Shape produced by mask_pii for PII_FIELD_IDS: "***" + last 4, or "****".
_MASKED_PII_PATTERN = re.compile(r"^\*{3}.{4}$|^\*{4}$")


# Tokens mask_pii writes inside free text: "***-**-1234" and "*****1234".
_MASK_TOKEN_PATTERN = re.compile(r"\*\*\*-\*\*-\d{4}|\*{5}\d{4}")


def has_pii_pattern(value: str) -> bool:
    """True when free text holds an SSN/TIN that mask_pii would rewrite."""
    return _SSN_PATTERN.search(value) is not None or _TIN_PATTERN.search(value) is not None


def has_mask_token(value: str) -> bool:
    return _MASK_TOKEN_PATTERN.search(value) is not None


def is_masked_pii(field_id: str, value: str) -> bool:
    """True when value is a masked rendering of a PII field, not a real value."""
    return field_id in PII_FIELD_IDS and _MASKED_PII_PATTERN.match(value) is not None


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
