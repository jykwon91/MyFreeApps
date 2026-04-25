"""
Data inspection CLI for MyBookkeeper.

Usage:
    python -m app.cli.inspect users
    python -m app.cli.inspect events --since 24h
    python -m app.cli.inspect documents --status failed
    python -m app.cli.inspect extractions --user <id>
    python -m app.cli.inspect tax-forms --year 2025
    python -m app.cli.inspect costs --period month
"""
import argparse
import sys
from datetime import datetime, timedelta

from sqlalchemy import func, desc

from app.cli.db import SyncSession
from app.models.user.user import User
from app.models.documents.document import Document
from app.models.system.system_event import SystemEvent
from app.models.extraction.extraction import Extraction
from app.models.transactions.transaction import Transaction


def _parse_duration(s: str) -> timedelta:
    """Parse duration like '24h', '7d', '30m'."""
    units = {"m": "minutes", "h": "hours", "d": "days"}
    num = int(s[:-1])
    unit = units.get(s[-1], "hours")
    return timedelta(**{unit: num})


def cmd_users(args):
    with SyncSession() as session:
        users = session.query(User).all()
        if not users:
            print("No users found.")
            return
        print(f"{'ID':<38} {'Email':<35} {'Name':<20} {'Role':<8} {'Active'}")
        print("-" * 120)
        for u in users:
            print(f"{str(u.id):<38} {u.email:<35} {(u.name or ''):<20} {(u.role or ''):<8} {u.is_active}")


def cmd_events(args):
    with SyncSession() as session:
        query = session.query(SystemEvent).order_by(desc(SystemEvent.created_at))
        if args.since:
            cutoff = datetime.utcnow() - _parse_duration(args.since)
            query = query.filter(SystemEvent.created_at >= cutoff)
        if args.severity:
            query = query.filter(SystemEvent.severity == args.severity)
        if args.unresolved:
            query = query.filter(SystemEvent.resolved == False)  # noqa: E712
        events = query.limit(args.limit).all()
        if not events:
            print("No events found.")
            return
        print(f"{'Time':<22} {'Severity':<10} {'Type':<25} {'Message'}")
        print("-" * 120)
        for e in events:
            ts = e.created_at.strftime("%Y-%m-%d %H:%M:%S") if e.created_at else "?"
            msg = (e.message or "")[:60]
            print(f"{ts:<22} {(e.severity or ''):<10} {(e.event_type or ''):<25} {msg}")


def cmd_documents(args):
    with SyncSession() as session:
        query = session.query(Document).order_by(desc(Document.created_at))
        if args.status:
            query = query.filter(Document.status == args.status)
        if args.user:
            query = query.filter(Document.user_id == args.user)
        docs = query.limit(args.limit).all()
        if not docs:
            print("No documents found.")
            return
        print(f"{'ID':<38} {'Status':<15} {'File Name':<40} {'Created'}")
        print("-" * 120)
        for d in docs:
            ts = d.created_at.strftime("%Y-%m-%d %H:%M") if d.created_at else "?"
            print(f"{str(d.id):<38} {(d.status or ''):<15} {(d.file_name or '')[:40]:<40} {ts}")


def cmd_extractions(args):
    with SyncSession() as session:
        query = session.query(Extraction).order_by(desc(Extraction.created_at))
        if args.user:
            query = query.filter(Extraction.user_id == args.user)
        if args.status:
            query = query.filter(Extraction.status == args.status)
        extractions = query.limit(args.limit).all()
        if not extractions:
            print("No extractions found.")
            return
        print(f"{'ID':<38} {'Status':<12} {'Type':<18} {'Confidence':<12} {'Tokens':<8} {'Created'}")
        print("-" * 120)
        for e in extractions:
            ts = e.created_at.strftime("%Y-%m-%d %H:%M") if e.created_at else "?"
            print(f"{str(e.id):<38} {(e.status or ''):<12} {(e.document_type or ''):<18} {(e.confidence or ''):<12} {(e.tokens_used or 0):<8} {ts}")


