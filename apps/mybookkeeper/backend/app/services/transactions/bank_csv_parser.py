"""Parse common bank CSV export formats into transactions."""
import csv
import hashlib
import io
import uuid
from datetime import date, datetime, timezone
from decimal import Decimal, InvalidOperation

from app.models.transactions.transaction import Transaction
from app.services.extraction.sender_category_service import match_sender_category
from app.core.tags import CATEGORY_TO_SCHEDULE_E, REVENUE_TAGS, EXPENSE_TAGS


def detect_bank_format(content: str) -> str:
    lines = content.strip().splitlines()
    if not lines:
        return "unknown"

    first_line = lines[0].strip()

    if first_line.startswith("Details,Posting Date,Description,Amount,Type,Balance"):
        return "chase"

    if first_line.startswith("Date,Description,Amount,Running Bal"):
        return "bofa"

    if not first_line[0].isalpha():
        reader = csv.reader(io.StringIO(content))
        for row in reader:
            if len(row) == 5:
                try:
                    _parse_date_flexible(row[0])
                    Decimal(row[1].replace(",", ""))
                    return "wellsfargo"
                except (ValueError, InvalidOperation):
                    pass
            break

    reader = csv.reader(io.StringIO(content))
    for row in reader:
        lower_row = [c.lower().strip() for c in row]
        has_date = any(col in ("date", "posting date", "trans date", "transaction date") for col in lower_row)
        has_amount = any(col in ("amount", "debit", "credit") for col in lower_row)
        if has_date and has_amount:
            return "generic"
        break

    return "unknown"


def parse_bank_csv(
    content: str,
    organization_id: uuid.UUID,
    user_id: uuid.UUID,
    property_id: uuid.UUID | None = None,
) -> list[Transaction]:
    fmt = detect_bank_format(content)
    if fmt == "chase":
        return _parse_chase(content, organization_id, user_id, property_id)
    if fmt == "wellsfargo":
        return _parse_wellsfargo(content, organization_id, user_id, property_id)
    if fmt == "bofa":
        return _parse_bofa(content, organization_id, user_id, property_id)
    if fmt == "generic":
        return _parse_generic(content, organization_id, user_id, property_id)
    return []


def _parse_date_flexible(date_str: str) -> date:
    date_str = date_str.strip()
    for fmt in ("%m/%d/%Y", "%m/%d/%y", "%Y-%m-%d", "%m-%d-%Y", "%d/%m/%Y"):
        try:
            return datetime.strptime(date_str, fmt).date()
        except ValueError:
            continue
    raise ValueError(f"Unable to parse date: {date_str}")


def _make_external_id(txn_date: date, amount: Decimal, description: str) -> str:
    desc_hash = hashlib.sha256(description.encode()).hexdigest()[:8]
    return f"{txn_date}_{amount}_{desc_hash}"


def _build_transaction(
    organization_id: uuid.UUID,
    user_id: uuid.UUID,
    property_id: uuid.UUID | None,
    txn_date: date,
    description: str,
    amount: Decimal,
    payment_method: str | None = None,
) -> Transaction:
    if amount > 0:
        transaction_type = "expense"
    else:
        transaction_type = "income"
        amount = abs(amount)

    category = match_sender_category(description) or "uncategorized"

    if category in REVENUE_TAGS:
        transaction_type = "income"
    elif category in EXPENSE_TAGS:
        transaction_type = "expense"

    schedule_e_line = CATEGORY_TO_SCHEDULE_E.get(category)

    tax_relevant = category != "uncategorized"

    return Transaction(
        id=uuid.uuid4(),
        organization_id=organization_id,
        user_id=user_id,
        property_id=property_id,
        transaction_date=txn_date,
        tax_year=txn_date.year,
        vendor=description.strip()[:255] if description else None,
        description=description.strip() if description else None,
        amount=amount,
        transaction_type=transaction_type,
        category=category,
        tags=[category],
        tax_relevant=tax_relevant,
        schedule_e_line=schedule_e_line,
        payment_method=payment_method,
        status="approved",
        is_manual=False,
        external_source="bank_csv",
        external_id=_make_external_id(txn_date, amount, description),
    )


