"""backfill_financial_tables

Revision ID: b4c5d6e7f8a9
Revises: a3f7c8d92e14
Create Date: 2026-03-19 14:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "b4c5d6e7f8a9"
down_revision: Union[str, None] = "a3f7c8d92e14"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# ── Tag → category / schedule_e_line mappings ────────────────────────────
# Mirrors backend/app/core/tags.py — kept inline so the migration is self-contained.

REVENUE_TAGS = (
    "rental_revenue",
    "cleaning_fee_revenue",
)

EXPENSE_TAGS = (
    "channel_fee",
    "cleaning_expense",
    "maintenance",
    "management_fee",
    "mortgage_interest",
    "mortgage_principal",
    "insurance",
    "utilities",
    "taxes",
    "other_expense",
    "contract_work",
    "advertising",
    "legal_professional",
    "travel",
)

CATEGORY_TO_SCHEDULE_E: dict[str, str | None] = {
    "rental_revenue": "line_3_rents_received",
    "cleaning_fee_revenue": "line_3_rents_received",
    "advertising": "line_5_advertising",
    "travel": "line_6_auto_travel",
    "cleaning_expense": "line_7_cleaning_maintenance",
    "maintenance": "line_7_cleaning_maintenance",
    "management_fee": "line_8_commissions",
    "channel_fee": "line_8_commissions",
    "insurance": "line_9_insurance",
    "legal_professional": "line_10_legal_professional",
    "mortgage_interest": "line_12_mortgage_interest",
    "mortgage_principal": None,
    "contract_work": "line_14_repairs",
    "taxes": "line_16_taxes",
    "utilities": "line_17_utilities",
    "other_expense": "line_19_other",
    "uncategorized": None,
}


def upgrade() -> None:
    conn = op.get_bind()

    # ── Step 1: Create extraction rows from documents with raw_extracted ──
    result = conn.execute(sa.text("""
        INSERT INTO extractions (
            id, document_id, organization_id, user_id,
            status, raw_response, confidence, document_type,
            tokens_used, created_at
        )
        SELECT
            gen_random_uuid(),
            d.id,
            d.organization_id,
            d.user_id,
            CASE
                WHEN d.status IN ('failed') THEN 'failed'
                WHEN d.status IN ('processing', 'extracting') THEN 'processing'
                ELSE 'completed'
            END,
            d.raw_extracted,
            d.confidence,
            COALESCE(
                NULLIF(d.document_type, ''),
                'invoice'
            ),
            0,
            d.created_at
        FROM documents d
        WHERE d.raw_extracted IS NOT NULL
          AND d.deleted_at IS NULL
          AND d.organization_id IS NOT NULL
        ON CONFLICT DO NOTHING
    """))
    print(f"  [backfill] Inserted {result.rowcount} extraction rows")

    # ── Step 2: Create transaction rows from documents with amount ────────
    # We use a multi-pass approach since SQL cannot easily iterate JSONB arrays
    # with complex conditional logic.

    # Build SQL CASE expressions for the tag → category / schedule_e_line mapping.
    # Pass 1: Revenue tags — documents where tags contain a revenue tag
    for tag in REVENUE_TAGS:
        schedule_e = CATEGORY_TO_SCHEDULE_E.get(tag)
        schedule_e_sql = f"'{schedule_e}'" if schedule_e else "NULL"
        result = conn.execute(sa.text(f"""
            INSERT INTO transactions (
                id, organization_id, user_id, property_id, extraction_id,
                transaction_date, tax_year, vendor, description, amount,
                transaction_type, category, tags, tax_relevant,
                schedule_e_line, channel, address, status, created_at, updated_at
            )
            SELECT
                gen_random_uuid(),
                d.organization_id,
                d.user_id,
                d.property_id,
                (SELECT e.id FROM extractions e
                 WHERE e.document_id = d.id
                 ORDER BY e.created_at DESC LIMIT 1),
                d.date::date,
                EXTRACT(YEAR FROM d.date)::smallint,
                d.vendor,
                d.description,
                d.amount,
                'income',
                '{tag}',
                COALESCE(d.tags, '[]'::jsonb),
                d.tax_relevant,
                {schedule_e_sql},
                d.channel,
                d.address,
                CASE
                    WHEN d.status = 'approved' THEN 'approved'
                    WHEN d.status = 'needs_review' THEN 'needs_review'
                    ELSE 'pending'
                END,
                d.created_at,
                d.updated_at
            FROM documents d
            WHERE d.amount IS NOT NULL
              AND d.amount > 0
              AND d.date IS NOT NULL
              AND d.deleted_at IS NULL
              AND d.organization_id IS NOT NULL
              AND d.tags @> '["{tag}"]'::jsonb
            ON CONFLICT DO NOTHING
        """))
        print(f"  [backfill] Inserted {result.rowcount} income transactions (tag={tag})")

    # Pass 2: Expense tags — documents with an expense tag and NO revenue tag
    revenue_exclusion = " AND ".join(
        f"NOT d.tags @> '[\"{rt}\"]'::jsonb" for rt in REVENUE_TAGS
    )
    for tag in EXPENSE_TAGS:
        schedule_e = CATEGORY_TO_SCHEDULE_E.get(tag)
        schedule_e_sql = f"'{schedule_e}'" if schedule_e else "NULL"
        result = conn.execute(sa.text(f"""
            INSERT INTO transactions (
                id, organization_id, user_id, property_id, extraction_id,
                transaction_date, tax_year, vendor, description, amount,
                transaction_type, category, tags, tax_relevant,
                schedule_e_line, channel, address, status, created_at, updated_at
            )
            SELECT
                gen_random_uuid(),
                d.organization_id,
                d.user_id,
                d.property_id,
                (SELECT e.id FROM extractions e
                 WHERE e.document_id = d.id
                 ORDER BY e.created_at DESC LIMIT 1),
                d.date::date,
                EXTRACT(YEAR FROM d.date)::smallint,
                d.vendor,
                d.description,
                d.amount,
                'expense',
                '{tag}',
                COALESCE(d.tags, '[]'::jsonb),
                d.tax_relevant,
                {schedule_e_sql},
                d.channel,
                d.address,
                CASE
                    WHEN d.status = 'approved' THEN 'approved'
                    WHEN d.status = 'needs_review' THEN 'needs_review'
                    ELSE 'pending'
                END,
                d.created_at,
                d.updated_at
            FROM documents d
            WHERE d.amount IS NOT NULL
              AND d.amount > 0
              AND d.date IS NOT NULL
              AND d.deleted_at IS NULL
              AND d.organization_id IS NOT NULL
              AND d.tags @> '["{tag}"]'::jsonb
              AND {revenue_exclusion}
            ON CONFLICT DO NOTHING
        """))
        print(f"  [backfill] Inserted {result.rowcount} expense transactions (tag={tag})")

    # Pass 2b: Handle legacy 'mortgage' tag → 'mortgage_interest' category
    schedule_e_mortgage = CATEGORY_TO_SCHEDULE_E["mortgage_interest"]
    result = conn.execute(sa.text(f"""
        INSERT INTO transactions (
            id, organization_id, user_id, property_id, extraction_id,
            transaction_date, tax_year, vendor, description, amount,
            transaction_type, category, tags, tax_relevant,
            schedule_e_line, channel, address, status, created_at, updated_at
        )
        SELECT
            gen_random_uuid(),
            d.organization_id,
            d.user_id,
            d.property_id,
            (SELECT e.id FROM extractions e
             WHERE e.document_id = d.id
             ORDER BY e.created_at DESC LIMIT 1),
            d.date::date,
            EXTRACT(YEAR FROM d.date)::smallint,
            d.vendor,
            d.description,
            d.amount,
            'expense',
            'mortgage_interest',
            COALESCE(d.tags, '[]'::jsonb),
            d.tax_relevant,
            '{schedule_e_mortgage}',
            d.channel,
            d.address,
            CASE
                WHEN d.status = 'approved' THEN 'approved'
                WHEN d.status = 'needs_review' THEN 'needs_review'
                ELSE 'pending'
            END,
            d.created_at,
            d.updated_at
        FROM documents d
        WHERE d.amount IS NOT NULL
          AND d.amount > 0
          AND d.date IS NOT NULL
          AND d.deleted_at IS NULL
          AND d.organization_id IS NOT NULL
          AND d.tags @> '["mortgage"]'::jsonb
          AND NOT d.tags @> '["mortgage_interest"]'::jsonb
          AND {revenue_exclusion}
        ON CONFLICT DO NOTHING
    """))
    if result.rowcount > 0:
        print(f"  [backfill] Migrated {result.rowcount} legacy 'mortgage' → 'mortgage_interest' transactions (review manually)")

    # Pass 3: Remaining documents with amount but no recognized tag → uncategorized expense
    all_known_tags = list(REVENUE_TAGS) + list(EXPENSE_TAGS) + ["mortgage"]
    tag_exclusion = " AND ".join(
        f"NOT d.tags @> '[\"{t}\"]'::jsonb" for t in all_known_tags
    )
    result = conn.execute(sa.text(f"""
        INSERT INTO transactions (
            id, organization_id, user_id, property_id, extraction_id,
            transaction_date, tax_year, vendor, description, amount,
            transaction_type, category, tags, tax_relevant,
            schedule_e_line, channel, address, status, created_at, updated_at
        )
        SELECT
            gen_random_uuid(),
            d.organization_id,
            d.user_id,
            d.property_id,
            (SELECT e.id FROM extractions e
             WHERE e.document_id = d.id
             ORDER BY e.created_at DESC LIMIT 1),
            d.date::date,
            EXTRACT(YEAR FROM d.date)::smallint,
            d.vendor,
            d.description,
            d.amount,
            'expense',
            'uncategorized',
            COALESCE(d.tags, '[]'::jsonb),
            d.tax_relevant,
            NULL,
            d.channel,
            d.address,
            CASE
                WHEN d.status = 'approved' THEN 'approved'
                WHEN d.status = 'needs_review' THEN 'needs_review'
                ELSE 'pending'
            END,
            d.created_at,
            d.updated_at
        FROM documents d
        WHERE d.amount IS NOT NULL
          AND d.amount > 0
          AND d.date IS NOT NULL
          AND d.deleted_at IS NULL
          AND d.organization_id IS NOT NULL
          AND ({tag_exclusion} OR d.tags IS NULL OR d.tags = '[]'::jsonb)
        ON CONFLICT DO NOTHING
    """))
    print(f"  [backfill] Inserted {result.rowcount} uncategorized expense transactions")

    # ── Step 3: Create reservation rows from documents with line_items ────
    # Line item fields from Claude: res_code, platform, check_in, check_out,
    # net_booking_revenue, commission, net_client_earnings, cleaning, insurance,
    # funds_due_to_client
    # The document's channel is used as fallback for platform.
    result = conn.execute(sa.text("""
        INSERT INTO reservations (
            id, organization_id, property_id, transaction_id,
            res_code, platform, check_in, check_out,
            net_booking_revenue, commission, cleaning_fee, insurance_fee,
            net_client_earnings, funds_due_to_client,
            created_at
        )
        SELECT
            gen_random_uuid(),
            d.organization_id,
            d.property_id,
            (
                SELECT t.id FROM transactions t
                WHERE t.extraction_id = (
                    SELECT e.id FROM extractions e
                    WHERE e.document_id = d.id
                    ORDER BY e.created_at DESC LIMIT 1
                )
                LIMIT 1
            ),
            li->>'res_code',
            COALESCE(
                NULLIF(li->>'platform', ''),
                d.channel
            ),
            (li->>'check_in')::date,
            (li->>'check_out')::date,
            NULLIF(li->>'net_booking_revenue', '')::numeric(12,2),
            NULLIF(li->>'commission', '')::numeric(12,2),
            NULLIF(li->>'cleaning', '')::numeric(12,2),
            NULLIF(li->>'insurance', '')::numeric(12,2),
            NULLIF(li->>'net_client_earnings', '')::numeric(12,2),
            NULLIF(li->>'funds_due_to_client', '')::numeric(12,2),
            d.created_at
        FROM documents d
        CROSS JOIN LATERAL jsonb_array_elements(d.line_items) AS li
        WHERE d.line_items IS NOT NULL
          AND jsonb_typeof(d.line_items) = 'array'
          AND d.deleted_at IS NULL
          AND d.organization_id IS NOT NULL
          AND li->>'res_code' IS NOT NULL
          AND NULLIF(li->>'res_code', '') IS NOT NULL
          AND li->>'check_in' IS NOT NULL
          AND li->>'check_out' IS NOT NULL
          AND (li->>'check_out')::date > (li->>'check_in')::date
        ON CONFLICT ON CONSTRAINT uq_res_org_code DO NOTHING
    """))
    print(f"  [backfill] Inserted {result.rowcount} reservation rows")

    # ── Summary ──────────────────────────────────────────────────────────
    ext_count = conn.execute(sa.text("SELECT count(*) FROM extractions")).scalar()
    txn_count = conn.execute(sa.text("SELECT count(*) FROM transactions")).scalar()
    res_count = conn.execute(sa.text("SELECT count(*) FROM reservations")).scalar()
    print(f"  [backfill] Final counts — extractions: {ext_count}, transactions: {txn_count}, reservations: {res_count}")


def downgrade() -> None:
    conn = op.get_bind()

    conn.execute(sa.text("DELETE FROM reservations"))
    print("  [rollback] Deleted all reservation rows")

    conn.execute(sa.text("DELETE FROM transactions"))
    print("  [rollback] Deleted all transaction rows")

    conn.execute(sa.text("DELETE FROM extractions"))
    print("  [rollback] Deleted all extraction rows")
