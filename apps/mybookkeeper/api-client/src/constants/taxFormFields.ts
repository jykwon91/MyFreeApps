/** Fields whose whole value is shown masked, down to the last four characters. Must equal PII_FIELD_IDS in backend/app/core/pii.py (enforced by backend/tests/test_pii.py). */
export const PII_FIELDS: ReadonlySet<string> = new Set([
  "recipient_tin", "payer_tin", "ssn", "social_security_number", "account_number",
  "recipient_ssn", "payer_ssn", "issuer_ein", "employee_ssn", "employer_ein",
  "payer_ein", "lender_tin", "borrower_tin", "issuer_tin",
]);

/** A Social Security number written out in a longer text; masked wherever it appears. */
export const SSN_PATTERN = /\b\d{3}-\d{2}-\d{4}\b/g;

/** Tokens the backend writes when it masks an SSN/TIN ("***-**-1234", "*****1234", "***1234"). */
export const MASK_TOKEN_PATTERN = /\*{3,}/;

export const TAX_FIELD_EMPTY_VALUE = "\u2014";

export const TAX_BOOLEAN_LABELS = { yes: "Yes", no: "No" } as const;
