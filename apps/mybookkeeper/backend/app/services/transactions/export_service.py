"""Export transactions as CSV or PDF."""
import csv
import io
import uuid
from collections import defaultdict
from datetime import date

from reportlab.lib import colors
from reportlab.lib.pagesizes import letter, landscape
from reportlab.lib.units import inch
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
from reportlab.lib.styles import getSampleStyleSheet

from app.core.context import RequestContext
from app.core.tax_constants import SCHEDULE_E_EXPORT_LABELS
from app.db.session import AsyncSessionLocal
from app.repositories import property_repo, transaction_repo
from app.services.transactions.summary_service import get_tax_summary

CSV_HEADERS = [
    "Date", "Vendor", "Description", "Amount", "Type", "Category",
    "Property", "Payment Method", "Status", "Tax Relevant", "Schedule E Line",
]


async def export_transactions_csv(
    ctx: RequestContext,
    *,
    property_id: uuid.UUID | None = None,
    status: str | None = None,
    transaction_type: str | None = None,
    category: str | None = None,
    start_date: date | None = None,
    end_date: date | None = None,
    tax_year: int | None = None,
) -> bytes:
    async with AsyncSessionLocal() as db:
        transactions = await transaction_repo.list_filtered(
            db, ctx.organization_id,
            property_id=property_id, status=status,
            transaction_type=transaction_type, category=category,
            start_date=start_date, end_date=end_date, tax_year=tax_year,
        )
        prop_names = await property_repo.get_name_map(db, ctx.organization_id)

    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(CSV_HEADERS)
    for txn in transactions:
        prop_name = prop_names.get(txn.property_id, "") if txn.property_id else ""
        writer.writerow([
            str(txn.transaction_date),
            txn.vendor or "",
            txn.description or "",
            f"{txn.amount:.2f}",
            txn.transaction_type,
            txn.category,
            prop_name,
            txn.payment_method or "",
            txn.status,
            "Yes" if txn.tax_relevant else "No",
            SCHEDULE_E_EXPORT_LABELS.get(txn.schedule_e_line or "", ""),
        ])
    return buf.getvalue().encode("utf-8")


def _build_pdf_buffer() -> tuple[io.BytesIO, SimpleDocTemplate]:
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=landscape(letter), leftMargin=0.5 * inch, rightMargin=0.5 * inch)
    return buf, doc


async def export_transactions_pdf(
    ctx: RequestContext,
    *,
    property_id: uuid.UUID | None = None,
    status: str | None = None,
    transaction_type: str | None = None,
    category: str | None = None,
    start_date: date | None = None,
    end_date: date | None = None,
    tax_year: int | None = None,
) -> bytes:
    async with AsyncSessionLocal() as db:
        transactions = await transaction_repo.list_filtered(
            db, ctx.organization_id,
            property_id=property_id, status=status,
            transaction_type=transaction_type, category=category,
            start_date=start_date, end_date=end_date, tax_year=tax_year,
        )
        prop_names = await property_repo.get_name_map(db, ctx.organization_id)
    styles = getSampleStyleSheet()

    buf, doc = _build_pdf_buffer()
    elements: list = []

    elements.append(Paragraph("Transaction Report", styles["Title"]))
    elements.append(Spacer(1, 12))

    headers = ["Date", "Vendor", "Amount", "Type", "Category", "Property", "Status"]
    data = [headers]
    for txn in transactions:
        prop_name = prop_names.get(txn.property_id, "") if txn.property_id else ""
        data.append([
            str(txn.transaction_date),
            (txn.vendor or "")[:30],
            f"${txn.amount:,.2f}",
            txn.transaction_type,
            txn.category.replace("_", " ").title(),
            prop_name[:25],
            txn.status,
        ])

    table = Table(data, repeatRows=1)
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#374151")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTSIZE", (0, 0), (-1, 0), 8),
        ("FONTSIZE", (0, 1), (-1, -1), 7),
        ("ALIGN", (2, 0), (2, -1), "RIGHT"),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#d1d5db")),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f9fafb")]),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    elements.append(table)

    doc.build(elements)
    return buf.getvalue()