def _parse_chase(
    content: str,
    organization_id: uuid.UUID,
    user_id: uuid.UUID,
    property_id: uuid.UUID | None,
) -> list[Transaction]:
    reader = csv.DictReader(io.StringIO(content))
    transactions: list[Transaction] = []
    for row in reader:
        try:
            txn_date = _parse_date_flexible(row["Posting Date"])
            raw_amount = Decimal(row["Amount"].replace(",", ""))
            description = row.get("Description", "").strip()
            amount = -raw_amount
            transactions.append(_build_transaction(
                organization_id, user_id, property_id,
                txn_date, description, amount,
                payment_method="bank_transfer",
            ))
        except (ValueError, InvalidOperation, KeyError):
            continue
    return transactions


def _parse_wellsfargo(
    content: str,
    organization_id: uuid.UUID,
    user_id: uuid.UUID,
    property_id: uuid.UUID | None,
) -> list[Transaction]:
    reader = csv.reader(io.StringIO(content))
    transactions: list[Transaction] = []
    for row in reader:
        if len(row) < 5:
            continue
        try:
            txn_date = _parse_date_flexible(row[0])
            raw_amount = Decimal(row[1].replace(",", ""))
            description = row[4].strip()
            amount = -raw_amount
            transactions.append(_build_transaction(
                organization_id, user_id, property_id,
                txn_date, description, amount,
                payment_method="bank_transfer",
            ))
        except (ValueError, InvalidOperation):
            continue
    return transactions


def _parse_bofa(
    content: str,
    organization_id: uuid.UUID,
    user_id: uuid.UUID,
    property_id: uuid.UUID | None,
) -> list[Transaction]:
    reader = csv.DictReader(io.StringIO(content))
    transactions: list[Transaction] = []
    for row in reader:
        try:
            txn_date = _parse_date_flexible(row["Date"])
            raw_amount = Decimal(row["Amount"].replace(",", ""))
            description = row.get("Description", "").strip()
            amount = -raw_amount
            transactions.append(_build_transaction(
                organization_id, user_id, property_id,
                txn_date, description, amount,
                payment_method="bank_transfer",
            ))
        except (ValueError, InvalidOperation, KeyError):
            continue
    return transactions


def _parse_generic(
    content: str,
    organization_id: uuid.UUID,
    user_id: uuid.UUID,
    property_id: uuid.UUID | None,
) -> list[Transaction]:
    reader = csv.reader(io.StringIO(content))
    headers_raw = next(reader, None)
    if not headers_raw:
        return []

    headers = [h.lower().strip() for h in headers_raw]

    date_col: int | None = None
    amount_col: int | None = None
    debit_col: int | None = None
    credit_col: int | None = None
    desc_col: int | None = None

    for i, h in enumerate(headers):
        if h in ("date", "posting date", "trans date", "transaction date") and date_col is None:
            date_col = i
        elif h == "amount" and amount_col is None:
            amount_col = i
        elif h == "debit" and debit_col is None:
            debit_col = i
        elif h == "credit" and credit_col is None:
            credit_col = i
        elif h in ("description", "memo", "narrative", "details") and desc_col is None:
            desc_col = i

    if date_col is None:
        return []
    if amount_col is None and debit_col is None:
        return []

    transactions: list[Transaction] = []
    for row in reader:
        try:
            txn_date = _parse_date_flexible(row[date_col])
            description = row[desc_col].strip() if desc_col is not None and desc_col < len(row) else ""

            if amount_col is not None and amount_col < len(row) and row[amount_col].strip():
                raw = Decimal(row[amount_col].replace(",", "").replace("$", ""))
                amount = -raw
            elif debit_col is not None or credit_col is not None:
                debit = Decimal(row[debit_col].replace(",", "").replace("$", "")) if debit_col is not None and debit_col < len(row) and row[debit_col].strip() else Decimal("0")
                credit = Decimal(row[credit_col].replace(",", "").replace("$", "")) if credit_col is not None and credit_col < len(row) and row[credit_col].strip() else Decimal("0")
                amount = debit - credit
            else:
                continue

            transactions.append(_build_transaction(
                organization_id, user_id, property_id,
                txn_date, description, amount,
                payment_method="bank_transfer",
            ))
        except (ValueError, InvalidOperation, IndexError):
            continue

    return transactions
