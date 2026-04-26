"""Per-document-type prompt addendums.

These are appended to DEFAULT_PROMPT when the document type is known or strongly
suspected (from filename, MIME type, or user selection). They provide focused
instructions that improve extraction accuracy for specific document types.
"""

ADDENDUMS: dict[str, str] = {
    "1099_b": """
# Additional instructions for 1099-B (Broker Transactions)

This document is a Form 1099-B reporting proceeds from broker/barter exchange transactions.

Extract EACH transaction as a separate document entry with document_type "1099_b".
For multi-page 1099-B forms with many transactions, extract ALL of them.

For each transaction, include tax_form_data.fields with:
- box_1a: Description of property (stock name, ticker, CUSIP)
- box_1b: Date acquired (YYYY-MM-DD or "Various")
- box_1c: Date sold or disposed (YYYY-MM-DD)
- box_1d: Proceeds (decimal)
- box_1e: Cost or other basis (decimal)
- box_2: Short-term or long-term (report as "short" or "long")
- box_5: If checked, noncovered security (boolean)
- box_7: Loss not allowed based on amount in 1d (decimal, if applicable)

For consolidated 1099-B forms from brokerages (Schwab, Fidelity, etc.):
- Each sale/transaction row becomes its own entry
- Look for "short-term" and "long-term" section headers to determine box_2
- Wash sale adjustments should be noted in description
""",
    "1099_k": """
# Additional instructions for 1099-K (Payment Card/Third Party)

This is a Form 1099-K reporting payment card and third-party network transactions.

Extract ALL box values, paying special attention to:
- box_1a: Gross amount of payment card/third-party network transactions
- box_1b: Card not present transactions
- box_5a through box_5l: Gross amount for each month (January through December)
- box_7a through box_7l: (if present) Number of payment transactions per month

For Airbnb/VRBO/booking platform 1099-Ks:
- issuer_name should be the platform (e.g., "Airbnb Payments Inc")
- This represents GROSS booking amounts before platform fees
- Set vendor to the platform name
""",
    "w2": """
# Additional instructions for W-2

This is a Form W-2 Wage and Tax Statement.

Extract ALL boxes including:
- box_1: Wages, tips, other compensation
- box_2: Federal income tax withheld
- box_3: Social security wages
- box_4: Social security tax withheld
- box_5: Medicare wages and tips
- box_6: Medicare tax withheld
- box_12a through box_12d: Coded entries (e.g., "D" for 401k, "DD" for health coverage)
  Format as: {"box_12a_code": "D", "box_12a_amount": 5000.00}
- box_13: Checkboxes (statutory employee, retirement plan, third-party sick pay)
  Format as: {"box_13_statutory": false, "box_13_retirement": true, "box_13_sick_pay": false}
- box_14: Other (report as string)
- box_15-20: State/local tax info
  Format as: {"box_15_state": "TX", "box_16": 75000.00, "box_17": 0}

vendor should be the employer name from box c (Employer's name).
""",
    "1098": """
# Additional instructions for 1098 (Mortgage Interest)

This is a Form 1098 Mortgage Interest Statement.

Extract ALL boxes:
- box_1: Mortgage interest received from borrower
- box_2: Outstanding mortgage principal
- box_3: Mortgage origination date
- box_4: Refund of overpaid interest
- box_5: Mortgage insurance premiums
- box_6: Points paid on purchase of principal residence
- box_7: Is property address same as borrower? (boolean)
- box_8: Address of property (CRITICAL — use this for the address field)
- box_10: Number of mortgaged properties

IMPORTANT: Use box_8 (property address) as the address field, NOT the borrower's mailing address.
""",
    "insurance_policy": """
# Additional instructions for Insurance Documents

This document is an insurance policy, declarations page, or certificate of insurance.

Extract:
- vendor: Insurance company name
- amount: Annual premium (NOT coverage amount)
- description: Policy type and number
- address: Property address being insured (from "Location" or "Property Address")

Include these additional fields if present:
- policy_number, coverage_amount, premium, effective_date, expiration_date, insurer, coverage_type

IMPORTANT: The amount field should be the PREMIUM (what the owner pays), not the coverage limit.
Insurance declarations are often reference-only (escrow-paid) — extract but note if the document
mentions escrow or lender-paid.
""",
    "lease": """
# Additional instructions for Lease Agreements

This document is a lease, rental contract, or lease renewal/amendment.

Extract:
- vendor: Tenant name(s) (the person leasing the property)
- amount: Monthly rent amount
- address: Property address
- description: Brief summary (e.g., "12-month lease starting Jan 2025")

Include these additional fields:
- lease_start: Start date (YYYY-MM-DD)
- lease_end: End date (YYYY-MM-DD)
- monthly_rent: Monthly rent (decimal string)
- tenant_name: Full tenant name(s)
- security_deposit: Security deposit amount if mentioned
- lease_terms: Key terms (pets allowed, utilities included, etc.)

Set category to "uncategorized" and transaction_type to "expense" (non-financial document).
""",
}


def get_addendum(document_type: str | None) -> str | None:
    """Return the prompt addendum for a given document type, or None."""
    if not document_type:
        return None
    return ADDENDUMS.get(document_type)


def get_addendum_for_filename(filename: str) -> str | None:
    """Infer document type from filename and return the addendum."""
    lower = filename.lower()
    if "1099-b" in lower or "1099b" in lower:
        return ADDENDUMS.get("1099_b")
    if "1099-k" in lower or "1099k" in lower:
        return ADDENDUMS.get("1099_k")
    if "w-2" in lower or "w2" in lower:
        return ADDENDUMS.get("w2")
    if "1098" in lower:
        return ADDENDUMS.get("1098")
    if "insurance" in lower or "declaration" in lower or "policy" in lower:
        return ADDENDUMS.get("insurance_policy")
    if "lease" in lower or "rental agreement" in lower:
        return ADDENDUMS.get("lease")
    return None