def cmd_tax_forms(args):
    with SyncSession() as session:
        # Use raw SQL since TaxFormInstance model path may vary
        result = session.execute(
            session.bind.raw_connection().cursor().execute(  # type: ignore
                "SELECT id, tax_return_id, form_type, status, created_at FROM tax_form_instances ORDER BY created_at DESC LIMIT %s",
                (args.limit,),
            )
        )
        # Simpler approach: query via text
        from sqlalchemy import text
        rows = session.execute(
            text("SELECT id, form_type, status, created_at FROM tax_form_instances ORDER BY created_at DESC LIMIT :limit"),
            {"limit": args.limit},
        ).fetchall()
        if not rows:
            print("No tax form instances found.")
            return
        print(f"{'ID':<38} {'Form Type':<20} {'Status':<15} {'Created'}")
        print("-" * 90)
        for r in rows:
            ts = r[3].strftime("%Y-%m-%d %H:%M") if r[3] else "?"
            print(f"{str(r[0]):<38} {(r[1] or ''):<20} {(r[2] or ''):<15} {ts}")


def cmd_costs(args):
    with SyncSession() as session:
        from sqlalchemy import text
        period_days = {"day": 1, "week": 7, "month": 30, "year": 365}.get(args.period, 30)
        cutoff = datetime.utcnow() - timedelta(days=period_days)

        # Token usage from extractions
        row = session.execute(
            text("SELECT COUNT(*), COALESCE(SUM(tokens_used), 0) FROM extractions WHERE created_at >= :cutoff"),
            {"cutoff": cutoff},
        ).fetchone()
        print(f"Cost summary (last {args.period}):")
        print(f"  Extractions: {row[0]}")
        print(f"  Total tokens: {row[1]:,}")

        # By status
        rows = session.execute(
            text("SELECT status, COUNT(*) FROM extractions WHERE created_at >= :cutoff GROUP BY status ORDER BY COUNT(*) DESC"),
            {"cutoff": cutoff},
        ).fetchall()
        if rows:
            print(f"\n  By status:")
            for r in rows:
                print(f"    {r[0]}: {r[1]}")


def main():
    parser = argparse.ArgumentParser(description="MyBookkeeper data inspection CLI")
    subparsers = parser.add_subparsers(dest="command", required=True)

    # users
    subparsers.add_parser("users", help="List all users")

    # events
    p = subparsers.add_parser("events", help="Recent system events")
    p.add_argument("--since", default="24h", help="Time window (e.g., 24h, 7d, 30m)")
    p.add_argument("--severity", help="Filter by severity (info/warning/error/critical)")
    p.add_argument("--unresolved", action="store_true", help="Only show unresolved events")
    p.add_argument("--limit", type=int, default=50, help="Max rows")

    # documents
    p = subparsers.add_parser("documents", help="List documents")
    p.add_argument("--status", help="Filter by status (processing/completed/failed)")
    p.add_argument("--user", help="Filter by user ID")
    p.add_argument("--limit", type=int, default=50, help="Max rows")

    # extractions
    p = subparsers.add_parser("extractions", help="List extractions")
    p.add_argument("--user", help="Filter by user ID")
    p.add_argument("--status", help="Filter by status")
    p.add_argument("--limit", type=int, default=50, help="Max rows")

    # tax-forms
    p = subparsers.add_parser("tax-forms", help="List tax form instances")
    p.add_argument("--year", help="Filter by tax year")
    p.add_argument("--limit", type=int, default=50, help="Max rows")

    # costs
    p = subparsers.add_parser("costs", help="Cost/token usage summary")
    p.add_argument("--period", default="month", help="Time period (day/week/month/year)")

    args = parser.parse_args()
    commands = {
        "users": cmd_users,
        "events": cmd_events,
        "documents": cmd_documents,
        "extractions": cmd_extractions,
        "tax-forms": cmd_tax_forms,
        "costs": cmd_costs,
    }
    commands[args.command](args)


if __name__ == "__main__":
    main()
