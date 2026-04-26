"""
Data migration/backfill CLI for MyBookkeeper.

Usage:
    python -m app.cli.migrate_data cleanup-duplicates
    python -m app.cli.migrate_data recompute-tax --year 2025
    python -m app.cli.migrate_data dry-run cleanup-duplicates
"""
import argparse
import sys

from sqlalchemy import text

from app.cli.db import SyncSession


def cmd_cleanup_duplicates(args):
    """Remove duplicate documents by content_hash, keeping the oldest."""
    with SyncSession() as session:
        dupes = session.execute(text("""
            SELECT content_hash, COUNT(*) as cnt
            FROM documents
            WHERE content_hash IS NOT NULL AND deleted_at IS NULL
            GROUP BY content_hash
            HAVING COUNT(*) > 1
        """)).fetchall()

        if not dupes:
            print("No duplicates found.")
            return

        print(f"Found {len(dupes)} groups of duplicates:")
        total_removed = 0
        for content_hash, count in dupes:
            print(f"  content_hash={content_hash[:16]}... — {count} copies")
            if not args.dry_run:
                # Keep the oldest, soft-delete the rest
                session.execute(text("""
                    UPDATE documents SET deleted_at = NOW()
                    WHERE content_hash = :hash
                    AND id NOT IN (
                        SELECT id FROM documents
                        WHERE content_hash = :hash AND deleted_at IS NULL
                        ORDER BY created_at ASC
                        LIMIT 1
                    )
                    AND deleted_at IS NULL
                """), {"hash": content_hash})
                total_removed += count - 1

        if not args.dry_run:
            session.commit()
            print(f"\nSoft-deleted {total_removed} duplicate documents.")
        else:
            print(f"\n[DRY RUN] Would soft-delete {sum(c - 1 for _, c in dupes)} documents.")


def cmd_recompute_tax(args):
    """Trigger tax form recomputation for a given year."""
    if not args.year:
        print("Error: --year is required for recompute-tax")
        sys.exit(1)

    with SyncSession() as session:
        # Count existing tax form instances for the year
        count = session.execute(text("""
            SELECT COUNT(*) FROM tax_form_instances tfi
            JOIN tax_returns tr ON tfi.tax_return_id = tr.id
            WHERE tr.tax_year = :year
        """), {"year": int(args.year)}).scalar()

        print(f"Found {count} tax form instances for {args.year}.")
        if args.dry_run:
            print("[DRY RUN] Would trigger recomputation via tax_recompute_service.")
            return

        print("Tax recomputation must be triggered via the API or service layer (async).")
        print("Use: POST /api/tax-returns/{return_id}/recompute")


def cmd_reprocess_completed_without_transactions(args):
    """Find completed documents that have extractions but no transactions, and reset them for re-processing.

    This fixes documents that were processed by an older buggy code path where
    extraction succeeded but transaction creation was skipped due to a dedup
    pipeline bug (fixed in commit d589482).
    """
    with SyncSession() as session:
        # Find completed documents with extractions but no linked transactions
        affected = session.execute(text("""
            SELECT d.id, d.file_name, d.status, d.property_id, d.document_type,
                   e.id as extraction_id
            FROM documents d
            JOIN extractions e ON e.document_id = d.id AND e.status = 'completed'
            WHERE d.status = 'completed'
            AND d.document_type IS NULL
            AND NOT EXISTS (
                SELECT 1 FROM transactions t
                WHERE t.extraction_id = e.id
                AND t.deleted_at IS NULL
            )
            ORDER BY d.file_name
        """)).fetchall()

        if not affected:
            print("No affected documents found.")
            return

        print(f"Found {len(affected)} completed documents with extractions but no transactions:")
        for row in affected:
            print(f"  {row[1]} | status={row[2]} | prop={row[3]} | doc_type={row[4]}")

        if args.dry_run:
            print(f"\n[DRY RUN] Would delete {len(affected)} old extractions and reset documents to 'processing'.")
            return

        doc_ids = [str(row[0]) for row in affected]
        ext_ids = [str(row[5]) for row in affected]

        # Delete the old (empty) extractions so the worker creates fresh ones
        for ext_id in ext_ids:
            session.execute(
                text("DELETE FROM extractions WHERE id = :eid"),
                {"eid": ext_id},
            )

        # Reset documents to processing so the worker picks them up
        for doc_id in doc_ids:
            session.execute(
                text("""
                    UPDATE documents
                    SET status = 'processing',
                        property_id = NULL,
                        document_type = NULL,
                        error_message = NULL
                    WHERE id = :did
                """),
                {"did": doc_id},
            )

        session.commit()
        print(f"\nReset {len(affected)} documents to 'processing' and deleted old extractions.")
        print("The upload processor worker will re-extract and create transactions.")


def main():
    parser = argparse.ArgumentParser(description="MyBookkeeper data migration CLI")
    parser.add_argument("--dry-run", action="store_true", help="Preview changes without applying")

    subparsers = parser.add_subparsers(dest="command", required=True)

    subparsers.add_parser("cleanup-duplicates", help="Remove duplicate documents by content hash")

    p = subparsers.add_parser("recompute-tax", help="Trigger tax form recomputation")
    p.add_argument("--year", required=True, help="Tax year to recompute")

    subparsers.add_parser(
        "reprocess-completed-without-transactions",
        help="Reset completed docs with extractions but no transactions for re-processing",
    )

    args = parser.parse_args()
    commands = {
        "cleanup-duplicates": cmd_cleanup_duplicates,
        "recompute-tax": cmd_recompute_tax,
        "reprocess-completed-without-transactions": cmd_reprocess_completed_without_transactions,
    }
    commands[args.command](args)


if __name__ == "__main__":
    main()
