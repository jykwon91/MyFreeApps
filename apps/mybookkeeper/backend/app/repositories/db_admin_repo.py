"""Repository for admin database operations."""
import re

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


_FORBIDDEN_KEYWORDS = re.compile(
    r"\b(DROP|ALTER|TRUNCATE|CREATE|GRANT|REVOKE|INSERT|UPDATE|DELETE|EXECUTE|COPY)\b",
    re.IGNORECASE,
)


async def execute_readonly_query(
    db: AsyncSession, sql: str, *, row_limit: int = 200,
) -> tuple[list[str], list[list[object]]]:
    """Execute a read-only SQL query and return columns + rows."""
    stripped = sql.strip().rstrip(";")

    if _FORBIDDEN_KEYWORDS.search(stripped):
        raise ValueError("Only SELECT queries are allowed")

    if not stripped.upper().startswith("SELECT"):
        raise ValueError("Only SELECT queries are allowed")

    limited = f"{stripped} LIMIT {row_limit}"
    await db.execute(text("SET TRANSACTION READ ONLY"))
    # lgtm[py/sql-injection] — Admin-only ad-hoc SELECT runner. The user IS the SQL
    # author by design (admin DB query tool). Defense-in-depth controls applied above:
    #   - `_FORBIDDEN_KEYWORDS` regex blocks DDL/DML keywords (DROP/ALTER/INSERT/...)
    #   - First-token check enforces SELECT-only
    #   - `SET TRANSACTION READ ONLY` prevents writes regardless of any bypass
    #   - Endpoint at `api/admin.py` requires `Role.ADMIN`
    result = await db.execute(text(limited))  # codeql[py/sql-injection]
    columns = list(result.keys())
    rows = [[_serialize(v) for v in row] for row in result.fetchall()]
    return columns, rows


async def bulk_update_property(
    db: AsyncSession,
    organization_id: str,
    vendor: str,
    filename_pattern: str,
    target_property_id: str,
) -> int:
    """Reassign transactions to a different property based on vendor + source filename."""
    result = await db.execute(
        text("""
            UPDATE transactions SET property_id = :prop_id
            WHERE id IN (
                SELECT t.id FROM transactions t
                JOIN extractions e ON e.id = t.extraction_id
                JOIN documents d ON d.id = e.document_id
                WHERE t.vendor ILIKE :vendor
                  AND t.deleted_at IS NULL
                  AND t.organization_id = :org_id
                  AND d.file_name LIKE :pattern
            )
        """),
        {
            "prop_id": target_property_id,
            "vendor": f"%{vendor}%",
            "pattern": f"%{filename_pattern}%",
            "org_id": organization_id,
        },
    )
    return result.rowcount


async def bulk_update_sub_category(
    db: AsyncSession,
    organization_id: str,
    vendor: str,
    description_pattern: str,
    new_sub_category: str,
) -> int:
    """Fix sub_category for transactions matching vendor + description pattern."""
    result = await db.execute(
        text("""
            UPDATE transactions
            SET sub_category = :sub_cat
            WHERE vendor ILIKE :vendor
              AND category = 'utilities'
              AND (sub_category IS NULL OR sub_category = '' OR sub_category != :sub_cat)
              AND description ILIKE :pattern
              AND deleted_at IS NULL
              AND organization_id = :org_id
        """),
        {
            "sub_cat": new_sub_category,
            "vendor": f"%{vendor}%",
            "pattern": f"%{description_pattern}%",
            "org_id": organization_id,
        },
    )
    return result.rowcount


async def bulk_soft_delete(
    db: AsyncSession,
    organization_id: str,
    vendor: str,
    category: str | None,
    source: str | None,
    description_pattern: str | None,
) -> int:
    """Soft-delete duplicate transactions matching criteria."""
    conditions = [
        "t.vendor ILIKE :vendor",
        "t.deleted_at IS NULL",
        "t.organization_id = :org_id",
    ]
    params: dict[str, str] = {"vendor": f"%{vendor}%", "org_id": organization_id}

    if category:
        conditions.append("t.category = :category")
        params["category"] = category
    if description_pattern:
        conditions.append("t.description ILIKE :pattern")
        params["pattern"] = f"%{description_pattern}%"
    if source:
        conditions.append("d.source = :source")
        params["source"] = source

        where = " AND ".join(conditions)
        result = await db.execute(
            text(f"""
                UPDATE transactions SET deleted_at = NOW()
                WHERE id IN (
                    SELECT t.id FROM transactions t
                    JOIN extractions e ON e.id = t.extraction_id
                    JOIN documents d ON d.id = e.document_id
                    WHERE {where}
                )
            """),
            params,
        )
    else:
        where = " AND ".join(conditions)
        result = await db.execute(
            text(f"""
                UPDATE transactions t SET deleted_at = NOW()
                WHERE {where}
            """),
            params,
        )
    return result.rowcount


async def queue_documents_for_reextraction(
    db: AsyncSession, organization_id: str, document_ids: list[str],
) -> int:
    """Set documents to 'processing' status to trigger re-extraction."""
    result = await db.execute(
        text("""
            UPDATE documents
            SET status = 'processing', file_type = CASE
                WHEN file_name ILIKE '%.pdf%' THEN 'pdf'
                WHEN file_name ILIKE '%.png' OR file_name ILIKE '%.jpg' OR file_name ILIKE '%.jpeg' THEN 'image'
                WHEN file_name ILIKE '%.docx' THEN 'docx'
                WHEN file_name ILIKE '%.xlsx' OR file_name ILIKE '%.csv' THEN 'spreadsheet'
                ELSE file_type
            END
            WHERE id = ANY(:ids)
              AND organization_id = :org_id
        """),
        {"ids": document_ids, "org_id": organization_id},
    )
    return result.rowcount


def _serialize(value: object) -> object:
    """Convert non-JSON-serializable types to strings."""
    if value is None:
        return None
    if isinstance(value, (str, int, float, bool)):
        return value
    return str(value)