async def export_schedule_e(
    ctx: RequestContext,
    tax_year: int,
) -> bytes:
    async with AsyncSessionLocal() as db:
        rows = await transaction_repo.schedule_e_report(db, ctx.organization_id, tax_year)
        prop_names = await property_repo.get_name_map(db, ctx.organization_id)
    styles = getSampleStyleSheet()

    buf, doc = _build_pdf_buffer()
    elements: list = []

    elements.append(Paragraph(f"Schedule E Report - {tax_year}", styles["Title"]))
    elements.append(Spacer(1, 12))

    by_property: dict[uuid.UUID | None, dict[str | None, float]] = defaultdict(lambda: defaultdict(float))
    for row in rows:
        by_property[row.property_id][row.schedule_e_line] += float(row.total_amount)

    all_lines = sorted(
        {row.schedule_e_line for row in rows if row.schedule_e_line},
        key=lambda x: x or "",
    )

    property_ids = sorted(by_property.keys(), key=lambda x: str(x))

    headers = ["Line"] + [
        (prop_names.get(pid, "Unassigned") if pid else "Unassigned")[:20]
        for pid in property_ids
    ] + ["Total"]
    data = [headers]

    for line_key in all_lines:
        label = SCHEDULE_E_EXPORT_LABELS.get(line_key, line_key or "Other")
        row_data = [label]
        line_total = 0.0
        for pid in property_ids:
            amt = by_property[pid].get(line_key, 0.0)
            line_total += amt
            row_data.append(f"${amt:,.2f}" if amt else "")
        row_data.append(f"${line_total:,.2f}")
        data.append(row_data)

    totals_row = ["TOTAL"]
    grand_total = 0.0
    for pid in property_ids:
        prop_total = sum(by_property[pid].values())
        grand_total += prop_total
        totals_row.append(f"${prop_total:,.2f}")
    totals_row.append(f"${grand_total:,.2f}")
    data.append(totals_row)

    table = Table(data, repeatRows=1)
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#374151")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTSIZE", (0, 0), (-1, 0), 7),
        ("FONTSIZE", (0, 1), (-1, -1), 7),
        ("ALIGN", (1, 0), (-1, -1), "RIGHT"),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#d1d5db")),
        ("ROWBACKGROUNDS", (0, 1), (-1, -2), [colors.white, colors.HexColor("#f9fafb")]),
        ("BACKGROUND", (0, -1), (-1, -1), colors.HexColor("#f3f4f6")),
        ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    elements.append(table)

    doc.build(elements)
    return buf.getvalue()


async def export_tax_summary(
    ctx: RequestContext,
    tax_year: int,
) -> bytes:
    data = await get_tax_summary(ctx, tax_year)
    styles = getSampleStyleSheet()

    buf, doc = _build_pdf_buffer()
    elements: list = []

    elements.append(Paragraph(f"Tax Summary - {tax_year}", styles["Title"]))
    elements.append(Spacer(1, 12))

    summary_data = [
        ["", "Amount"],
        ["Gross Revenue", f"${data['gross_revenue']:,.2f}"],
        ["Total Deductions", f"${data['total_deductions']:,.2f}"],
        ["Net Taxable Income", f"${data['net_taxable_income']:,.2f}"],
    ]
    summary_table = Table(summary_data, colWidths=[3 * inch, 2 * inch])
    summary_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#374151")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("ALIGN", (1, 0), (1, -1), "RIGHT"),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#d1d5db")),
        ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    elements.append(summary_table)
    elements.append(Spacer(1, 20))

    by_category = data.get("by_category", {})
    if by_category:
        elements.append(Paragraph("By Category", styles["Heading2"]))
        elements.append(Spacer(1, 8))

        cat_data = [["Category", "Amount"]]
        for cat, amount in sorted(by_category.items()):
            label = cat.replace("_", " ").title()
            cat_data.append([label, f"${amount:,.2f}"])

        cat_table = Table(cat_data, colWidths=[3 * inch, 2 * inch])
        cat_table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#374151")),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("FONTSIZE", (0, 0), (-1, -1), 8),
            ("ALIGN", (1, 0), (1, -1), "RIGHT"),
            ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#d1d5db")),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f9fafb")]),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("TOPPADDING", (0, 0), (-1, -1), 4),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ]))
        elements.append(cat_table)
        elements.append(Spacer(1, 20))

    by_property = data.get("by_property", [])
    if by_property:
        elements.append(Paragraph("By Property", styles["Heading2"]))
        elements.append(Spacer(1, 8))

        prop_data = [["Property", "Revenue", "Expenses", "Net Income"]]
        for row in by_property:
            prop_data.append([
                row.get("name", "Unassigned") or "Unassigned",
                f"${row.get('revenue', 0):,.2f}",
                f"${row.get('expenses', 0):,.2f}",
                f"${row.get('net_income', 0):,.2f}",
            ])

        prop_table = Table(prop_data, colWidths=[3 * inch, 1.5 * inch, 1.5 * inch, 1.5 * inch])
        prop_table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#374151")),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("FONTSIZE", (0, 0), (-1, -1), 8),
            ("ALIGN", (1, 0), (-1, -1), "RIGHT"),
            ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#d1d5db")),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f9fafb")]),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("TOPPADDING", (0, 0), (-1, -1), 4),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ]))
        elements.append(prop_table)

    doc.build(elements)
    return buf.getvalue()
