"""
Data migration/backfill CLI for MyBookkeeper.

Usage:
    python -m app.cli.migrate_data cleanup-duplicates
    python -m app.cli.migrate_data recompute-tax --year 2025
    python -m app.cli.migrate_data dry-run cleanup-duplicates
    python -m app.cli.migrate_data --dry-run seed-utility-plans
"""
import argparse
import sys
import uuid

from sqlalchemy import text

from app.cli.db import SyncSession
from app.cli.peerless_utility_plan_seed import PEERLESS_UTILITY_PLANS
from app.cli.utility_plan_seed_row import UtilityPlanSeedRow
from app.services.extraction.utility_account_service import normalize_account_number


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


_FIND_PROPERTY = text("""
    SELECT id, user_id, organization_id, name
    FROM properties
    WHERE name ILIKE :frag OR address ILIKE :frag
    ORDER BY name
""")

# service_start_date is NULL for regulated plans, so a plain `=` would never
# match and every re-run would insert a duplicate.
_FIND_EXISTING_PLAN = text("""
    SELECT id FROM utility_plans
    WHERE property_id = :property_id
      AND service_type = :service_type
      AND provider_name = :provider_name
      AND service_start_date IS NOT DISTINCT FROM :service_start_date
      AND deleted_at IS NULL
""")

_INSERT_PLAN = text("""
    INSERT INTO utility_plans (
        id, user_id, organization_id, property_id,
        service_type, provider_name, account_number, plan_name, rate_type,
        energy_charge_cents_per_kwh, tdu_charge_cents_per_kwh,
        avg_price_cents_per_kwh_at_1000, monthly_base_charge_cents,
        term_months, service_start_date, term_end_date,
        early_termination_fee_cents, has_bill_credit,
        min_usage_fee_cents, min_usage_threshold_kwh, notes,
        created_at, updated_at
    ) VALUES (
        :id, :user_id, :organization_id, :property_id,
        :service_type, :provider_name, :account_number, :plan_name, :rate_type,
        :energy_charge_cents_per_kwh, :tdu_charge_cents_per_kwh,
        :avg_price_cents_per_kwh_at_1000, :monthly_base_charge_cents,
        :term_months, :service_start_date, :term_end_date,
        :early_termination_fee_cents, false,
        :min_usage_fee_cents, :min_usage_threshold_kwh, :notes,
        NOW(), NOW()
    )
""")


def _plan_params(row: UtilityPlanSeedRow, prop) -> dict:
    """Bind parameters for one seed row against its resolved property."""
    account = row.account_number
    return {
        "id": str(uuid.uuid4()),
        "user_id": str(prop.user_id),
        "organization_id": str(prop.organization_id),
        "property_id": str(prop.id),
        "service_type": row.service_type,
        "provider_name": row.provider_name,
        # Normalized identically to utility_account_link so the two can be
        # joined on the account number later.
        "account_number": normalize_account_number(account) if account else None,
        "plan_name": row.plan_name,
        "rate_type": row.rate_type,
        "energy_charge_cents_per_kwh": row.energy_charge_cents_per_kwh,
        "tdu_charge_cents_per_kwh": row.tdu_charge_cents_per_kwh,
        "avg_price_cents_per_kwh_at_1000": row.avg_price_cents_per_kwh_at_1000,
        "monthly_base_charge_cents": row.monthly_base_charge_cents,
        "term_months": row.term_months,
        "service_start_date": row.service_start_date,
        "term_end_date": row.term_end_date,
        "early_termination_fee_cents": row.early_termination_fee_cents,
        "min_usage_fee_cents": row.min_usage_fee_cents,
        "min_usage_threshold_kwh": row.min_usage_threshold_kwh,
        "notes": row.notes,
    }


def cmd_seed_utility_plans(args):
    """Insert the Peerless St utility plans transcribed from provider email.

    Idempotent: a row is skipped when a non-deleted plan already exists for the
    same (property, service_type, provider, start date). Re-running after
    adding a property picks up only what is missing.

    A seed row whose property fragment matches zero or more than one property
    is reported and skipped, never guessed — the wrong property would produce a
    renewal alert for a contract that does not exist there.
    """
    inserted = skipped = unresolved = 0

    with SyncSession() as session:
        for row in PEERLESS_UTILITY_PLANS:
            label = f"{row.property_match} / {row.service_type}"
            matches = session.execute(
                _FIND_PROPERTY, {"frag": f"%{row.property_match}%"},
            ).fetchall()

            if len(matches) != 1:
                found = ", ".join(m.name for m in matches) or "nothing"
                print(f"  SKIP {label} — matched {found}; expected exactly one property")
                unresolved += 1
                continue

            prop = matches[0]
            params = _plan_params(row, prop)

            existing = session.execute(_FIND_EXISTING_PLAN, {
                "property_id": params["property_id"],
                "service_type": row.service_type,
                "provider_name": row.provider_name,
                "service_start_date": row.service_start_date,
            }).first()
            if existing:
                print(f"  SKIP {label} — already present on {prop.name}")
                skipped += 1
                continue

            # ASCII arrow on purpose: the Windows console this CLI is run from
            # is cp1252, which has no U+2192 and raises UnicodeEncodeError.
            if args.dry_run:
                print(f"  WOULD INSERT {label} -> {prop.name} ({row.provider_name})")
            else:
                session.execute(_INSERT_PLAN, params)
                print(f"  INSERT {label} -> {prop.name} ({row.provider_name})")
            inserted += 1

        if args.dry_run:
            print(
                f"\n[DRY RUN] Would insert {inserted}; "
                f"{skipped} already present, {unresolved} unresolved."
            )
            return

        session.commit()
        print(
            f"\nInserted {inserted} utility plans; "
            f"{skipped} already present, {unresolved} unresolved."
        )


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

    subparsers.add_parser(
        "seed-utility-plans",
        help="Insert the Peerless St utility plans transcribed from provider email",
    )

    args = parser.parse_args()
    commands = {
        "cleanup-duplicates": cmd_cleanup_duplicates,
        "recompute-tax": cmd_recompute_tax,
        "reprocess-completed-without-transactions": cmd_reprocess_completed_without_transactions,
        "seed-utility-plans": cmd_seed_utility_plans,
    }
    commands[args.command](args)


if __name__ == "__main__":
    main()
